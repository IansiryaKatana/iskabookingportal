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

    const { action, email, role, userId, first_name, last_name } = requestBody;

    if (!action || (action !== "invite" && action !== "create" && action !== "delete" && action !== "update")) {
      return new Response(
        JSON.stringify({ error: "Invalid action. Must be 'create', 'invite', 'update', or 'delete'." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Handle create action (changed from invite to create)
    if (action === "invite" || action === "create") {
      if (!email) {
        return new Response(
          JSON.stringify({ error: "Email is required for create action." }),
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

      const normalizedEmail = email.toLowerCase().trim();

      // Check if user already exists by listing users and filtering by email
      const { data: usersList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      
      if (listError) {
        console.warn("Error listing users:", listError);
        // Continue anyway - we'll catch the error when trying to create
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

      // Generate a random temporary password
      const tempPassword = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');

      // Create user directly with email confirmed
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password: tempPassword,
        email_confirm: true, // Mark email as confirmed
        user_metadata: {
          role,
          first_name: first_name || null,
          last_name: last_name || null,
        },
      });

      if (createError) {
        return new Response(
          JSON.stringify({ error: createError.message || "Failed to create user" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (!createData.user) {
        return new Response(
          JSON.stringify({ error: "User creation failed - no user returned" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Insert or update profile with role and names
      // Use upsert to handle both new profiles (from trigger) and existing ones
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert({
          id: createData.user.id,
          role: role,
          first_name: first_name?.trim() || null,
          last_name: last_name?.trim() || null,
        }, {
          onConflict: "id",
        });

      if (profileError) {
        console.error("Failed to upsert profile:", profileError);
        // This is critical - try to update as fallback
        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({
            role: role,
            first_name: first_name?.trim() || null,
            last_name: last_name?.trim() || null,
          })
          .eq("id", createData.user.id);

        if (updateError) {
          console.error("Failed to update profile as fallback:", updateError);
          return new Response(
            JSON.stringify({ error: "User created but failed to set profile. Please update manually." }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }

      // Note: Password reset email will be sent automatically by Supabase
      // when the user requests it via the "Forgot Password" flow
      // For now, we create the user and they can request password reset manually
      console.log("User created successfully. They can request password reset via the portal.");

      // Log user creation
      await supabaseAdmin
        .from("staff_activity_logs")
        .insert({
          staff_id: user.id,
          action: "create",
          entity_type: "user",
          entity_id: createData.user.id,
          payload: {
            email: normalizedEmail,
            first_name: first_name?.trim() || null,
            last_name: last_name?.trim() || null,
            role,
            action_type: "create",
          },
        });

      return new Response(
        JSON.stringify({
          success: true,
          user: createData.user,
          message: "User created successfully. They can use 'Forgot Password' to set their password.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Handle update action
    if (action === "update") {
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "userId is required for update action." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (!first_name && !last_name && !role) {
        return new Response(
          JSON.stringify({ error: "At least one field (first_name, last_name, or role) is required for update." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (role && role !== "staff" && role !== "superadmin") {
        return new Response(
          JSON.stringify({ error: "Role must be 'staff' or 'superadmin'." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Get current profile to preserve existing values
      const { data: currentProfile, error: fetchError } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name, role")
        .eq("id", userId)
        .single();

      if (fetchError || !currentProfile) {
        return new Response(
          JSON.stringify({ error: "User profile not found." }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Update profile with new values
      const updateData: any = {};
      if (first_name !== undefined) {
        updateData.first_name = first_name?.trim() || null;
      }
      if (last_name !== undefined) {
        updateData.last_name = last_name?.trim() || null;
      }
      if (role) {
        updateData.role = role;
      }

      const { data: updatedProfile, error: updateError } = await supabaseAdmin
        .from("profiles")
        .update(updateData)
        .eq("id", userId)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating profile:", updateError);
        return new Response(
          JSON.stringify({ error: updateError.message || "Failed to update user profile" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Log user update
      await supabaseAdmin
        .from("staff_activity_logs")
        .insert({
          staff_id: user.id,
          action: "update",
          entity_type: "user",
          entity_id: userId,
          payload: {
            updated_fields: updateData,
            previous_values: {
              first_name: currentProfile.first_name,
              last_name: currentProfile.last_name,
              role: currentProfile.role,
            },
          },
        });

      return new Response(
        JSON.stringify({
          success: true,
          message: "User updated successfully",
          user: updatedProfile,
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

      // Log user deletion
      await supabaseAdmin
        .from("staff_activity_logs")
        .insert({
          staff_id: user.id,
          action: "delete",
          entity_type: "user",
          entity_id: userId,
          payload: {
            deleted_user: {
              first_name: userProfile?.first_name,
              last_name: userProfile?.last_name,
              role: userProfile?.role,
            },
          },
        });

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

