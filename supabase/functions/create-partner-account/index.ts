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

    const { partner_id, email, first_name, last_name } = await req.json();

    if (!partner_id || !email || !first_name || !last_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
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

    // Check if account already exists
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("partner_id", partner_id)
      .maybeSingle();

    if (existingProfile) {
      return new Response(
        JSON.stringify({ error: "Partner account already exists" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Create auth user
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
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        role: "partner",
        partner_id: partner_id,
        first_name,
        last_name,
      })
      .eq("id", authData.user.id);

    if (profileError) {
      // Clean up auth user if profile update fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ error: "Failed to link profile to partner" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Generate password reset link
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (resetError) {
      console.warn("Failed to generate password reset link:", resetError);
      // Don't fail the whole operation, account is created
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: authData.user.id,
        reset_link: resetData?.properties?.action_link,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

