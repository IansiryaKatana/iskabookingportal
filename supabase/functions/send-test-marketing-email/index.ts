import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

// Sends a one-off TEST copy of a marketing email template to internal
// recipients (staff / admin). Only authenticated staff or admin users may
// call this. Variables are filled with sample data so the layout can be
// reviewed in a real inbox before a campaign goes out.

const MAX_TEST_RECIPIENTS = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // --- Authenticate + authorize the caller (must be staff/admin) ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing authorization token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user: caller }, error: callerError } = await supabase.auth.getUser(jwt);
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (!callerProfile || !["superadmin", "admin", "staff"].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: "Only staff or admin can send test emails" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Parse and validate input ---
    const body = await req.json();
    const {
      template_id,
      subject: inlineSubject,
      body_html: inlineHtml,
      body_text: inlineText,
      to = [],
    } = body ?? {};

    const recipients = Array.from(
      new Set(
        (Array.isArray(to) ? to : [to])
          .map((email: unknown) => String(email ?? "").trim().toLowerCase())
          .filter((email: string) => EMAIL_REGEX.test(email)),
      ),
    );

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ error: "No valid recipient email addresses provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (recipients.length > MAX_TEST_RECIPIENTS) {
      return new Response(
        JSON.stringify({ error: `Too many recipients. Max ${MAX_TEST_RECIPIENTS} for a test send.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Resolve the template content ---
    let subject = inlineSubject ?? "";
    let html = inlineHtml ?? "";
    let text = inlineText ?? "";

    if (template_id) {
      const { data: template, error: templateError } = await supabase
        .from("marketing_email_templates")
        .select("subject, body_html, body_text")
        .eq("id", template_id)
        .single();
      if (templateError || !template) {
        throw templateError ?? new Error("Template not found");
      }
      subject = template.subject;
      html = template.body_html;
      text = template.body_text || template.body_html.replace(/<[^>]*>/g, " ");
    }

    if (!subject || !html) {
      return new Response(JSON.stringify({ error: "Template has no subject or body to send" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Resend credentials + branding ---
    const { data: credentials } = await supabase
      .from("credentials")
      .select("credential_key, credential_value")
      .in("credential_key", ["resend_api_key", "resend_from_email"]);

    const credsMap = new Map((credentials ?? []).map((row) => [row.credential_key, row.credential_value]));
    const resendApiKey = credsMap.get("resend_api_key") || Deno.env.get("RESEND_API_KEY");
    const fromEmail = credsMap.get("resend_from_email") || Deno.env.get("RESEND_FROM_EMAIL") || "noreply@send.portal.urbanhub.uk";

    if (!resendApiKey) throw new Error("Resend API key is not configured");

    const { data: brandingSettings } = await supabase
      .from("branding_settings")
      .select("setting_value")
      .eq("setting_key", "company_name")
      .single();
    const companyName = brandingSettings?.setting_value || "STUCOMMS";
    const formattedFrom = fromEmail.includes("<") ? fromEmail : `${companyName} <${fromEmail}>`;
    const fromAddressOnly = fromEmail.includes("<")
      ? fromEmail.split("<")[1]?.replace(">", "").trim() || fromEmail
      : fromEmail;

    // --- Fill variables with sample data (mirrors campaign variables) ---
    const fillSampleVariables = (value: string, recipientEmail: string) =>
      value
        .replace(/\{full_name\}/gi, "Test Recipient")
        .replace(/\{student_name\}/gi, "Test Recipient")
        .replace(/\{email\}/gi, recipientEmail)
        .replace(/\{campaign_name\}/gi, "Test Campaign")
        .replace(/\{company_name\}/gi, companyName)
        .replace(/\{current_year\}/gi, new Date().getFullYear().toString());

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const recipient of recipients) {
      try {
        const payload = {
          from: formattedFrom,
          to: recipient,
          reply_to: fromAddressOnly,
          subject: `[TEST] ${fillSampleVariables(subject, recipient)}`,
          html: fillSampleVariables(html, recipient),
          text: fillSampleVariables(text || html.replace(/<[^>]*>/g, " "), recipient),
        };

        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!resendResponse.ok) {
          const errorBody = await resendResponse.text();
          failed += 1;
          errors.push(`${recipient}: ${errorBody.slice(0, 200)}`);
          continue;
        }
        sent += 1;
      } catch (error) {
        failed += 1;
        errors.push(`${recipient}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }

      // Stay under Resend rate limits
      await new Promise((resolve) => setTimeout(resolve, 650));
    }

    return new Response(
      JSON.stringify({ message: "Test send processed", sent, failed, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("send-test-marketing-email error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
