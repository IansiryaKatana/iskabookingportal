import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const stripe = new Stripe(stripeSecret);
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
    
    console.log("Received payment request:", {
      applicationId,
      amount,
      type,
      label,
      instalmentId,
      typeOfType: typeof type,
      typeOfAmount: typeof amount,
    });
    
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
          contract:contracts (
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
    // Check type explicitly and handle case sensitivity
    const paymentType = String(type || "").toLowerCase().trim();
    console.log("Payment type check:", { originalType: type, normalizedType: paymentType });
    
    if (paymentType === "instalment") {
      console.log("=== INSTALMENT PAYMENT PATH ===");
      console.log("Creating instalment payment:", {
        applicationId,
        instalmentId,
        amount,
        label,
        amountType: typeof amount,
        typeReceived: type,
        normalizedType: paymentType,
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

      if (!application.stripe_customer_id) {
        // Create customer if doesn't exist
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", user.id)
          .maybeSingle();

        const existing = await stripe.customers.list({
          email: user.email ?? undefined,
          limit: 1,
        });

        let customerId: string;
        if (existing.data.length > 0) {
          customerId = existing.data[0].id;
        } else {
          const customer = await stripe.customers.create({
            email: user.email ?? undefined,
            name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
          });
          customerId = customer.id;
        }

        await supabaseAdmin
          .from("student_applications")
          .update({ stripe_customer_id: customerId })
          .eq("id", application.id);
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: paymentAmount,
        currency: "gbp",
        customer: application.stripe_customer_id,
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
        automatic_payment_methods: { enabled: true },
      });

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
    console.log("=== DEPOSIT PAYMENT PATH ===");
    console.log("Type received:", type, "Expected 'instalment' but got:", type);
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

    let customerId = application.stripe_customer_id ?? undefined;

    if (!customerId) {
      const existing = await stripe.customers.list({
        email: user.email ?? undefined,
        limit: 1,
      });

      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: user.email ?? undefined,
          name: [profile?.first_name, profile?.last_name].filter(Boolean).join(
            " ",
          ),
        });
        customerId = customer.id;
      }

      await supabaseAdmin
        .from("student_applications")
        .update({ stripe_customer_id: customerId })
        .eq("id", application.id);
    }

    const paymentIntent = await stripe.paymentIntents.create({
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
      automatic_payment_methods: { enabled: true },
    });

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
