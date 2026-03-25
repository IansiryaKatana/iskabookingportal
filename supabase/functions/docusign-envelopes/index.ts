import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  SignJWT,
  importPKCS8,
} from "https://esm.sh/jose@4.15.5?target=deno";
import { getCorsHeaders, staticCorsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const nodeEnv = Deno.env.get("NODE_ENV") ?? "production";
const isDevelopment = nodeEnv === "development";

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
  tenancyTemplateId: Deno.env.get("DOCUSIGN_TENANCY_TEMPLATE_ID") ?? "",
  guarantorTemplateId: Deno.env.get("DOCUSIGN_GUARANTOR_TEMPLATE_ID") ?? "",
  tenancyStudentRole: Deno.env.get("DOCUSIGN_TENANCY_STUDENT_ROLE") ??
    "Tenant",
  tenancyWitnessRole: Deno.env.get("DOCUSIGN_TENANCY_WITNESS_ROLE") ??
    "Witness",
  guarantorRole: Deno.env.get("DOCUSIGN_GUARANTOR_ROLE") ?? "Guarantor",
};

// Normalize Windows newlines if user pasted via some editors.
config.privateKey = config.privateKey.replace(/\r\n/g, "\n");

const requiredConfig = [
  ["DOCUSIGN_CLIENT_ID", config.clientId],
  ["DOCUSIGN_USER_ID", config.userId],
  ["DOCUSIGN_ACCOUNT_ID", config.accountId],
  ["DOCUSIGN_PRIVATE_KEY", config.privateKey],
  ["STRIPE_SECRET_KEY", stripeSecret],
];

const missing = requiredConfig
  .filter(([, value]) => !value)
  .map(([key]) => key);

let cachedToken: { token: string; expiresAt: number } | null = null;
let importedKey: CryptoKey | null = null;

type DocusignErrorHint = { error_code: string; hint: string };

const getDocusignErrorHint = (message: string): DocusignErrorHint | null => {
  const msg = message ?? "";
  if (msg.includes("no_valid_keys_or_signatures")) {
    return {
      error_code: "DOCUSIGN_JWT_SIGNATURE_INVALID",
      hint:
        "DocuSign rejected the JWT signature. Ensure the RSA keypair belongs to the SAME production app (Integration Key) and that DOCUSIGN_PRIVATE_KEY is the matching private key (PKCS#8). If you generated a new RSA keypair in DocuSign, update DOCUSIGN_PRIVATE_KEY accordingly and retry.",
    };
  }
  if (msg.includes("consent_required")) {
    return {
      error_code: "DOCUSIGN_CONSENT_REQUIRED",
      hint:
        "JWT consent is not granted for this user/app in production. Open the consent URL (scope=signature impersonation) while logged into production DocuSign as the impersonation user and click Allow.",
    };
  }
  if (msg.includes("TEMPLATE_ID_INVALID")) {
    return {
      error_code: "DOCUSIGN_TEMPLATE_ID_INVALID",
      hint:
        "The template ID is not valid for the account/base URL being used. Confirm DOCUSIGN_BASE_URL matches your Account Base URI (EU: https://eu.docusign.net/restapi) and the template ID exists in that same account.",
    };
  }
  return null;
};

const summarizePem = (pem: string) => {
  const trimmed = (pem ?? "").trim();
  const lines = trimmed ? trimmed.split("\n") : [];
  const firstLine = lines[0] ?? "";
  const lastLine = lines[lines.length - 1] ?? "";
  const format = /BEGIN\s+PRIVATE\s+KEY/.test(firstLine)
    ? "pkcs8"
    : /BEGIN\s+RSA\s+PRIVATE\s+KEY/.test(firstLine)
    ? "pkcs1"
    : "unknown";
  return {
    format,
    firstLine,
    lastLine,
    lineCount: lines.length,
    charCount: trimmed.length,
  };
};

