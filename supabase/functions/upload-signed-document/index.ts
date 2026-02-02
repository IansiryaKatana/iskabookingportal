import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const jsonHeaders = { "Content-Type": "application/json" as const };

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const ALLOWED_MIME = "application/pdf";

serve(async (req) => {
  let corsHeaders: Record<string, string>;
  try {
    corsHeaders = getCorsHeaders(req);
  } catch {
    corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
  }

  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { ...corsHeaders, ...jsonHeaders },
      });
    }

    // Auth: require JWT and verify user is staff or owns the application
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, ...jsonHeaders },
      });
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, ...jsonHeaders },
      });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const isStaff = profile?.role === "staff" || profile?.role === "superadmin";

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const applicationId = formData.get("applicationId") as string | null;
    const envelopeType = formData.get("envelopeType") as string | null;

    if (!file || !applicationId || !envelopeType) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields",
          hint: "applicationId, envelopeType, and file are required",
        }),
        { status: 400, headers: { ...corsHeaders, ...jsonHeaders } },
      );
    }

    if (envelopeType !== "tenancy" && envelopeType !== "guarantor") {
      return new Response(
        JSON.stringify({ error: "envelopeType must be 'tenancy' or 'guarantor'" }),
        { status: 400, headers: { ...corsHeaders, ...jsonHeaders } },
      );
    }

    // Verify user can access this application
    const { data: application, error: appError } = await supabaseAdmin
      .from("student_applications")
      .select("id, student_id")
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404,
        headers: { ...corsHeaders, ...jsonHeaders },
      });
    }

    const isOwner = application.student_id === user.id;
    if (!isOwner && !isStaff) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, ...jsonHeaders },
      });
    }

    // Only staff can upload signed documents (students use DocuSign)
    if (!isStaff) {
      return new Response(
        JSON.stringify({ error: "Only staff can upload signed documents on behalf of students" }),
        { status: 403, headers: { ...corsHeaders, ...jsonHeaders } },
      );
    }

    // Validate file
    if (file.type !== ALLOWED_MIME) {
      return new Response(
        JSON.stringify({ error: "File must be a PDF (application/pdf)" }),
        { status: 400, headers: { ...corsHeaders, ...jsonHeaders } },
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return new Response(
        JSON.stringify({ error: "File size must not exceed 20MB" }),
        { status: 400, headers: { ...corsHeaders, ...jsonHeaders } },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const storagePath = `${applicationId}/uploaded-${envelopeType}-${timestamp}.pdf`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("contracts")
      .upload(storagePath, arrayBuffer, {
        contentType: ALLOWED_MIME,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(
        JSON.stringify({
          error: "Failed to upload file",
          details: uploadError.message,
        }),
        { status: 500, headers: { ...corsHeaders, ...jsonHeaders } },
      );
    }

    // Upsert docusign_envelopes row: envelope_id null, status completed, signed_document_path set
    const { data: existingEnvelope } = await supabaseAdmin
      .from("docusign_envelopes")
      .select("id")
      .eq("application_id", applicationId)
      .eq("envelope_type", envelopeType)
      .maybeSingle();

    if (existingEnvelope) {
      const { error: updateError } = await supabaseAdmin
        .from("docusign_envelopes")
        .update({
          status: "completed",
          signed_document_path: storagePath,
          envelope_id: null,
          metadata: { uploaded_by_staff: true, uploaded_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingEnvelope.id);

      if (updateError) {
        console.error("Envelope update error:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update envelope record" }),
          { status: 500, headers: { ...corsHeaders, ...jsonHeaders } },
        );
      }
    } else {
      const { error: insertError } = await supabaseAdmin
        .from("docusign_envelopes")
        .insert({
          application_id: applicationId,
          envelope_type: envelopeType,
          envelope_id: null,
          status: "completed",
          signed_document_path: storagePath,
          metadata: { uploaded_by_staff: true, uploaded_at: new Date().toISOString() },
        });

      if (insertError) {
        console.error("Envelope insert error:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to create envelope record" }),
          { status: 500, headers: { ...corsHeaders, ...jsonHeaders } },
        );
      }
    }

    // Trigger status update: call docusign-check-status with applicationId only
    // It will run updateApplicationStatus which checks all envelopes; staff-uploaded ones are already completed
    try {
      const { error: checkError } = await supabaseAdmin.functions.invoke("docusign-check-status", {
        body: { applicationId },
      });
      if (checkError) {
        console.warn("docusign-check-status invoke warning:", checkError);
      }
    } catch (invokeErr) {
      console.warn("docusign-check-status invoke failed:", invokeErr);
    }

    return new Response(
      JSON.stringify({
        message: "Signed document uploaded successfully",
        path: storagePath,
        envelopeType,
        applicationId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, ...jsonHeaders },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Error in upload-signed-document:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, ...jsonHeaders },
    });
  }
});
