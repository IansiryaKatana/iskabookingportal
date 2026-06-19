import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { resolvePortalUrl } from "../_shared/recovery-link.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

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
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

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
      console.log("Received request body:", JSON.stringify(requestBody));
    } catch (parseError) {
      console.error("Error parsing request body:", parseError);
      return new Response(
        JSON.stringify({ error: "Invalid request body. Expected JSON." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { partner_id, email, first_name, last_name } = requestBody;
    console.log("Extracted fields:", { partner_id, email, first_name, last_name });

    // Validate required fields with detailed error messages
    const missingFields = [];
    if (!partner_id) missingFields.push("partner_id");
    if (!email) missingFields.push("email");
    if (!first_name) missingFields.push("first_name");
    if (!last_name) missingFields.push("last_name");

    if (missingFields.length > 0) {
      const errorResponse = { 
        error: `Missing required fields: ${missingFields.join(", ")}`,
        received: { partner_id, email, first_name, last_name }
      };
      console.error("Validation failed:", errorResponse);
      return new Response(
        JSON.stringify(errorResponse),
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

    // Check if partner exists and is active
    const { data: partner, error: partnerError } = await supabaseAdmin
      .from("partners")
      .select("id, name, is_active")
      .eq("id", partner_id)
      .single();

    if (partnerError || !partner) {
      return new Response(
        JSON.stringify({ error: "Partner not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!partner.is_active) {
      return new Response(
        JSON.stringify({ error: "Partner is not active" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Check if account already exists for this partner
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, email:auth.users!inner(email)")
      .eq("partner_id", partner_id)
      .maybeSingle();

    if (existingProfile) {
      return new Response(
        JSON.stringify({ error: "Partner account already exists for this partner" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Try to create new auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: crypto.randomUUID(), // Random password, will be reset
      email_confirm: true,
      user_metadata: {
        first_name,
        last_name,
        role: "partner",
      },
    });

    // If user already exists, handle it
    if (authError && (authError.message?.includes("already registered") || 
                      authError.message?.includes("already exists") ||
                      authError.message?.includes("User already registered"))) {
      
      // Find the existing user by email
      const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = usersList?.users?.find(u => u.email === email);

      if (!existingUser) {
        return new Response(
          JSON.stringify({ error: "An account with this email already exists, but could not be found" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Check the existing user's profile
      const { data: existingUserProfile } = await supabaseAdmin
        .from("profiles")
        .select("id, role, partner_id")
        .eq("id", existingUser.id)
        .single();

      if (existingUserProfile) {
        // If already linked to this partner, just send password reset
        if (existingUserProfile.partner_id === partner_id && existingUserProfile.role === "partner") {
          // Send password reset email (this actually sends the email)
          const portalUrl = await resolvePortalUrl(supabaseAdmin);
          const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
            redirectTo: `${portalUrl}/partner/reset-password`,
          });

          if (resetError) {
            console.warn("Failed to send password reset email:", resetError);
            return new Response(
              JSON.stringify({ error: "Account exists but failed to send password reset email" }),
              {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }

          return new Response(
            JSON.stringify({
              success: true,
              user_id: existingUser.id,
              message: "Account already exists. Password reset email sent.",
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        // If linked to different partner or different role, return error
        if (existingUserProfile.role === "partner" && existingUserProfile.partner_id !== partner_id) {
          return new Response(
            JSON.stringify({ error: "This email is already linked to a different partner account" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        if (existingUserProfile.role !== "partner") {
          return new Response(
            JSON.stringify({ error: `This email is already registered as a ${existingUserProfile.role}. Cannot convert to partner account.` }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      } else {
        // User exists but no profile - link them to this partner
        const { error: linkError } = await supabaseAdmin
          .from("profiles")
          .upsert({
            id: existingUser.id,
            role: "partner",
            partner_id: partner_id,
            first_name,
            last_name,
          }, {
            onConflict: "id"
          });

        if (linkError) {
          return new Response(
            JSON.stringify({ error: "Failed to link existing account to partner" }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        // Send password reset email (this actually sends the email)
        const portalUrl = await resolvePortalUrl(supabaseAdmin);
        const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
          redirectTo: `${portalUrl}/partner/reset-password`,
        });

        if (resetError) {
          console.warn("Failed to send password reset email:", resetError);
        }

        return new Response(
          JSON.stringify({
            success: true,
            user_id: existingUser.id,
            message: "Existing account linked to partner. Password reset email sent.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // If other error creating user
    if (authError || !authData.user) {
      return new Response(
        JSON.stringify({ error: authError?.message || "Failed to create user" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Update profile to link to partner
    // Use upsert in case profile doesn't exist yet (trigger might not have run)
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: authData.user.id,
        role: "partner",
        partner_id: partner_id,
        first_name,
        last_name,
      }, {
        onConflict: "id"
      });

    if (profileError) {
      console.error("Profile upsert error:", profileError);
      // Clean up auth user if profile update fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ 
          error: "Failed to link profile to partner",
          details: profileError.message 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Send password reset email (this actually sends the email)
    const portalUrl = await resolvePortalUrl(supabaseAdmin);
    const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: `${portalUrl}/partner/reset-password`,
    });

    if (resetError) {
      console.warn("Failed to send password reset email:", resetError);
      // Don't fail the whole operation, account is created
      // Log the error but still return success since account was created
    }

    // Log partner account creation
    await supabaseAdmin
      .from("staff_activity_logs")
      .insert({
        staff_id: user.id,
        action: "create",
        entity_type: "partner_account",
        entity_id: authData.user.id,
        payload: {
          partner_id,
          email,
          first_name,
          last_name,
          password_reset_sent: !resetError,
        },
      });

    return new Response(
      JSON.stringify({
        success: true,
        user_id: authData.user.id,
        message: resetError 
          ? "Account created but password reset email failed. Please use 'Reset Password' from Supabase Dashboard."
          : "Account created. Password reset email sent.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Unexpected error in create-partner-account:", error);
    return new Response(
      JSON.stringify({ 
        error: error?.message || "An unexpected error occurred",
        details: error?.toString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

