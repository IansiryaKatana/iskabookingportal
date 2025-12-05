import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  SignJWT,
  importPKCS8,
} from "https://esm.sh/jose@4.15.5?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const config = {
  clientId: Deno.env.get("DOCUSIGN_CLIENT_ID") ?? "",
  userId: Deno.env.get("DOCUSIGN_USER_ID") ?? "",
  accountId: Deno.env.get("DOCUSIGN_ACCOUNT_ID") ?? "",
  baseUrl: Deno.env.get("DOCUSIGN_BASE_URL") ??
    "https://demo.docusign.net/restapi",
  authServer: Deno.env.get("DOCUSIGN_AUTH_SERVER") ??
    "https://account-d.docusign.com",
  privateKey: (Deno.env.get("DOCUSIGN_PRIVATE_KEY") ?? "").replace(
    /\\n/g,
    "\n",
  ),
};

let cachedToken: { token: string; expiresAt: number } | null = null;
let importedKey: CryptoKey | null = null;

const getAccessToken = async () => {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  if (!importedKey) {
    importedKey = await importPKCS8(config.privateKey, "RS256");
  }

  const audienceHost = config.authServer.replace(/^https?:\/\//, "");
  const jwt = await new SignJWT({
    scope: "signature impersonation",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(config.clientId)
    .setSubject(config.userId)
    .setAudience(audienceHost)
    .setIssuedAt()
    .setExpirationTime("9m")
    .sign(importedKey);

  const params = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });

  const response = await fetch(`${config.authServer}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`DocuSign auth failed: ${details}`);
  }

  const tokenPayload = await response.json();
  cachedToken = {
    token: tokenPayload.access_token,
    expiresAt: Date.now() + (tokenPayload.expires_in - 60) * 1000,
  };
  return cachedToken.token;
};

const checkEnvelopeStatus = async (envelopeId: string) => {
  const token = await getAccessToken();
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const response = await fetch(
    `${baseUrl}/v2.1/accounts/${config.accountId}/envelopes/${envelopeId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `DocuSign envelope status check failed (${response.status}): ${errorBody}`,
    );
  }

  return response.json();
};

const updateApplicationStatus = async (applicationId: string) => {
  // First, check the current application status
  const { data: application, error: appError } = await supabaseAdmin
    .from("student_applications")
    .select("status, student_id")
    .eq("id", applicationId)
    .single();

  if (appError) {
    console.error("Error fetching application:", appError);
    return;
  }

  if (!application) {
    return;
  }

  // Don't update status if already confirmed, cancelled, or expired
  // These are terminal states that should not be changed by automatic checks
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

  // Check if all envelopes are completed (case-insensitive check)
  const allCompleted = envelopes.every(
    (env) => env.status?.toLowerCase() === "completed",
  );
  
  console.log("Envelope status check", {
    applicationId,
    envelopeCount: envelopes.length,
    envelopeStatuses: envelopes.map(e => ({ type: e.envelope_type, status: e.status })),
    allCompleted,
  });

  if (allCompleted) {
    // Only update to awaiting_verification if currently awaiting_signature or earlier
    // This prevents downgrading from confirmed status
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
          `Application ${applicationId} status updated to awaiting_verification`,
        );

        // Send signature completed email
        if (application?.student_id) {
          try {
            // Get student name from Step 1
            const { data: step1 } = await supabaseAdmin
              .from("student_application_steps")
              .select("payload")
              .eq("application_id", applicationId)
              .eq("step_number", 1)
              .single();

            const step1Data = step1?.payload as any;
            const studentName = step1Data?.first_name && step1Data?.last_name
              ? `${step1Data.first_name} ${step1Data.last_name}`
              : "Student";

            await supabaseAdmin.functions.invoke("send-transactional-email", {
              body: {
                user_id: application.student_id,
                email_type: "signature_completed",
                variables: {
                  student_name: studentName,
                },
                create_notification: true,
              },
            });
          } catch (emailError) {
            console.error("Error sending signature completed email:", emailError);
            // Don't fail the status update if email fails
          }
        }
      }
    } else if (application.status === "awaiting_verification") {
      // Already in the correct state, no update needed
      console.log(
        `Application ${applicationId} is already awaiting_verification`,
      );
    }
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { applicationId, envelopeIds } = await req.json();

    if (!applicationId) {
      return new Response(
        JSON.stringify({ error: "applicationId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // If envelopeIds provided, check those specific envelopes
    // Otherwise, fetch all envelopes for the application
    let envelopeIdsToCheck: string[] = envelopeIds || [];

    if (envelopeIdsToCheck.length === 0) {
      const { data: envelopes, error } = await supabaseAdmin
        .from("docusign_envelopes")
        .select("envelope_id")
        .eq("application_id", applicationId)
        .not("envelope_id", "is", null);

      if (error) {
        throw new Error(`Failed to fetch envelopes: ${error.message}`);
      }

      envelopeIdsToCheck = (envelopes || [])
        .map((e) => e.envelope_id)
        .filter((id): id is string => Boolean(id));
    }

    const updates: Array<{
      envelopeId: string;
      status: string;
      updated: boolean;
    }> = [];

    // Check status for each envelope
    for (const envelopeId of envelopeIdsToCheck) {
      try {
        const envelopeData = await checkEnvelopeStatus(envelopeId);
        // DocuSign returns status like "completed", "Completed", "COMPLETED", etc.
        // Normalize to lowercase for consistent comparison
        const newStatus = envelopeData.status?.toLowerCase() || "unknown";
        
        // Get envelope type for logging
        const { data: envelopeInfo } = await supabaseAdmin
          .from("docusign_envelopes")
          .select("envelope_type, status")
          .eq("envelope_id", envelopeId)
          .single();
        
        console.log("Envelope status from DocuSign", {
          envelopeId,
          envelopeType: envelopeInfo?.envelope_type,
          currentStatus: envelopeInfo?.status,
          rawStatus: envelopeData.status,
          normalizedStatus: newStatus,
          statusChanged: envelopeInfo?.status?.toLowerCase() !== newStatus,
        });

        // Update envelope status in database
        const { error: updateError } = await supabaseAdmin
          .from("docusign_envelopes")
          .update({
            status: newStatus,
            metadata: envelopeData,
            updated_at: new Date().toISOString(),
          })
          .eq("envelope_id", envelopeId);

        if (updateError) {
          console.error(`Error updating envelope ${envelopeId}:`, updateError);
        } else {
          console.log(`Successfully updated envelope ${envelopeId} (${envelopeInfo?.envelope_type}) to status: ${newStatus}`);
          updates.push({
            envelopeId,
            status: newStatus,
            updated: true,
          });
        }
      } catch (error) {
        console.error(`Error checking envelope ${envelopeId}:`, error);
        updates.push({
          envelopeId,
          status: "error",
          updated: false,
        });
      }
    }

    // Check if application status should be updated
    await updateApplicationStatus(applicationId);

    return new Response(
      JSON.stringify({
        success: true,
        updates,
        message: `Checked ${updates.length} envelope(s)`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in docusign-check-status:", error);
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

