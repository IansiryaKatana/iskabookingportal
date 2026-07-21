import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

type MarketingRecipient = {
  id: string;
  email: string;
  full_name: string | null;
};

// Deno Edge Runtime background-task API (keeps the instance alive after the
// response is returned so we can send emails without the client waiting).
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

// Process recipients in bounded batches so a single invocation never runs long
// enough to hit the edge-function time limit. When more recipients remain after a
// batch, the function re-invokes itself to continue (it is resumable because only
// "pending" recipients are ever processed).
const BATCH_SIZE = 100;
const SEND_DELAY_MS = 650; // stay under Resend rate limits (~1.5/sec)

// Runs one batch in the background and chains the next invocation if needed.
async function processCampaignBatch(campaign_id: string) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const countRecipients = async (status?: string) => {
      let query = supabase
        .from("marketing_campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign_id);
      if (status) query = query.eq("send_status", status);
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    };

    const finalizeCampaign = async () => {
      const [total, sentTotal, failedTotal] = await Promise.all([
        countRecipients(),
        countRecipients("sent"),
        countRecipients("failed"),
      ]);
      await supabase
        .from("marketing_campaigns")
        .update({
          status: failedTotal > 0 && sentTotal === 0 ? "failed" : "completed",
          total_recipients: total,
          emails_sent: sentTotal,
          failed_count: failedTotal,
          sent_at: new Date().toISOString(),
        })
        .eq("id", campaign_id);
    };

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

    // Record the real recipient total + sending status up-front so the UI reflects
    // it immediately (rather than showing 0 until the very end).
    const totalRecipients = await countRecipients();
    await supabase
      .from("marketing_campaigns")
      .update({ status: "sending", total_recipients: totalRecipients })
      .eq("id", campaign_id);

    // Fetch only the next batch of pending recipients (bounded to BATCH_SIZE).
    const { data: recipients, error: recipientsError } = await supabase
      .from("marketing_campaign_recipients")
      .select("id, email, full_name")
      .eq("campaign_id", campaign_id)
      .eq("send_status", "pending")
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);

    if (recipientsError) throw recipientsError;

    const batch = (recipients ?? []) as MarketingRecipient[];

    if (batch.length === 0) {
      // Nothing left to send — finalize using authoritative DB counts.
      await finalizeCampaign();
      return;
    }

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

    for (const recipient of batch) {
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

      await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
    }

    const remaining = await countRecipients("pending");

    if (remaining > 0) {
      // More recipients to go — record progress and continue in a fresh invocation.
      const [sentTotal, failedTotal] = await Promise.all([
        countRecipients("sent"),
        countRecipients("failed"),
      ]);
      await supabase
        .from("marketing_campaigns")
        .update({ status: "sending", emails_sent: sentTotal, failed_count: failedTotal })
        .eq("id", campaign_id);

      // Fire-and-forget self re-invocation to process the next batch.
      await supabase.functions
        .invoke("send-marketing-campaign", { body: { campaign_id } })
        .catch((err) => console.error("Failed to chain next batch:", err));

      return;
    }

    await finalizeCampaign();
  } catch (error) {
    console.error("send-marketing-campaign error:", error);
    // Surface a hard failure so the campaign doesn't appear stuck on "sending".
    try {
      await supabase
        .from("marketing_campaigns")
        .update({ status: "failed" })
        .eq("id", campaign_id);
    } catch (_) {
      // ignore secondary failure
    }
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

  try {
    const { campaign_id } = await req.json();
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send in the background so the client isn't held open (avoids gateway 504s).
    // The task processes one batch and chains itself until all recipients are done.
    EdgeRuntime.waitUntil(processCampaignBatch(campaign_id));

    return new Response(
      JSON.stringify({ message: "Campaign send started", campaign_id }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("send-marketing-campaign invoke error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
