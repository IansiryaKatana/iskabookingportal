import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SignJWT, importPKCS8 } from "https://esm.sh/jose@4.15.5?target=deno";

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
  baseUrl: Deno.env.get("DOCUSIGN_BASE_URL") ?? "https://demo.docusign.net/restapi",
  accountId: Deno.env.get("DOCUSIGN_ACCOUNT_ID") ?? "",
  userId: Deno.env.get("DOCUSIGN_USER_ID") ?? "",
  clientId: Deno.env.get("DOCUSIGN_CLIENT_ID") ?? "",
  privateKey: Deno.env.get("DOCUSIGN_PRIVATE_KEY") ?? "",
  authServer: Deno.env.get("DOCUSIGN_AUTH_SERVER") ?? "https://account.docusign.com",
  signingReturnUrl:
    Deno.env.get("DOCUSIGN_SIGNING_RETURN_URL") ?? "https://iskabookingportal.netlify.app/portal",
  tenancyStudentRole: Deno.env.get("DOCUSIGN_TENANCY_STUDENT_ROLE") ?? "Tenant",
};

let cachedToken:
  | {
    token: string;
    expiresAt: number;
  }
  | null = null;
let importedKey: CryptoKey | null = null;

const getAccessToken = async () => {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  if (!config.privateKey) {
    throw new Error("DOCUSIGN_PRIVATE_KEY is not configured");
  }

  if (!importedKey) {
    importedKey = await importPKCS8(config.privateKey, "RS256");
  }

  const audience = config.authServer.replace(/^https?:\/\//, "");
  const jwt = await new SignJWT({
    scope: "signature impersonation",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(config.clientId)
    .setSubject(config.userId)
    .setAudience(audience)
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

  const result = await response.json();
  cachedToken = {
    token: result.access_token,
    expiresAt: Date.now() + (result.expires_in - 60) * 1000,
  };
  return cachedToken.token;
};

const getStepPayload = (
  steps: Array<{ step_number: number; payload: unknown }>,
  stepNumber: number,
) => {
  const record = steps.find((step) => step.step_number === stepNumber);
  if (!record || typeof record.payload !== "object" || record.payload === null) {
    return {};
  }
  return record.payload as Record<string, unknown>;
};

const formatName = (...parts: Array<string | undefined | null>) =>
  parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" ")
    .trim();

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  if (
    !config.baseUrl ||
    !config.accountId ||
    !config.userId ||
    !config.clientId ||
    !config.privateKey
  ) {
    return new Response(
      JSON.stringify({ error: "DocuSign configuration is incomplete." }),
      { status: 500, headers: corsHeaders },
    );
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json();
    const applicationId = payload?.applicationId;
    const envelopeType = payload?.envelopeType ?? "tenancy";
    const providedReturnUrl =
      typeof payload?.returnUrl === "string"
        ? payload.returnUrl.trim()
        : undefined;
    if (!applicationId) {
      return new Response(JSON.stringify({ error: "applicationId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      data: application,
      error: applicationError,
    } = await supabaseAdmin
      .from("student_applications")
      .select(
        `
        id,
        student_id,
        student_application_steps (*)
      `,
      )
      .eq("id", applicationId)
      .single();

    if (applicationError || !application) {
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (application.student_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: envelope } = await supabaseAdmin
      .from("docusign_envelopes")
      .select("*, recipients")
      .eq("application_id", application.id)
      .eq("envelope_type", envelopeType)
      .maybeSingle();

    if (!envelope?.envelope_id) {
      return new Response(
        JSON.stringify({
          error: "Agreement envelope has not been created yet.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: studentAuth } = await supabaseAdmin.auth.admin.getUserById(
      application.student_id,
    );
    if (!studentAuth?.user?.email) {
      return new Response(
        JSON.stringify({ error: "Student email is missing" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const personalPayload = getStepPayload(
      application.student_application_steps,
      1,
    );

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", application.student_id)
      .maybeSingle();

    const studentName = formatName(
      (personalPayload.first_name as string) ?? profile?.first_name,
      (personalPayload.last_name as string) ?? profile?.last_name,
    );

    const storedRecipients = Array.isArray(envelope.recipients)
      ? envelope.recipients
      : [];
    const defaultRecipient = storedRecipients[0] ?? null;
    const studentRecipient =
      storedRecipients.find((recipient: Record<string, unknown>) => {
        const role = typeof recipient.roleName === "string"
          ? recipient.roleName.toLowerCase()
          : "";
        return role === config.tenancyStudentRole.toLowerCase();
      }) ?? defaultRecipient;

    const recipientEmail =
      (typeof studentRecipient?.email === "string" && studentRecipient.email.trim()) ||
      studentAuth.user.email;
    const recipientName =
      (typeof studentRecipient?.name === "string" && studentRecipient.name.trim()) ||
      studentName ||
      studentAuth.user.email;
    const recipientClientId =
      (typeof studentRecipient?.clientUserId === "string" &&
        studentRecipient.clientUserId.trim()) ||
      application.student_id;

    const rawReturnUrl =
      providedReturnUrl && providedReturnUrl.length > 0
        ? providedReturnUrl
        : config.signingReturnUrl;

    const absoluteReturn =
      rawReturnUrl && rawReturnUrl.startsWith("http")
        ? rawReturnUrl
        : `${supabaseUrl.replace(/\/$/, "")}${
          rawReturnUrl.startsWith("/") ? rawReturnUrl : `/${rawReturnUrl}`
        }`;
    const apiToken = await getAccessToken();
    const baseUrl = config.baseUrl.replace(/\/$/, "");
    const recipientEndpoint =
      `${baseUrl}/v2.1/accounts/${config.accountId}/envelopes/${envelope.envelope_id}/views/recipient`;

    console.info("DocuSign recipient view request", {
      endpoint: recipientEndpoint,
      envelopeType,
      recipientEmail,
      recipientClientId,
    });

    const response = await fetch(
      recipientEndpoint,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          returnUrl: absoluteReturn,
          authenticationMethod: "none",
          email: recipientEmail,
          userName: recipientName,
          clientUserId: recipientClientId,
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("DocuSign recipient view failed", {
        status: response.status,
        body: errorBody,
      });
      return new Response(
        JSON.stringify({
          error: "Unable to start signing session. Please try again shortly.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await response.json();

    return new Response(JSON.stringify({ url: data.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("DocuSign recipient view error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