const sha256Hex = async (input: string): Promise<string> => {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const PKCS8_CONVERT_MSG =
  "DocuSign gives PKCS#1 (BEGIN RSA PRIVATE KEY). Convert to PKCS#8: " +
  "openssl pkcs8 -topk8 -nocrypt -inform PEM -outform PEM -in key.pem -out key_pkcs8.pem. " +
  "Use the PKCS#8 output as DOCUSIGN_PRIVATE_KEY.";

async function loadPrivateKey(): Promise<CryptoKey> {
  try {
    return await importPKCS8(config.privateKey, "RS256");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isPkcs8Err = /pkcs8|PKCS#8/i.test(msg);
    const isPkcs1Key = /BEGIN\s+RSA\s+PRIVATE\s+KEY/i.test(config.privateKey);
    if (isPkcs8Err && isPkcs1Key) {
      throw new Error(`Invalid DOCUSIGN_PRIVATE_KEY format. ${PKCS8_CONVERT_MSG}`);
    }
    throw e;
  }
}

const getAccessToken = async () => {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  if (!importedKey) {
    importedKey = await loadPrivateKey();
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
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(details);
    } catch {
      // ignore
    }

    // High-signal diagnostics (no secrets, no JWT printed)
    const pemSummary = summarizePem(config.privateKey);
    let keyHash = "unavailable";
    try {
      // Hash of the PKCS#8/PKCS#1 string (non-reversible) to help confirm which key is deployed
      keyHash = (await sha256Hex(config.privateKey)).slice(0, 16);
    } catch {
      // ignore
    }
    console.error("DocuSign auth failed (debug)", {
      status: response.status,
      detailsRaw: details,
      detailsJson: parsed,
      authServer: config.authServer,
      tokenUrl: `${config.authServer}/oauth/token`,
      audienceHost,
      clientIdSuffix: config.clientId.slice(-6),
      userIdSuffix: config.userId.slice(-6),
      accountIdSuffix: config.accountId.slice(-6),
      privateKey: {
        ...pemSummary,
        sha256Prefix: keyHash,
      },
    });

    throw new Error(`DocuSign auth failed: ${details}`);
  }

  const tokenPayload = await response.json();
  cachedToken = {
    token: tokenPayload.access_token,
    expiresAt: Date.now() + (tokenPayload.expires_in - 60) * 1000,
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

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const formatAcademicYear = (dateIso?: string | null): string => {
  if (!dateIso) return "";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "";
  const startYear = d.getFullYear() % 100;
  const endYear = (d.getFullYear() + 1) % 100;
  return `${startYear.toString().padStart(2, "0")}/${endYear
    .toString()
    .padStart(2, "0")}`;
};

const formatGbDate = (dateIso?: string | null): string => {
  if (!dateIso) return "";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatGBP = (amount: number): string =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    amount / 100,
  );

const sendEnvelope = async (
  body: Record<string, unknown>,
) => {
  const token = await getAccessToken();
  const templateRoles = (body.templateRoles as any[]) ?? [];
  const tabsForFirstRole = templateRoles[0]?.tabs;
  console.info("Sending DocuSign envelope", {
    templateId: body.templateId,
    recipientCount: templateRoles.length,
    firstRoleTabs: tabsForFirstRole
      ? {
        textTabs: (tabsForFirstRole.textTabs as any[])?.map((t: any) => ({
          label: t.tabLabel,
          value: t.value?.substring(0, 50), // truncate for logging
        })),
      }
      : null,
  });
  const response = await fetch(
    `${config.baseUrl.replace(/\/$/, "")}/v2.1/accounts/${config.accountId}/envelopes`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("DocuSign envelope request failed", {
      status: response.status,
      body: errorBody,
      payload: body,
    });
    throw new Error(
      `DocuSign envelope error (${response.status}): ${errorBody}`,
    );
  }

  const result = await response.json();
  console.info("DocuSign envelope created", {
    envelopeId: result.envelopeId,
    status: result.status,
  });
  return result;
};

const retrievePaymentIntent = async (id: string) => {
  if (!stripeSecret) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  const response = await fetch(
    `https://api.stripe.com/v1/payment_intents/${id}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
      },
    },
  );
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stripe API error (${response.status}): ${errorText}`);
  }
  return response.json();
};

serve(async (req) => {
  // Handle OPTIONS first with static CORS so we never fail preflight (Supabase CORS fix)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: staticCorsHeaders });
  }

  let corsHeaders: Record<string, string>;
  try {
    corsHeaders = getCorsHeaders(req);
  } catch {
    corsHeaders = staticCorsHeaders;
  }

  let body: { applicationId?: string; allowResend?: boolean } = {};

  // Wrap everything in try-catch to ensure CORS headers are always returned
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: corsHeaders,
      });
    }

    if (missing.length) {
      return new Response(
        JSON.stringify({
          error: `Missing DocuSign configuration: ${missing.join(", ")}`,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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

    // Parse body first to catch JSON errors early
    try {
      body = await req.json();
    } catch (parseError) {
      console.error("Error parsing request body:", parseError);
      return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const { applicationId } = body;
    
    console.log("DocuSign envelope request received", {
      applicationId,
      userId: user.id,
      timestamp: new Date().toISOString(),
    });
    
    if (!applicationId) {
      console.error("Missing applicationId in request", { body });
      return new Response(JSON.stringify({ error: "applicationId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: requesterProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const {
      data: application,
      error: applicationError,
    } = await supabaseAdmin
      .from("student_applications")
      .select(
        `
        id,
        student_id,
        status,
        deposit_payment_intent_id,
        selected_payment_plan_id,
        studio_grade_id,
        assigned_studio_id,
        assigned_studio:studios (
          studio_number,
          floor
        ),
        contract:contracts!contract_id (
          id,
          name,
          academic_year_id,
          contract_start,
          contract_end,
          weeks,
          extra_days,
          weekly_price_override,
          deposit_override,
          studio_grade:studio_grades ( 
            id,
            name 
          )
        ),
        student_application_steps (*)
      `,
      )
      .eq("id", applicationId)
      .single();

    if (applicationError || !application) {
      console.error("Application not found", {
        applicationId,
        error: applicationError,
      });
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Application loaded", {
      applicationId: application.id,
      status: application.status,
      hasPaymentPlan: !!application.selected_payment_plan_id,
      paymentPlanId: application.selected_payment_plan_id,
      hasDepositPaymentIntent: !!application.deposit_payment_intent_id,
    });

    const isApplicant = application.student_id === user.id;
    const isStaff =
      requesterProfile?.role === "staff" || requesterProfile?.role === "superadmin";

    if (!isApplicant && !isStaff) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const depositVerifiedStatuses = new Set([
      "awaiting_signature",
      "awaiting_verification",
      "confirmed",
    ]);

    let depositVerified = depositVerifiedStatuses.has(application.status);

    if (!depositVerified) {
      console.log("Deposit not verified by status, checking payment intent", {
        applicationId: application.id,
        status: application.status,
        depositPaymentIntentId: application.deposit_payment_intent_id,
        hasStripeSecret: !!stripeSecret,
      });

      if (!stripeSecret || !application.deposit_payment_intent_id) {
        console.error("Missing deposit payment intent or Stripe secret", {
          applicationId: application.id,
          hasStripeSecret: !!stripeSecret,
          hasPaymentIntentId: !!application.deposit_payment_intent_id,
        });
        return new Response(
          JSON.stringify({
            error:
              "We're still processing your deposit. Please wait a moment and try again.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      try {
        const paymentIntent = await retrievePaymentIntent(
          application.deposit_payment_intent_id,
        );
        console.log("Payment intent retrieved", {
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount,
          metadata: paymentIntent.metadata,
        });
        
        if (paymentIntent.status === "succeeded") {
          depositVerified = true;
          await supabaseAdmin
            .from("student_applications")
            .update({
              status: "awaiting_signature",
            })
            .eq("id", application.id);
          application.status = "awaiting_signature";
          console.log("Deposit verified, application status updated to awaiting_signature");
        } else {
          const friendlyStatus = paymentIntent.status.replaceAll("_", " ");
          console.warn("Payment intent not succeeded", {
            status: paymentIntent.status,
            applicationId: application.id,
          });
          return new Response(
            JSON.stringify({
              error: `Deposit is ${friendlyStatus}. Please wait until it succeeds before requesting agreements.`,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      } catch (error) {
        console.error("Stripe verification failed:", error);
        return new Response(
          JSON.stringify({
            error:
              "Unable to verify your deposit with Stripe. Please try again shortly.",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    } else {
      console.log("Deposit already verified by application status", {
        applicationId: application.id,
        status: application.status,
      });
    }

    const { data: studentAuth } = await supabaseAdmin.auth.admin.getUserById(
      application.student_id,
    );
    if (!studentAuth?.user) {
      return new Response(
        JSON.stringify({ error: "Student account could not be loaded." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const studentEmail = studentAuth.user.email ?? user.email ?? null;
    if (!studentEmail) {
      return new Response(
        JSON.stringify({
          error: "Student email is missing. Please update your profile.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: studentProfile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", application.student_id)
      .maybeSingle();

    const personalPayload = getStepPayload(
      application.student_application_steps,
      1,
    );
    const contactPayload = getStepPayload(
      application.student_application_steps,
      2,
    );
    const paymentPayload = getStepPayload(
      application.student_application_steps,
      5,
    );

    const studentName = formatName(
      (personalPayload.first_name as string) ?? studentProfile?.first_name,
      (personalPayload.last_name as string) ?? studentProfile?.last_name,
    );

    const studentPhone = (contactPayload.mobile as string) ?? "";

    // Optional flag to force creation of fresh DocuSign envelopes even when one
    // already exists for this application + type. This is primarily intended
    // for staff-controlled "Resend agreements" actions in the UI.
    const allowResend = Boolean((body as { allowResend?: boolean }).allowResend);
    
    // Check if the selected payment plan is "Pay in Full":
    // - legacy/system plans: 1 installment with 100% percentage
    // - custom staff plans: 1 installment (typically fixed amount)
    // Pay in Full plans don't require a guarantor.
    let isPayInFullPlan = false;
    if (application.selected_payment_plan_id) {
      try {
        const { data: installments, error: installmentsError } = await supabaseAdmin
          .from("payment_plan_installments")
          .select("amount_type, amount_value, sequence")
          .eq("payment_plan_id", application.selected_payment_plan_id)
          .order("sequence", { ascending: true });
        
        if (installmentsError) {
          console.error("Error fetching installments for Pay in Full check:", installmentsError);
          // If we can't check, default to requiring guarantor for safety
        } else if (installments && installments.length === 1) {
          const installment = installments[0];
          if (installment.amount_type === "percentage") {
            isPayInFullPlan = Number(installment.amount_value) === 100;
          } else {
            // Staff custom plans can be a single fixed installment.
            isPayInFullPlan = Number(installment.amount_value) > 0;
          }
        }
      } catch (error) {
        console.error("Error checking if payment plan is Pay in Full:", error);
        // If we can't check, default to requiring guarantor for safety
      }
    }
    
    // Require guarantor only if there's a payment plan AND it's NOT a "Pay in Full" plan
    const requiresGuarantor = Boolean(application.selected_payment_plan_id) && !isPayInFullPlan;

    console.log("Guarantor requirement check", {
      applicationId: application.id,
      hasPaymentPlan: !!application.selected_payment_plan_id,
      paymentPlanId: application.selected_payment_plan_id,
      isPayInFullPlan,
      requiresGuarantor,
    });

    // Fetch DocuSign templates for this academic year
    const academicYearId = (application.contract as any)?.academic_year_id;
    const contractId = (application.contract as any)?.id;
    const contractName = (application.contract as any)?.name;
    
    console.log("DocuSign contract selection", {
      applicationId: application.id,
      contractId,
      contractName,
      academicYearId,
    });
    
    if (!academicYearId) {
      console.error("Application contract missing academic year", {
        applicationId: application.id,
        contract: application.contract,
      });
      return new Response(
        JSON.stringify({ error: "Application contract missing academic year" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: templates, error: templatesError } = await supabaseAdmin
      .from("docusign_templates")
      .select("template_id, template_type, role_names")
      .eq("academic_year_id", academicYearId)
      .eq("is_active", true);
    
    console.log("DocuSign templates fetched", {
      academicYearId,
      templateCount: templates?.length || 0,
      templates: templates?.map(t => ({ type: t.template_type, id: t.template_id })),
    });

    if (templatesError) {
      console.error("Failed to fetch DocuSign templates:", templatesError);
      return new Response(
        JSON.stringify({ 
          error: "Failed to load DocuSign templates. Please contact support." 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenancyTemplate = templates?.find(t => t.template_type === 'tenancy');
    const guarantorTemplate = templates?.find(t => t.template_type === 'guarantor');

    if (!tenancyTemplate) {
      return new Response(
        JSON.stringify({ 
          error: "Tenancy template not configured for this academic year. Please contact support." 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use dynamic role names if provided, otherwise fall back to config defaults
    const roleNames = (tenancyTemplate.role_names as any) || {};
    const tenancyStudentRole = roleNames.student || config.tenancyStudentRole;
    const tenancyWitnessRole = roleNames.witness || config.tenancyWitnessRole;
    const tenancyGuarantorRole = roleNames.guarantor || config.guarantorRole;
    const guarantorRole = guarantorTemplate?.role_names?.guarantor || config.guarantorRole;

    // Build auto-fill values for tenancy template
    const contract = application.contract as any;
    const academicYear = formatAcademicYear(contract?.contract_start);
    const tenantNameForDoc = studentName || studentEmail;
    const assignedStudio = application.assigned_studio as any;
    const roomNumber = assignedStudio?.studio_number 
      ? `${assignedStudio.studio_number}${assignedStudio.floor ? ` (Floor ${assignedStudio.floor})` : ""}`
      : "To Be Advised";
    const tenancyPeriod =
      contract?.contract_start && contract?.contract_end
        ? `${formatGbDate(contract.contract_start)} – ${formatGbDate(
            contract.contract_end,
          )}${contract?.weeks != null ? ` (${contract.weeks}${(contract as any)?.extra_days ? ` weeks ${(contract as any).extra_days} days` : " weeks"})` : ""}`
        : "";

    // Calculate weekly rate, deposit, and payment schedule
    let weeklyRate: number | null = null;
    let depositAmount: number | null = null;
    let totalContractValue: number | null = null;
    let planSummary = "";
    
    // Get weekly rate: contract override > studio_grade_prices
    if (contract?.academic_year_id && application.studio_grade_id) {
      if (contract.weekly_price_override) {
        weeklyRate = Number(contract.weekly_price_override);
      } else {
        const { data: priceData } = await supabaseAdmin
          .from("studio_grade_prices")
          .select("weekly_price")
          .eq("academic_year_id", contract.academic_year_id)
          .eq("studio_grade_id", application.studio_grade_id)
          .eq("is_active", true)
          .maybeSingle();
        weeklyRate = priceData ? Number(priceData.weekly_price) : null;
      }
    }

    // Calculate total contract value (effective weeks = weeks + extra_days/7)
    if (weeklyRate && contract?.weeks != null) {
      const extraDays = Math.min(6, Math.max(0, Number((contract as any)?.extra_days) || 0));
      const effectiveWeeks = Number(contract.weeks) + extraDays / 7;
      totalContractValue = weeklyRate * effectiveWeeks;
    }

    // Get deposit amount: contract override > payment plan > studio_grade_prices override
    if (application.selected_payment_plan_id) {
      const { data: paymentPlan } = await supabaseAdmin
        .from("payment_plans")
        .select("deposit_amount")
        .eq("id", application.selected_payment_plan_id)
        .maybeSingle();
      
      depositAmount = contract?.deposit_override 
        ? Number(contract.deposit_override)
        : paymentPlan?.deposit_amount 
          ? Number(paymentPlan.deposit_amount)
          : null;
    } else if (contract?.deposit_override) {
      depositAmount = Number(contract.deposit_override);
    }

    // If still no deposit, check studio_grade_prices
    if (!depositAmount && contract?.academic_year_id && application.studio_grade_id) {
      const { data: priceData } = await supabaseAdmin
        .from("studio_grade_prices")
        .select("deposit_amount_override")
        .eq("academic_year_id", contract.academic_year_id)
        .eq("studio_grade_id", application.studio_grade_id)
        .eq("is_active", true)
        .maybeSingle();
      depositAmount = priceData?.deposit_amount_override 
        ? Number(priceData.deposit_amount_override)
        : null;
    }

    // Calculate payment schedule with actual amounts.
    // Policy: deposit is separate and must NOT reduce installment base.
    if (application.selected_payment_plan_id && totalContractValue) {
      try {
        const { data: installments, error: installmentsError } = await supabaseAdmin
          .from("payment_plan_installments")
          .select("amount_value, amount_type, due_date, due_date_offset_days, sequence, label")
          .eq("payment_plan_id", application.selected_payment_plan_id)
          .order("sequence", { ascending: true });
        
        if (!installmentsError && installments && installments.length) {
          // Installments are based on full contract value (deposit is separate).
          const installmentBase = totalContractValue;
          
          // Build payment schedule with actual calculated amounts
          // CRITICAL: Last installment absorbs rounding difference for perfect accuracy
          const scheduleItems = installments.map((it, index) => {
            let amount = 0;
            if (it.amount_type === "fixed") {
              amount = Number(it.amount_value);
            } else if (it.amount_type === "percentage") {
              amount = (installmentBase * Number(it.amount_value)) / 100;
            }
            
            // Adjust last installment to absorb rounding difference
            if (index === installments.length - 1) {
              const sumOfPrevious = installments
                .slice(0, index)
                .reduce((sum, prev) => {
                  let prevAmount = 0;
                  if (prev.amount_type === "fixed") {
                    prevAmount = Number(prev.amount_value);
                  } else if (prev.amount_type === "percentage") {
                    prevAmount = (installmentBase * Number(prev.amount_value)) / 100;
                  }
                  return sum + prevAmount;
                }, 0);
              // Last installment = installment base - sum of previous
              amount = installmentBase - sumOfPrevious;
            }
            
            // Calculate actual due date: use due_date if available, otherwise calculate from contract_start + offset
            let actualDueDate: string | null = null;
            if (it.due_date) {
              actualDueDate = it.due_date;
            } else if (it.due_date_offset_days !== null && contract?.contract_start) {
              // Calculate: contract_start + offset_days
              try {
                const contractStart = new Date(contract.contract_start);
                const calculatedDate = new Date(contractStart);
                calculatedDate.setDate(calculatedDate.getDate() + it.due_date_offset_days);
                actualDueDate = calculatedDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
              } catch (dateError) {
                console.error("Error calculating due date from offset:", dateError);
                // Fall back to empty date if calculation fails
                actualDueDate = null;
              }
            }
            
            const due = actualDueDate ? formatGbDate(actualDueDate) : "";
            const formattedAmount = formatGBP(Math.round(amount * 100));
            const installmentLine = `Installment ${it.sequence} -- ${formattedAmount}`;
            return due ? `${installmentLine} on ${due}` : installmentLine;
          });
          
          // Newline-separated lines so multiline DocuSign tabs render each installment on its own row.
          planSummary = scheduleItems.join("\n");
        }
      } catch (error) {
        console.error("Error processing payment plan installments:", error);
      }
    }

    const weeklyRateFormatted = weeklyRate ? formatGBP(Math.round(weeklyRate * 100)) : "";
    const depositAmountFormatted = depositAmount ? formatGBP(Math.round(depositAmount * 100)) : "";
    const totalRent = totalContractValue ? formatGBP(Math.round(totalContractValue * 100)) : "";

    const witness = {
      name: (paymentPayload.witness_name as string) ?? "",
      email: normalizeEmail(paymentPayload.witness_email),
      phone: (paymentPayload.witness_phone as string) ?? "",
    };

    const guarantor = {
      name: (paymentPayload.guarantor_name as string) ?? "",
      email: normalizeEmail(paymentPayload.guarantor_email),
      phone: (paymentPayload.guarantor_phone as string) ?? "",
      relationship: (paymentPayload.guarantor_relationship as string) ?? "",
      dob: (paymentPayload.guarantor_dob as string) ?? "",
    };

    // Note: Witness and guarantor validation is now done in the tenancy recipients section

    const textTabs = [
      ...(academicYear ? [{ tabLabel: "academic_year", value: academicYear }] : []),
      ...(weeklyRateFormatted ? [{ tabLabel: "weekly_rate", value: weeklyRateFormatted }] : []),
      ...(tenantNameForDoc ? [{ tabLabel: "tenant_name", value: tenantNameForDoc }] : []),
      ...(roomNumber ? [{ tabLabel: "room_number", value: String(roomNumber) }] : []),
      ...(depositAmountFormatted ? [{ tabLabel: "deposit_amount", value: depositAmountFormatted }] : []),
      ...(tenancyPeriod ? [{ tabLabel: "tenancy_period", value: tenancyPeriod }] : []),
      ...(totalRent ? [{ tabLabel: "total_rent", value: totalRent }] : []),
      ...(planSummary ? [{ tabLabel: "plan_summary", value: planSummary }] : []),
      ...(studentPhone
        ? [{ tabLabel: "student_phone", value: studentPhone }]
        : []),
    ].filter((tab) => tab.value && tab.value.trim().length > 0);

    // Log all calculated values for debugging
    console.log("DocuSign data calculation results", {
      applicationId: application.id,
      academicYear,
      weeklyRate,
      weeklyRateFormatted,
      depositAmount,
      depositAmountFormatted,
      totalContractValue,
      totalRent,
      tenantNameForDoc,
      roomNumber,
      tenancyPeriod,
      planSummary,
      textTabsCount: textTabs.length,
      textTabs: textTabs.map(t => ({ label: t.tabLabel, value: t.value?.substring(0, 50) })),
    });

    // IMPORTANT: Signature tabs should ideally be pre-placed in the DocuSign template
    // However, we can add them programmatically as a fallback using anchor text
    // If your template has anchor text like "{{signature}}" or "Sign here", DocuSign will place tabs there
    // Otherwise, you need to add signHereTabs with x/y coordinates or anchor strings
    const signHereTabs: Array<{
      anchorString?: string;
      anchorXOffset?: string;
      anchorYOffset?: string;
      optional?: string;
      tabLabel?: string;
    }> = [
      // Signature tab - will be placed at anchor text "{{signature}}" in template
      // OR pre-place a Sign Here tab in your template with tabLabel "signature"
      {
        anchorString: "{{signature}}",
        anchorXOffset: "0",
        anchorYOffset: "0",
        optional: "false",
        tabLabel: "signature",
      },
    ];

    const dateSignedTabs: Array<{
      anchorString?: string;
      anchorXOffset?: string;
      anchorYOffset?: string;
      tabLabel?: string;
    }> = [
      // Date signed tab - will be placed at anchor text "{{date_signed}}" in template
      // OR pre-place a Date Signed tab in your template with tabLabel "date_signed"
      {
        anchorString: "{{date_signed}}",
        anchorXOffset: "0",
        anchorYOffset: "0",
        tabLabel: "date_signed",
      },
    ];

    // Print Name tab - tenant name that's not editable (read-only)
    // This will be placed at anchor text "{{print_name}}" in template
    // OR pre-place a Text tab in your template with tabLabel "print_name" and set it to read-only
    const printNameTabs: Array<{
      anchorString?: string;
      anchorXOffset?: string;
      anchorYOffset?: string;
      tabLabel?: string;
      value?: string;
      locked?: string;
    }> = [
      {
        anchorString: "{{print_name}}",
        anchorXOffset: "0",
        anchorYOffset: "0",
        tabLabel: "print_name",
        value: tenantNameForDoc,
        locked: "true", // Makes it read-only
      },
    ];

    // Combine print name with text tabs (print name is also a text tab)
    const allTextTabs = [
      ...textTabs,
      ...(printNameTabs.length > 0 ? printNameTabs.map(tab => ({
        tabLabel: tab.tabLabel,
        value: tab.value,
        locked: tab.locked,
      })) : []),
    ];

    // Log the complete tabs structure being sent
    console.log("DocuSign tabs structure", {
      applicationId: application.id,
      roleName: tenancyStudentRole,
      textTabs: allTextTabs.map(t => ({ 
        label: t.tabLabel, 
        value: t.value?.substring(0, 50),
        locked: (t as any).locked 
      })),
      signHereTabs: signHereTabs.map(t => ({ 
        label: t.tabLabel,
        anchor: t.anchorString 
      })),
      dateSignedTabs: dateSignedTabs.map(t => ({ 
        label: t.tabLabel,
        anchor: t.anchorString 
      })),
    });

    // Tenancy contract: Tenant signs (1), Witness views (2 - optional), Guarantor signs (2 or 3 depending on witness)
    const tenancyRecipients = [
      {
        roleName: tenancyStudentRole,
        name: studentName || studentEmail,
        email: studentEmail,
        routingOrder: "1",
        clientUserId: application.student_id,
        tabs: {
          // Combine all text tabs including print name
          textTabs: allTextTabs.length > 0 ? allTextTabs : undefined,
          // Add signature tabs - these will only work if your template has matching anchor text
          // OR if you provide x/y coordinates instead of anchorString
          ...(signHereTabs.length > 0 ? { signHereTabs } : {}),
          ...(dateSignedTabs.length > 0 ? { dateSignedTabs } : {}),
        },
      },
    ];

    // Optionally add witness as viewer (routing order 2) - only if details provided
    const hasWitness = witness.name.trim() && witness.email.trim();
    let nextRoutingOrder = 2;

    if (hasWitness && !isValidEmail(witness.email)) {
      return new Response(
        JSON.stringify({
          error: "Witness email is invalid. Please enter a valid witness email address.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    
    if (hasWitness) {
      tenancyRecipients.push({
        roleName: tenancyWitnessRole,
        name: witness.name,
        email: witness.email,
        routingOrder: String(nextRoutingOrder),
        // Witness is a viewer, not a signer - DocuSign will handle this based on template role settings
      });
      nextRoutingOrder = 3;
    }

    // If guarantor is required, add them as a signer (routing order 2 or 3 depending on witness)
    let existingGuarantorEnvelopeId: string | null = null;

    if (requiresGuarantor) {
      if (!guarantor.name.trim() || !guarantor.email.trim()) {
        return new Response(
          JSON.stringify({
            error: "Guarantor details are required before we can send the agreements.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (!isValidEmail(guarantor.email)) {
        return new Response(
          JSON.stringify({
            error: "Guarantor email is invalid. Please enter a valid guarantor email address.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      
      tenancyRecipients.push({
        roleName: tenancyGuarantorRole,
        name: guarantor.name,
        email: guarantor.email,
        routingOrder: String(nextRoutingOrder),
      });
    }

    // Fetch company name from branding settings
    const { data: brandingData } = await supabaseAdmin
      .from("branding_settings")
      .select("setting_value")
      .eq("setting_key", "company_name")
      .maybeSingle();
    const companyName = brandingData?.setting_value || "StudentStaySolutions";

    const tenancyTemplateId = String(tenancyTemplate.template_id ?? "").trim();
    console.info("DocuSign environment check", {
      authServer: config.authServer,
      baseUrl: config.baseUrl,
      isProductionAuth: config.authServer === "https://account.docusign.com",
      isProductionApi: !config.baseUrl.includes("demo"),
      accountIdSuffix: config.accountId.slice(-6),
      tenancyTemplateId,
      academicYearId,
    });

    const tenancyBody = {
      templateId: tenancyTemplateId,
      status: "sent",
      emailSubject: `${companyName} tenancy agreement – ${
        application.contract?.studio_grade?.name ?? companyName
      }`,
      templateRoles: tenancyRecipients,
    };

    const envelopesCreated: Array<{ type: string; envelopeId: string }> = [];
    let existingTenancyEnvelopeId: string | null = null;

    const { data: existingTenancy } = await supabaseAdmin
      .from("docusign_envelopes")
      .select("id, envelope_id, status")
      .eq("application_id", application.id)
      .eq("envelope_type", "tenancy")
      .maybeSingle();

    if (!existingTenancy || allowResend) {
      const isResend = Boolean(existingTenancy);
      console.info(
        isResend ? "Resending tenancy envelope with fresh DocuSign envelope" : "Creating tenancy envelope with tabs",
        {
          applicationId: application.id,
          existingEnvelopeId: existingTenancy?.envelope_id ?? null,
          allowResend,
          tabLabels: tenancyRecipients[0]?.tabs?.textTabs?.map((t: any) => t.tabLabel),
        },
      );

      const tenancyEnvelope = await sendEnvelope(tenancyBody);
      envelopesCreated.push({
        type: "tenancy",
        envelopeId: tenancyEnvelope.envelopeId,
      });

      if (existingTenancy) {
        existingTenancyEnvelopeId = tenancyEnvelope.envelopeId;
        await supabaseAdmin
          .from("docusign_envelopes")
          .update({
            envelope_id: tenancyEnvelope.envelopeId,
            status: tenancyEnvelope.status ?? "sent",
            recipients: tenancyRecipients,
            metadata: tenancyEnvelope,
          })
          .eq("id", existingTenancy.id);
      } else {
        await supabaseAdmin.from("docusign_envelopes").insert({
          application_id: application.id,
          envelope_type: "tenancy",
          envelope_id: tenancyEnvelope.envelopeId,
          status: tenancyEnvelope.status ?? "sent",
          recipients: tenancyRecipients,
          metadata: tenancyEnvelope,
        });
      }
    } else {
      existingTenancyEnvelopeId = existingTenancy.envelope_id ?? null;
      console.info("Tenancy envelope already exists", {
        envelopeId: existingTenancyEnvelopeId,
        allowResend,
      });
    }

    if (requiresGuarantor) {
      if (!guarantorTemplate) {
        return new Response(
          JSON.stringify({
            error:
              "Guarantor template not configured for this academic year. Please contact support.",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { data: existingGuarantor } = await supabaseAdmin
        .from("docusign_envelopes")
        .select("id, envelope_id, status")
        .eq("application_id", application.id)
        .eq("envelope_type", "guarantor")
        .maybeSingle();

      if (!existingGuarantor || allowResend) {
        const isResend = Boolean(existingGuarantor);

        // Build textTabs for guarantor agreement
        // Student/Contract fields
        const guarantorTextTabs = [
          ...(tenantNameForDoc ? [{ tabLabel: "student_name", value: tenantNameForDoc }] : []),
          ...(totalRent ? [{ tabLabel: "total_rent", value: totalRent }] : []),
          ...(tenancyPeriod ? [{ tabLabel: "tenancy_period", value: tenancyPeriod }] : []),
          ...(roomNumber ? [{ tabLabel: "room_number", value: String(roomNumber) }] : []),
          // Guarantor fields
          ...(guarantor.name ? [{ tabLabel: "guarantor_name", value: guarantor.name }] : []),
          ...(guarantor.email ? [{ tabLabel: "guarantor_email", value: guarantor.email }] : []),
          ...(guarantor.phone ? [{ tabLabel: "guarantor_phone", value: guarantor.phone }] : []),
          ...(guarantor.relationship ? [{ tabLabel: "guarantor_relationship", value: guarantor.relationship }] : []),
          ...(guarantor.dob ? [{ tabLabel: "guarantor_dob", value: guarantor.dob }] : []),
        ].filter((tab) => tab.value && tab.value.trim().length > 0);

        const guarantorRecipients = [
          {
            roleName: guarantorRole,
            name: guarantor.name,
            email: guarantor.email,
            routingOrder: "1",
            tabs: {
              textTabs: guarantorTextTabs.length > 0 ? guarantorTextTabs : undefined,
            },
          },
        ];
        const guarantorBody = {
          templateId: String(guarantorTemplate.template_id ?? "").trim(),
          status: "sent",
          emailSubject: `${companyName} guarantor agreement – ${studentName || "Student"}`,
          templateRoles: guarantorRecipients,
        };

        console.info(
          isResend ? "Resending guarantor envelope with fresh DocuSign envelope" : "Creating guarantor envelope",
          {
            applicationId: application.id,
            existingEnvelopeId: existingGuarantor?.envelope_id ?? null,
            allowResend,
          },
        );

        const guarantorEnvelope = await sendEnvelope(guarantorBody);
        envelopesCreated.push({
          type: "guarantor",
          envelopeId: guarantorEnvelope.envelopeId,
        });

        if (existingGuarantor) {
          existingGuarantorEnvelopeId = guarantorEnvelope.envelopeId;
          await supabaseAdmin
            .from("docusign_envelopes")
            .update({
              envelope_id: guarantorEnvelope.envelopeId,
              status: guarantorEnvelope.status ?? "sent",
              recipients: guarantorRecipients,
              metadata: guarantorEnvelope,
            })
            .eq("id", existingGuarantor.id);
        } else {
          await supabaseAdmin.from("docusign_envelopes").insert({
            application_id: application.id,
            envelope_type: "guarantor",
            envelope_id: guarantorEnvelope.envelopeId,
            status: guarantorEnvelope.status ?? "sent",
            recipients: guarantorRecipients,
            metadata: guarantorEnvelope,
          });
        }
      } else {
        existingGuarantorEnvelopeId = existingGuarantor.envelope_id ?? null;
        console.info("Guarantor envelope already exists", {
          envelopeId: existingGuarantorEnvelopeId,
          allowResend,
        });
      }
    }

    const responseMessage = envelopesCreated.length === 0
      ? "Agreements for this application have already been sent."
      : requiresGuarantor
      ? "Tenancy and guarantor agreements have been emailed."
      : "Tenancy agreement has been emailed to you and your witness.";

    return new Response(
      JSON.stringify({
        tenancyEnvelopeId:
          envelopesCreated.find((e) => e.type === "tenancy")?.envelopeId ??
          existingTenancyEnvelopeId,
        guarantorEnvelopeId:
          envelopesCreated.find((e) => e.type === "guarantor")?.envelopeId ??
          (requiresGuarantor ? existingGuarantorEnvelopeId : undefined),
        message: responseMessage,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    // Catch-all: always return CORS (use staticCorsHeaders so 500 never lacks CORS)
    console.error("DocuSign integration error:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      applicationId: body?.applicationId,
    });
    const message = error instanceof Error ? error.message : "Server error";
    const hint = getDocusignErrorHint(message);
    return new Response(JSON.stringify({ 
      error: message,
      error_code: hint?.error_code,
      hint: hint?.hint,
      details: isDevelopment
        ? (error instanceof Error ? error.stack : String(error))
        : undefined,
    }), {
      status: 500,
      headers: { ...staticCorsHeaders, "Content-Type": "application/json" },
    });
  }
});

