import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { areAllActiveEnvelopesCompleted } from "../_shared/envelopeStatus.ts";
import { getCredential } from "../_shared/get-credential.ts";

// Webhooks use wildcard CORS since they're server-to-server
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-docusign-signature-1, x-docusign-signature-2",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
};

/**
 * Verify DocuSign Connect HMAC.
 * DocuSign signs the raw body with HMAC-SHA256 and sends Base64 in
 * X-DocuSign-Signature-1 / X-DocuSign-Signature-2.
 * Also accept hex for older/misconfigured listeners.
 */
const verifyWebhookSignature = async (
  body: string,
  signature1: string | null,
  signature2: string | null,
  webhookSecret: string,
): Promise<boolean> => {
  if (!webhookSecret) {
    console.warn(
      "DOCUSIGN_WEBHOOK_SECRET not set - skipping signature verification",
    );
    return true;
  }

  if (!signature1 && !signature2) {
    console.error("No webhook signatures provided");
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = new Uint8Array(
      await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(body)),
    );
    const computedBase64 = bytesToBase64(signature);
    const computedHex = bytesToHex(signature);

    const candidates = [signature1, signature2].filter(
      (value): value is string => Boolean(value),
    );

    const isValid = candidates.some(
      (received) =>
        timingSafeEqual(computedBase64, received) ||
        timingSafeEqual(computedHex, received.toLowerCase()),
    );

    if (!isValid) {
      console.error("Webhook signature verification failed", {
        computedBase64,
        received1: signature1,
        received2: signature2,
      });
    }

    return isValid;
  } catch (error) {
    console.error("Error verifying webhook signature:", error);
    return false;
  }
};

/**
 * Persist envelope status + webhook audit fields.
 * Always records last_webhook_event even when status is unchanged.
 */
const updateEnvelopeStatus = async (
  envelopeId: string,
  status: string,
  eventName: string | null,
  webhookPayload: Record<string, unknown>,
) => {
  const normalizedStatus = status?.toLowerCase() || "unknown";
  const now = new Date().toISOString();

  const { data: existingEnvelope, error: fetchError } = await supabaseAdmin
    .from("docusign_envelopes")
    .select("id, application_id, status, envelope_type, metadata")
    .eq("envelope_id", envelopeId)
    .maybeSingle();

  if (fetchError) {
    console.error(`Error fetching envelope ${envelopeId}:`, fetchError);
    return null;
  }

  if (!existingEnvelope) {
    console.warn(`Envelope ${envelopeId} not found in database`);
    return null;
  }

  if (existingEnvelope.status?.toLowerCase() === "superseded") {
    console.log(
      `Ignoring webhook update for superseded envelope ${envelopeId}`,
    );
    return existingEnvelope;
  }

  const previousMetadata =
    existingEnvelope.metadata &&
      typeof existingEnvelope.metadata === "object" &&
      !Array.isArray(existingEnvelope.metadata)
      ? existingEnvelope.metadata as Record<string, unknown>
      : {};

  const webhookEventRecord = {
    event: eventName,
    status: normalizedStatus,
    received_at: now,
    payload: webhookPayload,
  };

  const mergedMetadata = {
    ...previousMetadata,
    ...webhookPayload,
    last_webhook_event: eventName,
    last_webhook_at: now,
  };

  const statusChanged =
    existingEnvelope.status?.toLowerCase() !== normalizedStatus;

  const { data: updatedEnvelope, error: updateError } = await supabaseAdmin
    .from("docusign_envelopes")
    .update({
      status: normalizedStatus,
      metadata: mergedMetadata,
      last_webhook_event: webhookEventRecord,
      updated_at: now,
    })
    .eq("envelope_id", envelopeId)
    .select("*")
    .single();

  if (updateError) {
    console.error(`Error updating envelope ${envelopeId}:`, updateError);
    return null;
  }

  if (statusChanged) {
    console.log(
      `✅ Envelope ${envelopeId} (${existingEnvelope.envelope_type}) status updated: ${existingEnvelope.status} → ${normalizedStatus}`,
    );
  } else {
    console.log(
      `Envelope ${envelopeId} status unchanged (${normalizedStatus}); recorded webhook event ${eventName}`,
    );
  }

  return updatedEnvelope;
};

