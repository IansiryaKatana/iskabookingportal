import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { getCredential } from "../_shared/get-credential.ts";
import {
  isEnvelopeCompleted,
  isEnvelopeSuperseded,
} from "../_shared/envelopeStatus.ts";

/**
 * Backup poller for DocuSign envelope status.
 * Invoked by pg_cron (x-cron-secret) so completions sync even when Connect
 * webhooks are delayed/misconfigured. Reuses docusign-check-status per app.
 */

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const DEFAULT_BATCH_LIMIT = 25;

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
};

const authorizeCronRequest = async (req: Request): Promise<boolean> => {
  const provided =
    req.headers.get("x-cron-secret") ??
    req.headers.get("x-docusign-sync-secret") ??
    "";

  if (!provided) return false;

  const expected = await getCredential("docusign_sync_cron_secret", {
    supabase: supabaseAdmin,
    fallback: Deno.env.get("DOCUSIGN_SYNC_CRON_SECRET") ?? "",
  });

  if (!expected) {
    console.error("docusign_sync_cron_secret is not configured");
    return false;
  }

  return timingSafeEqual(provided, expected);
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authorized = await authorizeCronRequest(req);
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let batchLimit = DEFAULT_BATCH_LIMIT;
    try {
      const body = await req.json();
      if (
        typeof body?.limit === "number" &&
        Number.isFinite(body.limit) &&
        body.limit > 0
      ) {
        batchLimit = Math.min(Math.floor(body.limit), 50);
      }
    } catch {
      // empty body is fine
    }

    const { data: candidates, error: candidatesError } = await supabaseAdmin
      .from("student_applications")
      .select(
        "id, status, updated_at, docusign_envelopes!inner(envelope_id, status, updated_at)",
      )
      .in("status", ["awaiting_signature", "awaiting_verification"])
      .order("updated_at", { ascending: true })
      .limit(200);

    if (candidatesError) {
      throw new Error(`Failed to load pending applications: ${candidatesError.message}`);
    }

    const pendingApplicationIds: string[] = [];
    for (const app of candidates ?? []) {
      const envelopes = Array.isArray(app.docusign_envelopes)
        ? app.docusign_envelopes
        : [];
      const hasOpenEnvelope = envelopes.some((env) => {
        if (!env?.envelope_id) return false;
        if (isEnvelopeSuperseded(env.status)) return false;
        return !isEnvelopeCompleted(env.status);
      });
      if (hasOpenEnvelope) {
        pendingApplicationIds.push(app.id);
      }
      if (pendingApplicationIds.length >= batchLimit) break;
    }

    const results: Array<{
      applicationId: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (const applicationId of pendingApplicationIds) {
      try {
        const response = await fetch(
          `${supabaseUrl}/functions/v1/docusign-check-status`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceRoleKey}`,
              apikey: serviceRoleKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ applicationId }),
          },
        );

        if (!response.ok) {
          const details = await response.text();
          results.push({
            applicationId,
            ok: false,
            error: `check-status ${response.status}: ${details}`,
          });
          continue;
        }

        results.push({ applicationId, ok: true });
      } catch (error) {
        results.push({
          applicationId,
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const synced = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    console.log("sync-pending-docusign complete", {
      pendingFound: pendingApplicationIds.length,
      synced,
      failed,
    });

    return new Response(
      JSON.stringify({
        success: true,
        pendingFound: pendingApplicationIds.length,
        synced,
        failed,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in sync-pending-docusign:", error);
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
