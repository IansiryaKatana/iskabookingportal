import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  SignJWT,
  importPKCS8,
} from "https://esm.sh/jose@4.15.5?target=deno";
import { getCorsHeaders, handleCorsPrelight, staticCorsHeaders } from "../_shared/cors.ts";

const jsonHeaders = { "Content-Type": "application/json" as const };

serve(async (req) => {
  let corsHeaders: Record<string, string>;
  try {
    corsHeaders = getCorsHeaders(req);
  } catch {
    corsHeaders = staticCorsHeaders;
  }

  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

  try {
    // Require POST with body
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { ...corsHeaders, ...jsonHeaders },
      });
    }

    let requestBody: { envelopeId?: string; applicationId?: string };
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error("Error parsing request body:", parseError);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, ...jsonHeaders } },
      );
    }

    const { envelopeId, applicationId } = requestBody;

    if (!envelopeId || !applicationId) {
      return new Response(
        JSON.stringify({ error: "envelopeId and applicationId are required" }),
        { status: 400, headers: { ...corsHeaders, ...jsonHeaders } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Auth: require JWT and verify user can access this application
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
    } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, ...jsonHeaders },
      });
    }

    const { data: application, error: appError } = await supabaseClient
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
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const isStaff = profile?.role === "staff" || profile?.role === "superadmin";
    const isOwner = application.student_id === user.id;
    if (!isOwner && !isStaff) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, ...jsonHeaders },
      });
    }

    // DocuSign config (same production defaults as docusign-envelopes)
    const DOCUSIGN_CLIENT_ID = Deno.env.get("DOCUSIGN_CLIENT_ID");
    const DOCUSIGN_USER_ID = Deno.env.get("DOCUSIGN_USER_ID");
    const DOCUSIGN_ACCOUNT_ID = Deno.env.get("DOCUSIGN_ACCOUNT_ID");
    const rawBaseUrl = Deno.env.get("DOCUSIGN_BASE_URL") ?? "";
    const DOCUSIGN_BASE_URL = rawBaseUrl
      ? rawBaseUrl.replace(/\/$/, "")
      : "https://demo.docusign.net/restapi";
    const rawAuthServer = Deno.env.get("DOCUSIGN_AUTH_SERVER") ?? "";
    const DOCUSIGN_AUTH_SERVER = rawAuthServer
      ? rawAuthServer.replace(/\/$/, "")
      : "https://account-d.docusign.com";
    let DOCUSIGN_PRIVATE_KEY = (Deno.env.get("DOCUSIGN_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n");
    DOCUSIGN_PRIVATE_KEY = DOCUSIGN_PRIVATE_KEY.replace(/\r\n/g, "\n");

    if (!DOCUSIGN_CLIENT_ID || !DOCUSIGN_USER_ID || !DOCUSIGN_ACCOUNT_ID || !DOCUSIGN_PRIVATE_KEY) {
      return new Response(
        JSON.stringify({ error: "DocuSign credentials not fully configured" }),
        { status: 500, headers: { ...corsHeaders, ...jsonHeaders } },
      );
    }

    const { data: envelope, error: envelopeError } = await supabaseClient
      .from("docusign_envelopes")
      .select("id, envelope_id, application_id, status, signed_document_path")
      .eq("envelope_id", envelopeId)
      .eq("application_id", applicationId)
      .single();

    if (envelopeError || !envelope) {
      console.error("Envelope not found", { envelopeId, applicationId, envelopeError });
      return new Response(
        JSON.stringify({ error: "Envelope not found for this application" }),
        { status: 404, headers: { ...corsHeaders, ...jsonHeaders } },
      );
    }

    // Only completed envelopes have a combined document in DocuSign
    const status = (envelope.status ?? "").toLowerCase();
    if (status !== "completed") {
      return new Response(
        JSON.stringify({
          error: "Document is only available after signing is complete",
          status: envelope.status,
        }),
        { status: 400, headers: { ...corsHeaders, ...jsonHeaders } },
      );
    }

    // Check if document is already downloaded
    if (envelope.signed_document_path) {
      const { data: signedUrlData, error: urlError } = await supabaseClient.storage
        .from("contracts")
        .createSignedUrl(envelope.signed_document_path, 3600);

      if (!urlError && signedUrlData) {
        return new Response(
          JSON.stringify({
            message: "Signed document retrieved",
            url: signedUrlData.signedUrl,
            path: envelope.signed_document_path,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Fetch the signed document from DocuSign API

    // Get access token using JWT
    const importedKey = await importPKCS8(DOCUSIGN_PRIVATE_KEY, "RS256");
    const audienceHost = DOCUSIGN_AUTH_SERVER.replace(/^https?:\/\//, "");
    const jwt = await new SignJWT({
      scope: "signature impersonation",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(DOCUSIGN_CLIENT_ID)
      .setSubject(DOCUSIGN_USER_ID)
      .setAudience(audienceHost)
      .setIssuedAt()
      .setExpirationTime("9m")
      .sign(importedKey);

    const params = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    });

    const authResponse = await fetch(`${DOCUSIGN_AUTH_SERVER}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });

    if (!authResponse.ok) {
      const authError = await authResponse.text();
      console.error("DocuSign auth failed in download-signed-document", authError);
      return new Response(
        JSON.stringify({ error: "DocuSign authentication failed" }),
        { status: 502, headers: { ...corsHeaders, ...jsonHeaders } },
      );
    }

    const tokenPayload = await authResponse.json();
    const accessToken = tokenPayload.access_token;

    // Get envelope documents
    const documentsResponse = await fetch(
      `${DOCUSIGN_BASE_URL}/v2.1/accounts/${DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/documents/combined`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/pdf",
        },
      },
    );

    if (!documentsResponse.ok) {
      const errorText = await documentsResponse.text();
      console.error("DocuSign documents/combined failed", {
        status: documentsResponse.status,
        envelopeId,
        body: errorText,
      });
      return new Response(
        JSON.stringify({
          error: "Failed to download document from DocuSign",
          details: errorText.slice(0, 200),
        }),
        { status: 502, headers: { ...corsHeaders, ...jsonHeaders } },
      );
    }

    // Get the PDF as a blob
    const pdfBlob = await documentsResponse.blob();
    const pdfArrayBuffer = await pdfBlob.arrayBuffer();
    // Encode to base64 in chunks to avoid "Maximum call stack size exceeded" on large PDFs
    const bytes = new Uint8Array(pdfArrayBuffer);
    const chunkSize = 8192;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const pdfBase64 = btoa(binary);

    // Save to Supabase Storage
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const storagePath = `${applicationId}/signed-${timestamp}.pdf`;

    let signedUrlData = null;
    let urlError = null;

    const { error: uploadError } = await supabaseClient.storage
      .from("contracts")
      .upload(storagePath, pdfArrayBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading to storage:", uploadError);
      // Still return the document even if storage fails
    } else {
      // Update envelope record with storage path
      await supabaseClient
        .from("docusign_envelopes")
        .update({ signed_document_path: storagePath })
        .eq("id", envelope.id);
      
      // Try to create signed URL
      const urlResult = await supabaseClient.storage
        .from("contracts")
        .createSignedUrl(storagePath, 3600);
      signedUrlData = urlResult.data;
      urlError = urlResult.error;
    }

    if (urlError || !signedUrlData) {
      // If we can't create a signed URL, return the base64 PDF directly
      return new Response(
        JSON.stringify({
          message: "Signed document retrieved from DocuSign",
          pdf_base64: pdfBase64,
          envelopeId,
          status: envelope.status,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        message: "Signed document retrieved from DocuSign",
        url: signedUrlData.signedUrl,
        path: storagePath,
        envelopeId,
        status: envelope.status,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Error in download-signed-document function:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, ...jsonHeaders },
    });
  }
});