const updateApplicationStatus = async (applicationId: string) => {
  const { data: application, error: appError } = await supabaseAdmin
    .from("student_applications")
    .select("status, student_id")
    .eq("id", applicationId)
    .single();

  if (appError || !application) {
    console.error("Error fetching application:", appError);
    return;
  }

  if (
    application.status === "confirmed" ||
    application.status === "cancelled" ||
    application.status === "expired"
  ) {
    console.log(
      `Application ${applicationId} is in terminal state (${application.status}), skipping automatic status update`,
    );
    return;
  }

  const { data: envelopes, error: envelopesError } = await supabaseAdmin
    .from("docusign_envelopes")
    .select("envelope_type, status")
    .eq("application_id", applicationId);

  if (envelopesError) {
    console.error("Error fetching envelopes:", envelopesError);
    return;
  }

  if (!envelopes || envelopes.length === 0) {
    return;
  }

  const allCompleted = areAllActiveEnvelopesCompleted(envelopes);

  if (!allCompleted) {
    return;
  }

  if (
    application.status === "awaiting_signature" ||
    application.status === "awaiting_deposit" ||
    application.status === "draft"
  ) {
    const { error: updateError } = await supabaseAdmin
      .from("student_applications")
      .update({ status: "awaiting_verification" })
      .eq("id", applicationId);

    if (updateError) {
      console.error("Error updating application status:", updateError);
      return;
    }

    console.log(
      `✅ Application ${applicationId} status updated to awaiting_verification`,
    );

    if (application.student_id) {
      supabaseAdmin
        .from("student_application_steps")
        .select("payload")
        .eq("application_id", applicationId)
        .eq("step_number", 1)
        .single()
        .then(({ data: step1 }) => {
          const step1Data = step1?.payload as Record<string, unknown> | null;
          const firstName =
            typeof step1Data?.first_name === "string"
              ? step1Data.first_name
              : "";
          const lastName =
            typeof step1Data?.last_name === "string" ? step1Data.last_name : "";
          const studentName =
            firstName && lastName ? `${firstName} ${lastName}` : "Student";

          return supabaseAdmin.functions.invoke("send-transactional-email", {
            body: {
              user_id: application.student_id,
              email_type: "signature_completed",
              variables: {
                student_name: studentName,
              },
              create_notification: true,
            },
          });
        })
        .catch((emailError) => {
          console.error(
            "Error sending signature completed email (async):",
            emailError,
          );
        });
    }
  }
};

const extractEnvelopeStatus = (
  event: string | null,
  webhookData: Record<string, unknown>,
): string | null => {
  const data = (webhookData.data ?? {}) as Record<string, unknown>;
  if (typeof data.status === "string" && data.status.trim()) {
    return data.status.toLowerCase();
  }
  if (typeof webhookData.status === "string" && webhookData.status.trim()) {
    return webhookData.status.toLowerCase();
  }

  switch ((event ?? "").toLowerCase()) {
    case "envelope-completed":
    case "envelope_completed":
    case "envelopecompleted":
      return "completed";
    case "envelope-sent":
    case "envelope_sent":
    case "envelopesent":
    case "recipient-sent":
    case "recipient_sent":
      return "sent";
    case "envelope-delivered":
    case "envelope_delivered":
    case "envelopedelivered":
    case "recipient-delivered":
    case "recipient_delivered":
      return "delivered";
    case "envelope-declined":
    case "envelope_declined":
    case "envelopedeclined":
    case "recipient-declined":
    case "recipient_declined":
      return "declined";
    case "envelope-voided":
    case "envelope_voided":
    case "envelopevoided":
      return "voided";
    default:
      return null;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const signature1 = req.headers.get("x-docusign-signature-1");
    const signature2 = req.headers.get("x-docusign-signature-2");
    const body = await req.text();

    const webhookSecret = await getCredential("docusign_webhook_secret", {
      supabase: supabaseAdmin,
      fallback: Deno.env.get("DOCUSIGN_WEBHOOK_SECRET") ?? "",
    });

    const isValid = await verifyWebhookSignature(
      body,
      signature1,
      signature2,
      webhookSecret,
    );
    if (!isValid) {
      console.error("Invalid webhook signature - rejecting request");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let webhookData: Record<string, unknown>;
    try {
      webhookData = JSON.parse(body) as Record<string, unknown>;
    } catch (parseError) {
      console.error("Error parsing webhook payload:", parseError);
      return new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const event =
      (typeof webhookData.event === "string" ? webhookData.event : null) ||
      (typeof webhookData.eventType === "string"
        ? webhookData.eventType
        : null);
    const data = (webhookData.data ?? {}) as Record<string, unknown>;
    const envelopeId =
      (typeof data.envelopeId === "string" ? data.envelopeId : null) ||
      (typeof webhookData.envelopeId === "string"
        ? webhookData.envelopeId
        : null);

    console.log("📨 DocuSign webhook received:", {
      event,
      envelopeId,
      status: data.status,
      timestamp: new Date().toISOString(),
    });

    if (!envelopeId) {
      console.warn("Webhook missing envelopeId, ignoring");
      return new Response(
        JSON.stringify({ received: true, message: "No envelopeId provided" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const status = extractEnvelopeStatus(event, webhookData);
    if (!status) {
      console.log(
        `Webhook event '${event}' acknowledged without status update`,
      );
      return new Response(
        JSON.stringify({
          received: true,
          message: `Webhook event '${event}' acknowledged`,
          envelopeId,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const payloadForMetadata =
      data && typeof data === "object" && !Array.isArray(data)
        ? data
        : webhookData;

    const updatedEnvelope = await updateEnvelopeStatus(
      envelopeId,
      status,
      event,
      payloadForMetadata,
    );

    if (updatedEnvelope?.application_id && status === "completed") {
      await updateApplicationStatus(updatedEnvelope.application_id);
    } else if (
      updatedEnvelope?.application_id &&
      (event ?? "").toLowerCase().includes("completed")
    ) {
      await updateApplicationStatus(updatedEnvelope.application_id);
    }

    return new Response(
      JSON.stringify({
        received: true,
        message: `Webhook event '${event}' processed`,
        envelopeId,
        status,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error processing DocuSign webhook:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
