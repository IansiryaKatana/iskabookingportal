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
const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

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

const requiredConfig = [
  ["DOCUSIGN_CLIENT_ID", config.clientId],
  ["DOCUSIGN_USER_ID", config.userId],
  ["DOCUSIGN_ACCOUNT_ID", config.accountId],
  ["DOCUSIGN_PRIVATE_KEY", config.privateKey],
  ["DOCUSIGN_TENANCY_TEMPLATE_ID", config.tenancyTemplateId],
  ["STRIPE_SECRET_KEY", stripeSecret],
];

const missing = requiredConfig
  .filter(([, value]) => !value)
  .map(([key]) => key);

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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

    const { applicationId } = await req.json();
    if (!applicationId) {
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
        contract:contracts (
          id,
          name,
          studio_grade:studio_grades ( name )
        ),
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
      if (!stripeSecret || !application.deposit_payment_intent_id) {
        return new Response(
          JSON.stringify({
            error:
              "We’re still processing your deposit. Please wait a moment and try again.",
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
        if (paymentIntent.status === "succeeded") {
          depositVerified = true;
          await supabaseAdmin
            .from("student_applications")
            .update({
              status: "awaiting_signature",
            })
            .eq("id", application.id);
          application.status = "awaiting_signature";
        } else {
          const friendlyStatus = paymentIntent.status.replaceAll("_", " ");
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
    const requiresGuarantor = Boolean(application.selected_payment_plan_id);

    // Build auto-fill values for tenancy template
    const academicYear = formatAcademicYear(application.contract?.contract_start);
    const tenantNameForDoc = studentName || studentEmail;
    const roomNumber =
      (application.assigned_studio as any)?.room_number ??
      (application.assigned_studio as any)?.name ??
      (application.assigned_studio as any)?.code ??
      "";
    const tenancyPeriod =
      application.contract?.contract_start && application.contract?.contract_end
        ? `${formatGbDate(application.contract.contract_start)} – ${formatGbDate(
            application.contract.contract_end,
          )}${application.contract?.weeks ? ` (${application.contract.weeks} weeks)` : ""}`
        : "";

    // Optional: compute plan summary and total from selected plan
    let planSummary = "";
    let totalRentPence: number | null = null;
    if (application.selected_payment_plan_id) {
      try {
        const { data: installments } = await supabaseAdmin
          .from("payment_plan_installments")
          .select("amount_pence, due_date, sequence")
          .eq("payment_plan_id", application.selected_payment_plan_id)
          .order("sequence", { ascending: true });
        if (installments && installments.length) {
          totalRentPence = installments.reduce(
            (sum, it) => sum + (it.amount_pence ?? 0),
            0,
          );
          planSummary = installments
            .map((it) => {
              const amt =
                typeof it.amount_pence === "number"
                  ? formatGBP(it.amount_pence)
                  : "";
              const due = it.due_date ? formatGbDate(it.due_date) : "";
              return [amt, due].filter(Boolean).join(" due ");
            })
            .join("; ");
        }
      } catch {
        // ignore; leave empty if lookup fails
      }
    }

    const totalRent =
      typeof totalRentPence === "number" ? formatGBP(totalRentPence) : "";

    const witness = {
      name: (paymentPayload.witness_name as string) ?? "",
      email: (paymentPayload.witness_email as string) ?? "",
      phone: (paymentPayload.witness_phone as string) ?? "",
    };

    const guarantor = {
      name: (paymentPayload.guarantor_name as string) ?? "",
      email: (paymentPayload.guarantor_email as string) ?? "",
      phone: (paymentPayload.guarantor_phone as string) ?? "",
      relationship: (paymentPayload.guarantor_relationship as string) ?? "",
      dob: (paymentPayload.guarantor_dob as string) ?? "",
    };

    if (!requiresGuarantor) {
      if (!witness.name.trim() || !witness.email.trim()) {
        return new Response(
          JSON.stringify({
            error:
              "Witness details are required before we can send the tenancy agreement.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    } else if (!guarantor.name.trim() || !guarantor.email.trim()) {
      return new Response(
        JSON.stringify({
          error:
            "Guarantor details are required before we can send the agreements.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const textTabs = [
      ...(studentPhone
        ? [{ tabLabel: "student_phone", value: studentPhone }]
        : []),
      ...(academicYear ? [{ tabLabel: "academic_year", value: academicYear }] : []),
      ...(tenantNameForDoc ? [{ tabLabel: "tenant_name", value: tenantNameForDoc }] : []),
      ...(roomNumber ? [{ tabLabel: "room_number", value: String(roomNumber) }] : []),
      ...(tenancyPeriod ? [{ tabLabel: "tenancy_period", value: tenancyPeriod }] : []),
      ...(totalRent ? [{ tabLabel: "total_rent", value: totalRent }] : []),
      ...(planSummary ? [{ tabLabel: "plan_summary", value: planSummary }] : []),
    ].filter((tab) => tab.value && tab.value.trim().length > 0);

    const tenancyRecipients = [
      {
        roleName: config.tenancyStudentRole,
        name: studentName || studentEmail,
        email: studentEmail,
        routingOrder: "1",
        clientUserId: application.student_id,
        ...(textTabs.length > 0 ? { tabs: { textTabs } } : {}),
      },
    ];

    if (!requiresGuarantor) {
      tenancyRecipients.push({
        roleName: config.tenancyWitnessRole,
        name: witness.name,
        email: witness.email,
        routingOrder: "2",
      });
    }

    const tenancyBody = {
      templateId: config.tenancyTemplateId,
      status: "sent",
      emailSubject: `Urban Hub tenancy agreement – ${
        application.contract?.studio_grade?.name ?? "Urban Hub"
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

    if (!existingTenancy) {
      console.info("Creating tenancy envelope with tabs", {
        tabLabels: tenancyRecipients[0]?.tabs?.textTabs?.map((t: any) => t.tabLabel),
      });
      const tenancyEnvelope = await sendEnvelope(tenancyBody);
      envelopesCreated.push({
        type: "tenancy",
        envelopeId: tenancyEnvelope.envelopeId,
      });
      await supabaseAdmin.from("docusign_envelopes").insert({
        application_id: application.id,
        envelope_type: "tenancy",
        envelope_id: tenancyEnvelope.envelopeId,
        status: tenancyEnvelope.status ?? "sent",
        recipients: tenancyRecipients,
        metadata: tenancyEnvelope,
      });
    } else {
      existingTenancyEnvelopeId = existingTenancy.envelope_id ?? null;
      console.info("Tenancy envelope already exists", {
        envelopeId: existingTenancyEnvelopeId,
      });
    }

    if (requiresGuarantor) {
      if (!config.guarantorTemplateId) {
        return new Response(
          JSON.stringify({
            error:
              "DOCUSIGN_GUARANTOR_TEMPLATE_ID is not configured. Please add it before sending guarantor agreements.",
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

      let existingGuarantorEnvelopeId: string | null = null;

      if (!existingGuarantor) {
        const guarantorRecipients = [
          {
            roleName: config.guarantorRole,
            name: guarantor.name,
            email: guarantor.email,
            routingOrder: "1",
          },
        ];
        const guarantorBody = {
          templateId: config.guarantorTemplateId,
          status: "sent",
          emailSubject: `Urban Hub guarantor agreement – ${studentName || "Student"}`,
          templateRoles: guarantorRecipients,
        };
        const guarantorEnvelope = await sendEnvelope(guarantorBody);
        envelopesCreated.push({
          type: "guarantor",
          envelopeId: guarantorEnvelope.envelopeId,
        });
        await supabaseAdmin.from("docusign_envelopes").insert({
          application_id: application.id,
          envelope_type: "guarantor",
          envelope_id: guarantorEnvelope.envelopeId,
          status: guarantorEnvelope.status ?? "sent",
          recipients: guarantorRecipients,
          metadata: guarantorEnvelope,
        });
      } else {
        existingGuarantorEnvelopeId = existingGuarantor.envelope_id ?? null;
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
    console.error("DocuSign integration error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

