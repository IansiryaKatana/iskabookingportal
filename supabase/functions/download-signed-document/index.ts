import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  SignJWT,
  importPKCS8,
} from "https://esm.sh/jose@4.15.5?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const { envelopeId, applicationId } = await req.json();

    if (!envelopeId || !applicationId) {
      return new Response(
        JSON.stringify({ error: "envelopeId and applicationId are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get DocuSign credentials
    const DOCUSIGN_CLIENT_ID = Deno.env.get("DOCUSIGN_CLIENT_ID");
    const DOCUSIGN_USER_ID = Deno.env.get("DOCUSIGN_USER_ID");
    const DOCUSIGN_ACCOUNT_ID = Deno.env.get("DOCUSIGN_ACCOUNT_ID");
    const DOCUSIGN_BASE_URL = Deno.env.get("DOCUSIGN_BASE_URL") || "https://demo.docusign.net/restapi";
    const DOCUSIGN_AUTH_SERVER = Deno.env.get("DOCUSIGN_AUTH_SERVER") || "https://account-d.docusign.com";
    const DOCUSIGN_PRIVATE_KEY = (Deno.env.get("DOCUSIGN_PRIVATE_KEY") || "").replace(/\\n/g, "\n");

    if (!DOCUSIGN_CLIENT_ID || !DOCUSIGN_USER_ID || !DOCUSIGN_ACCOUNT_ID || !DOCUSIGN_PRIVATE_KEY) {
      throw new Error("DocuSign credentials not fully configured");
    }

    // Generate JWT token (simplified - use jose library in production)
    // For now, we'll use the existing envelope data
    const { data: envelope, error: envelopeError } = await supabaseClient
      .from("docusign_envelopes")
      .select("*")
      .eq("envelope_id", envelopeId)
      .eq("application_id", applicationId)
      .single();

    if (envelopeError || !envelope) {
      throw new Error("Envelope not found");
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
    const DOCUSIGN_CLIENT_ID = Deno.env.get("DOCUSIGN_CLIENT_ID");
    const DOCUSIGN_USER_ID = Deno.env.get("DOCUSIGN_USER_ID");
    const DOCUSIGN_ACCOUNT_ID = Deno.env.get("DOCUSIGN_ACCOUNT_ID");
    const DOCUSIGN_BASE_URL = Deno.env.get("DOCUSIGN_BASE_URL") || "https://demo.docusign.net/restapi";
    const DOCUSIGN_AUTH_SERVER = Deno.env.get("DOCUSIGN_AUTH_SERVER") || "https://account-d.docusign.com";
    const DOCUSIGN_PRIVATE_KEY = (Deno.env.get("DOCUSIGN_PRIVATE_KEY") || "").replace(/\\n/g, "\n");

    if (!DOCUSIGN_CLIENT_ID || !DOCUSIGN_USER_ID || !DOCUSIGN_ACCOUNT_ID || !DOCUSIGN_PRIVATE_KEY) {
      throw new Error("DocuSign credentials not fully configured");
    }

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
      throw new Error(`DocuSign auth failed: ${authError}`);
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
      throw new Error(`Failed to download document from DocuSign: ${errorText}`);
    }

    // Get the PDF as a blob
    const pdfBlob = await documentsResponse.blob();
    const pdfArrayBuffer = await pdfBlob.arrayBuffer();
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfArrayBuffer)));

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
    console.error("Error in download-signed-document function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});


