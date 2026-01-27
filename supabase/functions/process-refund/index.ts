import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

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

    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify the user is authenticated
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Check if user is staff
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "staff" && profile.role !== "superadmin")) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Staff access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { payment_id, amount, reason } = await req.json();

    if (!payment_id || !amount || !reason) {
      return new Response(
        JSON.stringify({ error: "payment_id, amount, and reason are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Retrieve the payment intent to get the charge ID
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_id);

    if (!paymentIntent.latest_charge) {
      return new Response(
        JSON.stringify({ error: "Payment intent has no charge" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get the charge
    const charge = await stripe.charges.retrieve(
      typeof paymentIntent.latest_charge === "string"
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge.id,
    );

    // Create the refund
    const refund = await stripe.refunds.create({
      charge: charge.id,
      amount: Math.round(amount), // Amount in pence
      reason: reason.length > 0 ? "requested_by_customer" : undefined,
      metadata: {
        refunded_by: user.id,
        refund_reason: reason,
        payment_intent_id: payment_id,
      },
    });

    // Get application and student info from payment intent metadata
    let applicationId = paymentIntent.metadata?.application_id;
    let studentId = paymentIntent.metadata?.student_id;

    // If metadata is missing, try to find application by payment intent ID
    if (!applicationId && payment_id) {
      const { data: application } = await supabaseClient
        .from("student_applications")
        .select("id, student_id")
        .eq("deposit_payment_intent_id", payment_id)
        .maybeSingle();

      if (application) {
        applicationId = application.id;
        studentId = application.student_id;
      }
    }

    // Record the refund in the database
    const { data: refundRecord, error: refundError } = await supabaseClient
      .from("refunds")
      .insert({
        application_id: applicationId || null,
        student_id: studentId || paymentIntent.customer as string || null,
        payment_intent_id: payment_id,
        stripe_refund_id: refund.id,
        amount_pence: Math.round(amount),
        reason: reason,
        status: refund.status,
        refunded_by: user.id,
        processed_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (refundError) {
      console.error("Error recording refund in database:", refundError);
      // Continue even if DB insert fails - refund was processed in Stripe
    }

    // Log the action in staff activity logs
    if (applicationId) {
      await supabaseClient
        .from("staff_activity_logs")
        .insert({
          staff_id: user.id,
          action: "process_refund",
          entity_type: "refund",
          entity_id: refundRecord?.id || null,
          payload: {
            application_id: applicationId,
            payment_intent_id: payment_id,
            stripe_refund_id: refund.id,
            amount_pence: Math.round(amount),
            reason: reason,
          },
        });
    }

    // Send notification to student if studentId is available
    if (studentId) {
      try {
        // Get student name from Step 1 if application exists
        let studentName = "Student";
        if (applicationId) {
          const { data: step1 } = await supabaseClient
            .from("student_application_steps")
            .select("payload")
            .eq("application_id", applicationId)
            .eq("step_number", 1)
            .single();

          const step1Data = step1?.payload as any;
          if (step1Data?.first_name && step1Data?.last_name) {
            studentName = `${step1Data.first_name} ${step1Data.last_name}`;
          }
        }

        // Create notification
        await supabaseClient
          .from("notifications")
          .insert({
            user_id: studentId,
            title: "Refund Processed",
            message: `A refund of £${(Math.round(amount) / 100).toFixed(2)} has been processed for your payment. ${reason ? `Reason: ${reason}` : ""}`,
            type: "info",
            is_read: false,
            link: "/portal/payments",
          });

        // Send email notification
        await supabaseClient.functions.invoke("send-transactional-email", {
          body: {
            user_id: studentId,
            email_type: "refund_processed",
            variables: {
              student_name: studentName,
              amount: `£${(Math.round(amount) / 100).toFixed(2)}`,
              reason: reason || "No reason provided",
              refund_id: refund.id,
            },
            create_notification: false, // Already created above
          },
        });
      } catch (notifError) {
        console.error("Error sending refund notification:", notifError);
        // Don't fail the refund if notification fails
      }
    }

    return new Response(
      JSON.stringify({
        message: "Refund processed successfully",
        refund_id: refund.id,
        amount: refund.amount,
        status: refund.status,
        refund_record_id: refundRecord?.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in process-refund function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

