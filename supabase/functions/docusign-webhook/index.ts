import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-docusign-signature-1, x-docusign-signature-2",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

// DocuSign webhook secret for signature verification
const webhookSecret = Deno.env.get("DOCUSIGN_WEBHOOK_SECRET") ?? "";

/**
 * Verify DocuSign webhook signature
 * DocuSign sends webhooks with HMAC-SHA256 signatures
 */
const verifyWebhookSignature = async (
  body: string,
  signature1: string | null,
  signature2: string | null,
): Promise<boolean> => {
  if (!webhookSecret) {
    console.warn("DOCUSIGN_WEBHOOK_SECRET not set - skipping signature verification");
    return true; // Allow if secret not configured (for development)
  }

  if (!signature1 && !signature2) {
    console.error("No webhook signatures provided");
    return false;
  }

  try {
    // DocuSign uses HMAC-SHA256
    const encoder = new TextEncoder();
    const keyData = encoder.encode(webhookSecret);
    const messageData = encoder.encode(body);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    const computedSignature = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Compare with provided signatures (DocuSign may send two signatures)
    const isValid =
      (signature1 && computedSignature === signature1) ||
      (signature2 && computedSignature === signature2);

    if (!isValid) {
      console.error("Webhook signature verification failed", {
        computed: computedSignature,
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
 * Update envelope status in database
 */
const updateEnvelopeStatus = async (
  envelopeId: string,
  status: string,
  metadata: any,
) => {
  // Normalize status to lowercase
  const normalizedStatus = status?.toLowerCase() || "unknown";

  // Check if envelope exists
  const { data: existingEnvelope, error: fetchError } = await supabaseAdmin
    .from("docusign_envelopes")
    .select("id, application_id, status, envelope_type")
    .eq("envelope_id", envelopeId)
    .single();

  if (fetchError || !existingEnvelope) {
    console.warn(`Envelope ${envelopeId} not found in database`, fetchError);
    return null;
  }

  // Only update if status actually changed (idempotent)
  if (existingEnvelope.status?.toLowerCase() === normalizedStatus) {
    console.log(
      `Envelope ${envelopeId} already has status ${normalizedStatus}, skipping update`,
    );
    return existingEnvelope;
  }

  // Update envelope status
  const { data: updatedEnvelope, error: updateError } = await supabaseAdmin
    .from("docusign_envelopes")
    .update({
      status: normalizedStatus,
      metadata: metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("envelope_id", envelopeId)
    .select("*")
    .single();

  if (updateError) {
    console.error(`Error updating envelope ${envelopeId}:`, updateError);
    return null;
  }

  console.log(
    `✅ Envelope ${envelopeId} (${existingEnvelope.envelope_type}) status updated: ${existingEnvelope.status} → ${normalizedStatus}`,
  );

  return updatedEnvelope;
};

/**
 * Update application status based on envelope completion
 * (Reuses logic from docusign-check-status function)
 */
const updateApplicationStatus = async (applicationId: string) => {
  // First, check the current application status
  const { data: application, error: appError } = await supabaseAdmin
    .from("student_applications")
    .select("status, student_id")
    .eq("id", applicationId)
    .single();

  if (appError || !application) {
    console.error("Error fetching application:", appError);
    return;
  }

  // Don't update status if already confirmed, cancelled, or expired
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

  // Check if all required envelopes are completed
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

  // Check if all envelopes are completed
  const allCompleted = envelopes.every(
    (env) => env.status?.toLowerCase() === "completed",
  );

  if (allCompleted) {
    // Only update to awaiting_verification if currently awaiting_signature or earlier
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
      } else {
        console.log(
          `✅ Application ${applicationId} status updated to awaiting_verification`,
        );

        // Send signature completed email asynchronously (non-blocking)
        // This prevents email sending from delaying webhook response
        if (application.student_id) {
          // Fetch student name first (quick query), then send email in background
          // This ensures email has correct name without blocking webhook response
          supabaseAdmin
            .from("student_application_steps")
            .select("payload")
            .eq("application_id", applicationId)
            .eq("step_number", 1)
            .single()
            .then(({ data: step1 }) => {
              const step1Data = step1?.payload as any;
              const studentName = step1Data?.first_name && step1Data?.last_name
                ? `${step1Data.first_name} ${step1Data.last_name}`
                : "Student";

              // Send email in background (fire and forget)
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
              // Log error but don't block webhook response
              console.error("Error sending signature completed email (async):", emailError);
            });
        }
      }
    }
  }
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST requests
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
    // Get webhook signatures for verification
    const signature1 = req.headers.get("x-docusign-signature-1");
    const signature2 = req.headers.get("x-docusign-signature-2");

    // Read request body
    const body = await req.text();

    // Verify webhook signature
    const isValid = await verifyWebhookSignature(body, signature1, signature2);
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

    // Parse webhook payload
    let webhookData: any;
    try {
      webhookData = JSON.parse(body);
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

    console.log("📨 DocuSign webhook received:", {
      event: webhookData.event,
      envelopeId: webhookData.data?.envelopeId,
      status: webhookData.data?.status,
      timestamp: new Date().toISOString(),
    });

    // Handle different webhook events
    const event = webhookData.event || webhookData.eventType;
    const envelopeId = webhookData.data?.envelopeId || webhookData.envelopeId;

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

    // Process webhook based on event type
    switch (event) {
      case "envelope-completed":
      case "envelope_completed":
      case "envelopeCompleted": {
        const status = webhookData.data?.status || "completed";
        const updatedEnvelope = await updateEnvelopeStatus(
          envelopeId,
          status,
          webhookData.data || webhookData,
        );

        // Update application status (this is fast - just database queries)
        // Then respond immediately to DocuSign
        const applicationUpdatePromise = updatedEnvelope?.application_id
          ? updateApplicationStatus(updatedEnvelope.application_id)
          : Promise.resolve();

        // Wait for application status update (fast operation)
        await applicationUpdatePromise;

        // Respond immediately to DocuSign (don't wait for email)
        return new Response(
          JSON.stringify({
            received: true,
            message: "Envelope completed webhook processed",
            envelopeId,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      case "envelope-sent":
      case "envelope_sent":
      case "envelopeSent": {
        const updatedEnvelope = await updateEnvelopeStatus(
          envelopeId,
          "sent",
          webhookData.data || webhookData,
        );

        return new Response(
          JSON.stringify({
            received: true,
            message: "Envelope sent webhook processed",
            envelopeId,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      case "envelope-declined":
      case "envelope_declined":
      case "envelopeDeclined": {
        const updatedEnvelope = await updateEnvelopeStatus(
          envelopeId,
          "declined",
          webhookData.data || webhookData,
        );

        return new Response(
          JSON.stringify({
            received: true,
            message: "Envelope declined webhook processed",
            envelopeId,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      case "envelope-voided":
      case "envelope_voided":
      case "envelopeVoided": {
        const updatedEnvelope = await updateEnvelopeStatus(
          envelopeId,
          "voided",
          webhookData.data || webhookData,
        );

        return new Response(
          JSON.stringify({
            received: true,
            message: "Envelope voided webhook processed",
            envelopeId,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      default: {
        // For any other event, try to update status if provided
        if (webhookData.data?.status) {
          await updateEnvelopeStatus(
            envelopeId,
            webhookData.data.status,
            webhookData.data || webhookData,
          );
        }

        console.log(`Webhook event '${event}' received but not specifically handled`);
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
    }
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

