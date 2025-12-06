import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Verify authentication (admin only)
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized. Authentication required." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized. Invalid token." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Check if user is admin or superadmin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Error fetching profile:", profileError);
      return new Response(
        JSON.stringify({ error: "Failed to verify user permissions" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!profile || (profile.role !== "staff" && profile.role !== "superadmin")) {
      return new Response(
        JSON.stringify({ error: "Forbidden. Admin access required." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: "Invalid request body. Expected JSON." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { action, email, role, userId } = requestBody;

    if (!action || (action !== "invite" && action !== "delete")) {
      return new Response(
        JSON.stringify({ error: "Invalid action. Must be 'invite' or 'delete'." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Handle invite action
    if (action === "invite") {
      if (!email) {
        return new Response(
          JSON.stringify({ error: "Email is required for invite action." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (!role || (role !== "staff" && role !== "superadmin")) {
        return new Response(
          JSON.stringify({ error: "Role must be 'staff' or 'superadmin'." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({ error: "Invalid email format" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Check if user already exists by listing users and filtering by email
      // Note: This is less efficient but getUserByEmail may not be available in all Supabase versions
      const normalizedEmail = email.toLowerCase().trim();
      const { data: usersList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      
      if (listError) {
        console.error("Error listing users:", listError);
        // Continue anyway - we'll catch the error when trying to invite
      } else {
        const existingUser = usersList?.users?.find(u => u.email?.toLowerCase() === normalizedEmail);
        
        if (existingUser) {
          return new Response(
            JSON.stringify({ error: "User with this email already exists." }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }

      // Invite user by email
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        normalizedEmail,
        {
          data: { role },
        }
      );

      if (inviteError) {
        // Check if error is due to user already existing
        if (inviteError.message?.includes("already registered") || 
            inviteError.message?.includes("already exists") ||
            inviteError.message?.includes("User already registered")) {
          return new Response(
            JSON.stringify({ error: "User with this email already exists." }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
        
        return new Response(
          JSON.stringify({ error: inviteError.message || "Failed to invite user" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Update profile role if user was created
      if (inviteData.user) {
        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .update({ role })
          .eq("id", inviteData.user.id);

        if (profileError) {
          console.warn("Failed to update profile role:", profileError);
          // Don't fail the whole operation, invitation was sent
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          user: inviteData.user,
          message: "Invitation sent successfully",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Handle delete action
    if (action === "delete") {
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "userId is required for delete action." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Get user profile before deletion for logging
      const { data: userProfile } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name, role")
        .eq("id", userId)
        .maybeSingle();

      // Delete user from auth (this will cascade delete profile via trigger)
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

      if (deleteError) {
        return new Response(
          JSON.stringify({ error: deleteError.message || "Failed to delete user" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "User deleted successfully",
          deletedUser: {
            id: userId,
            first_name: userProfile?.first_name,
            last_name: userProfile?.last_name,
            role: userProfile?.role,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error("Unexpected error in manage-users:", error);
    return new Response(
      JSON.stringify({
        error: error?.message || "An unexpected error occurred",
        details: error?.toString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

