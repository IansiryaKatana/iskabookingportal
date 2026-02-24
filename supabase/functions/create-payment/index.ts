import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import {
  listCustomersByEmail,
  createCustomer,
  createPaymentIntent,
} from "../_shared/stripe_rest.ts";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

/** Prevent browsers and proxies from caching payment responses (avoids stale 404/200) */
const noCacheHeaders = { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache" };

serve(async (req) => {
  const corsHeaders = { ...getCorsHeaders(req), ...noCacheHeaders };
  
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

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

    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error("Error parsing request body:", parseError);
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { applicationId, amount, type, label, instalmentId } = requestBody;
    const isInstalment = String(type || "").toLowerCase().trim() === "instalment";

    console.log(
      isInstalment
        ? "Instalment payment request"
        : "Deposit payment request (amount from contract)",
      { applicationId }
    );

    if (!applicationId) {
      return new Response(JSON.stringify({ error: "applicationId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: application, error: applicationError } = await supabaseAdmin
      .from("student_applications")
      .select(
        `
          id,
          status,
          student_id,
          stripe_customer_id,
          assigned_studio_id,
          deposit_payment_intent_id,
          contract:contracts!contract_id (
            id,
            slug,
            deposit_override,
            contract_start,
            studio_grade:studio_grades ( name ),
            payment_plan:payment_plans ( id, name, deposit_amount )
          )
        `,
      )
      .eq("id", applicationId)
      .single();

    if (applicationError || !application) {
      console.error("Application lookup failed:", { applicationId, applicationError: applicationError?.message });
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

    // Handle instalment payments FIRST - before deposit logic
    if (isInstalment) {
      console.log("=== INSTALMENT PAYMENT PATH ===");
      console.log("Creating instalment payment:", {
        applicationId,
        instalmentId,
        amount,
        label,
      });
      
      if (!instalmentId) {
        console.error("Missing instalmentId for instalment payment");
        return new Response(
          JSON.stringify({ error: "instalmentId required for instalment payments" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      
      if (!amount || amount <= 0) {
        console.error("Invalid instalment amount:", amount);
        return new Response(
          JSON.stringify({ error: "Invalid instalment amount" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Amount is in pounds, convert to pence
      const paymentAmount = typeof amount === "number" 
        ? Math.round(amount * 100) 
        : Math.round(parseFloat(String(amount)) * 100);
      
      console.log("Payment amount calculated:", {
        originalAmount: amount,
        paymentAmountPence: paymentAmount,
        paymentAmountPounds: paymentAmount / 100,
      });
      
      // Verify we're not accidentally using deposit amount
      if (paymentAmount === 9900) {
        console.error("WARNING: Payment amount is £99 (deposit amount)! This should not happen for instalments.");
        console.error("Original amount received:", amount);
      }

      let customerId = application.stripe_customer_id ?? "";
      if (!customerId) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", user.id)
          .maybeSingle();

        const listRes = await listCustomersByEmail(stripeSecret, user.email ?? "");
        const list = listRes.data as { data: { id: string }[] } | null;
        if (list?.data?.length) {
          customerId = list.data[0].id;
        } else {
          const created = await createCustomer(stripeSecret, {
            email: user.email ?? undefined,
            name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
          });
          if (created.error || !created.data) {
            console.error("Stripe create customer failed:", created.error);
            return new Response(JSON.stringify({ error: created.error?.message ?? "Failed to create customer" }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          customerId = created.data.id;
        }

        await supabaseAdmin
          .from("student_applications")
          .update({ stripe_customer_id: customerId })
          .eq("id", application.id);
      }

      const piRes = await createPaymentIntent(stripeSecret, {
        amount: paymentAmount,
        currency: "gbp",
        customer: customerId,
        receipt_email: user.email ?? undefined,
        description: `Urban Hub instalment – ${label || "Payment"} – ${application.contract?.studio_grade?.name ?? "Studio"}`,
        metadata: {
          application_id: application.id,
          student_id: application.student_id,
          contract_id: application.contract?.id ?? "",
          type: "instalment",
          instalment_id: instalmentId || "",
          label: label || "",
          amount_pounds: String(amount),
        },
      });
      if (piRes.error || !piRes.data) {
        console.error("Stripe create payment intent failed:", piRes.error);
        return new Response(JSON.stringify({ error: piRes.error?.message ?? "Failed to create payment intent" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const paymentIntent = piRes.data;

      console.log("Payment intent created:", {
        id: paymentIntent.id,
        amount: paymentIntent.amount,
        amountPounds: paymentIntent.amount / 100,
        status: paymentIntent.status,
        metadata: paymentIntent.metadata,
      });

      console.log("=== RETURNING INSTALMENT PAYMENT INTENT ===");
      return new Response(
        JSON.stringify({
          clientSecret: paymentIntent.client_secret,
          amount: paymentAmount,
          currency: "GBP",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // Handle deposit payments (existing logic)
    console.log("Deposit payment path: creating PaymentIntent");
    if (!application.assigned_studio_id) {
      return new Response(
        JSON.stringify({
          error: "Reserve a studio before paying the deposit",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const depositValue =
      application.contract?.deposit_override ??
      application.contract?.payment_plan?.deposit_amount ??
      99;

    if (depositValue <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid deposit amount configured" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const depositAmount = Math.round(depositValue * 100);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();

    let customerId = application.stripe_customer_id ?? "";

    if (!customerId) {
      const listRes = await listCustomersByEmail(stripeSecret, user.email ?? "");
      const list = listRes.data as { data: { id: string }[] } | null;
      if (list?.data?.length) {
        customerId = list.data[0].id;
      } else {
        const created = await createCustomer(stripeSecret, {
          email: user.email ?? undefined,
          name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
        });
        if (created.error || !created.data) {
          console.error("Stripe create customer failed:", created.error);
          return new Response(JSON.stringify({ error: created.error?.message ?? "Failed to create customer" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        customerId = created.data.id;
      }

      await supabaseAdmin
        .from("student_applications")
        .update({ stripe_customer_id: customerId })
        .eq("id", application.id);
    }

    const piRes = await createPaymentIntent(stripeSecret, {
      amount: depositAmount,
      currency: "gbp",
      customer: customerId,
      receipt_email: user.email ?? undefined,
      description: `Urban Hub deposit – ${application.contract?.studio_grade?.name ?? "Studio"}`,
      metadata: {
        application_id: application.id,
        student_id: application.student_id,
        contract_id: application.contract?.id ?? "",
        type: "deposit",
      },
    });
    if (piRes.error || !piRes.data) {
      console.error("Stripe create payment intent failed:", piRes.error);
      return new Response(JSON.stringify({ error: piRes.error?.message ?? "Failed to create payment intent" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const paymentIntent = piRes.data;

    await supabaseAdmin
      .from("student_applications")
      .update({
        deposit_payment_intent_id: paymentIntent.id,
        status:
          application.status === "draft"
            ? "awaiting_deposit"
            : application.status,
      })
      .eq("id", application.id);

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        amount: depositAmount,
        currency: "GBP",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Error creating payment intent:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
