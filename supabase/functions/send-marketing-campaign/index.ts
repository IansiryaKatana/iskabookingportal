import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

type MarketingRecipient = {
  id: string;
  email: string;
  full_name: string | null;
};

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

    const { campaign_id } = await req.json();
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("marketing_campaigns")
      .select("id, name, template_id")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign) throw campaignError ?? new Error("Campaign not found");

    const { data: template, error: templateError } = await supabase
      .from("marketing_email_templates")
      .select("subject, body_html, body_text, is_active")
      .eq("id", campaign.template_id)
      .single();

    if (templateError || !template || !template.is_active) {
      throw templateError ?? new Error("Template not found or inactive");
    }

    const { data: recipients, error: recipientsError } = await supabase
      .from("marketing_campaign_recipients")
      .select("id, email, full_name")
      .eq("campaign_id", campaign_id)
      .eq("send_status", "pending");

    if (recipientsError) throw recipientsError;

    const pendingRecipients = (recipients ?? []) as MarketingRecipient[];

    if (pendingRecipients.length === 0) {
      await supabase
        .from("marketing_campaigns")
        .update({
          status: "completed",
          total_recipients: 0,
          emails_sent: 0,
          failed_count: 0,
          sent_at: new Date().toISOString(),
        })
        .eq("id", campaign_id);

      return new Response(JSON.stringify({ message: "No pending recipients", sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("marketing_campaigns").update({ status: "sending" }).eq("id", campaign_id);

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

    let sent = 0;
    let failed = 0;

    const replaceVariables = (value: string, recipient: MarketingRecipient) => {
      return value
        .replace(/\{full_name\}/gi, recipient.full_name || "there")
        .replace(/\{email\}/gi, recipient.email)
        .replace(/\{campaign_name\}/gi, campaign.name)
        .replace(/\{company_name\}/gi, companyName)
        .replace(/\{current_year\}/gi, new Date().getFullYear().toString());
    };

    for (const recipient of pendingRecipients) {
      try {
        const payload = {
          from: formattedFrom,
          to: recipient.email,
          reply_to: fromAddressOnly,
          subject: replaceVariables(template.subject, recipient),
          html: replaceVariables(template.body_html, recipient),
          text: replaceVariables(template.body_text || template.body_html.replace(/<[^>]*>/g, " "), recipient),
          headers: {
            "List-Unsubscribe": `<mailto:${fromAddressOnly}?subject=unsubscribe>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
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
          await supabase
            .from("marketing_campaign_recipients")
            .update({ send_status: "failed", error_message: errorBody.slice(0, 500) })
            .eq("id", recipient.id);
          continue;
        }

        const data = await resendResponse.json();
        sent += 1;
        await supabase
          .from("marketing_campaign_recipients")
          .update({
            send_status: "sent",
            resend_message_id: data?.id ?? null,
            sent_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", recipient.id);
      } catch (error) {
        failed += 1;
        await supabase
          .from("marketing_campaign_recipients")
          .update({
            send_status: "failed",
            error_message: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
          })
          .eq("id", recipient.id);
      }

      // Keep below typical API rate limits
      await new Promise((resolve) => setTimeout(resolve, 650));
    }

    await supabase
      .from("marketing_campaigns")
      .update({
        status: failed > 0 && sent === 0 ? "failed" : "completed",
        total_recipients: pendingRecipients.length,
        emails_sent: sent,
        failed_count: failed,
        sent_at: new Date().toISOString(),
      })
      .eq("id", campaign_id);

    return new Response(JSON.stringify({ message: "Campaign processed", sent, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-marketing-campaign error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
