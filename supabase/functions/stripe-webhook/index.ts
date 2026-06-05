import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCredential } from "../_shared/get-credential.ts";
import { notifyBookingEvent } from "../_shared/booking-notifications.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const getCompanyName = async (): Promise<string> => {
  try {
    const { data } = await supabaseAdmin
      .from("branding_settings")
      .select("setting_value")
      .eq("setting_key", "company_name")
      .maybeSingle();
    return data?.setting_value || "Urban Hub";
  } catch {
    return "Urban Hub";
  }
};

const sendEmail = async (payload: {
  to: string;
  subject: string;
  html: string;
}) => {
  // Get credentials from database with env var fallback
  const resendApiKey = await getCredential("RESEND_API_KEY", {
    supabase: supabaseAdmin,
    fallback: Deno.env.get("RESEND_API_KEY") ?? "",
  });
  if (!resendApiKey) return;
  
  const companyName = await getCompanyName();
  const fromEmail = await getCredential("NOTIFICATIONS_FROM_EMAIL", {
    supabase: supabaseAdmin,
    fallback: Deno.env.get("NOTIFICATIONS_FROM_EMAIL") ?? `${companyName} <noreply@send.portal.urbanhub.uk>`,
  });
  
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    }),
  });
};

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Get credentials from database with env var fallback (cached for performance)
  const [stripeSecret, webhookSecret] = await Promise.all([
    getCredential("STRIPE_SECRET_KEY", {
      supabase: supabaseAdmin,
      fallback: Deno.env.get("STRIPE_SECRET_KEY") ?? "",
    }),
    getCredential("STRIPE_WEBHOOK_SECRET", {
      supabase: supabaseAdmin,
      fallback: Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "",
    }),
  ]);

  const stripe = new Stripe(stripeSecret);

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid payload";
    console.error("Stripe webhook verification failed:", message);
    return new Response(`Webhook Error: ${message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const applicationId = paymentIntent.metadata?.application_id;
        const paymentType = paymentIntent.metadata?.type || "deposit";
        const baseAmountPence = Number(paymentIntent.metadata?.base_amount_pence ?? paymentIntent.amount);
        const grossAmountPence = paymentIntent.amount;
        const processingFeePence = Number(paymentIntent.metadata?.processing_fee_pence ?? Math.max(0, grossAmountPence - baseAmountPence));
        
        if (applicationId) {
          // Handle deposit payments
          if (paymentType === "deposit") {
            const updates: Record<string, unknown> = {
              status: "awaiting_signature",
              deposit_payment_intent_id: paymentIntent.id,
              stripe_customer_id:
                typeof paymentIntent.customer === "string"
                  ? paymentIntent.customer
                  : null,
              reserved_studio_expires_at: null,
              submitted_at: new Date().toISOString(),
            };

            const { error } = await supabaseAdmin
              .from("student_applications")
              .update(updates)
              .eq("id", applicationId);

            if (error) {
              console.error("Failed to update application after deposit:", error);
            } else {
              try {
                // Also mark Step 5 payload as deposit_paid = true so the wizard reflects Stripe deposits
                const { data: step5, error: stepError } = await supabaseAdmin
                  .from("student_application_steps")
                  .select("id, payload")
                  .eq("application_id", applicationId)
                  .eq("step_number", 5)
                  .maybeSingle();

                if (stepError) {
                  console.error("Failed to fetch Step 5 for deposit update:", stepError);
                } else if (step5?.id) {
                  const currentPayload =
                    (step5.payload && typeof step5.payload === "object"
                      ? step5.payload
                      : {}) as Record<string, unknown>;

                  const updatedPayload = {
                    ...currentPayload,
                    deposit_paid: true,
                  };

                  const { error: stepUpdateError } = await supabaseAdmin
                    .from("student_application_steps")
                    .update({
                      payload: updatedPayload,
                    })
                    .eq("id", step5.id);

                  if (stepUpdateError) {
                    console.error("Failed to update Step 5 payload after Stripe deposit:", stepUpdateError);
                  }
                }
              } catch (stepException) {
                console.error("Unexpected error updating Step 5 after Stripe deposit:", stepException);
              }
            }

            // Create a record in stripe_payments table for deposit
            if (!error) {
              const { error: paymentError } = await supabaseAdmin
                .from("stripe_payments")
                .insert({
                  student_application_id: applicationId,
                  stripe_payment_intent_id: paymentIntent.id,
                  amount: baseAmountPence / 100,
                  currency: paymentIntent.currency.toUpperCase(),
                  status: "succeeded",
                  payment_type: "deposit",
                  metadata: {
                    application_id: applicationId,
                    student_id: paymentIntent.metadata?.student_id,
                    base_amount_pence: String(baseAmountPence),
                    base_amount_pounds: String(baseAmountPence / 100),
                    processing_fee_pence: String(processingFeePence),
                    processing_fee_pounds: String(processingFeePence / 100),
                    gross_amount_pence: String(grossAmountPence),
                    gross_amount_pounds: String(grossAmountPence / 100),
                    fee_percent: paymentIntent.metadata?.fee_percent,
                    fee_fixed_pence: paymentIntent.metadata?.fee_fixed_pence,
                  },
                })
                .select()
                .single();

              if (paymentError) {
                console.error("Failed to create stripe_payments record:", paymentError);
              }
            }
          } 
          // Handle installment payments
          else if (paymentType === "instalment") {
            const instalmentId = paymentIntent.metadata?.instalment_id;
            const label = paymentIntent.metadata?.label || "Instalment";
            
            console.log("Processing installment payment:", {
              applicationId,
              instalmentId,
              paymentIntentId: paymentIntent.id,
              amount: paymentIntent.amount / 100,
            });

            // Create a record in stripe_payments table for installment
            // Note: instalment_id is stored in metadata since the table doesn't have that column
            const { error: paymentError } = await supabaseAdmin
              .from("stripe_payments")
              .insert({
                student_application_id: applicationId,
                stripe_payment_intent_id: paymentIntent.id,
                amount: baseAmountPence / 100,
                currency: paymentIntent.currency.toUpperCase(),
                status: "succeeded",
                payment_type: "instalment",
                metadata: {
                  application_id: applicationId,
                  student_id: paymentIntent.metadata?.student_id,
                  instalment_id: instalmentId,
                  label: label,
                  amount_pounds: String(baseAmountPence / 100),
                  base_amount_pence: String(baseAmountPence),
                  base_amount_pounds: String(baseAmountPence / 100),
                  processing_fee_pence: String(processingFeePence),
                  processing_fee_pounds: String(processingFeePence / 100),
                  gross_amount_pence: String(grossAmountPence),
                  gross_amount_pounds: String(grossAmountPence / 100),
                  fee_percent: paymentIntent.metadata?.fee_percent,
                  fee_fixed_pence: paymentIntent.metadata?.fee_fixed_pence,
                },
              })
              .select()
              .single();

            if (paymentError) {
              console.error("Failed to create stripe_payments record for installment:", paymentError);
            } else {
              console.log("Successfully recorded installment payment in stripe_payments");
            }
          }

          // Deposit notifications → student + reservationist/accountant staff
          if (paymentType === "deposit" && !error) {
            try {
              await notifyBookingEvent(
                supabaseAdmin,
                "deposit_paid",
                applicationId,
                {
                  amount: `£${(paymentIntent.amount / 100).toFixed(2)}`,
                  paymentMethod: "Stripe",
                },
              );
            } catch (notifyError) {
              console.error("Error sending deposit booking notifications:", notifyError);
            }
          }
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const applicationId = paymentIntent.metadata?.application_id;
        const paymentType = paymentIntent.metadata?.type || "deposit";
        if (applicationId && paymentType === "deposit") {
          const { data: appRow } = await supabaseAdmin
            .from("student_applications")
            .select("deposit_payment_intent_id")
            .eq("id", applicationId)
            .maybeSingle();

          const updates: Record<string, unknown> = { status: "awaiting_deposit" };
          if (appRow?.deposit_payment_intent_id === paymentIntent.id) {
            updates.deposit_payment_intent_id = null;
          }

          const { error } = await supabaseAdmin
            .from("student_applications")
            .update(updates)
            .eq("id", applicationId);

          if (error) {
            console.error("Failed to mark deposit as failed:", error);
          } else {
            try {
              const { data: step5 } = await supabaseAdmin
                .from("student_application_steps")
                .select("id, payload")
                .eq("application_id", applicationId)
                .eq("step_number", 5)
                .maybeSingle();

              if (step5?.id && step5.payload && typeof step5.payload === "object") {
                const currentPayload = step5.payload as Record<string, unknown>;
                if (currentPayload.deposit_paid === true) {
                  await supabaseAdmin
                    .from("student_application_steps")
                    .update({
                      payload: { ...currentPayload, deposit_paid: false },
                    })
                    .eq("id", step5.id);
                }
              }
            } catch (stepException) {
              console.error("Failed to reset Step 5 after deposit failure:", stepException);
            }
          }

          const studentId = paymentIntent.metadata?.student_id;
          if (studentId) {
            const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(
              studentId,
            );
            const studentEmail = authUser?.user?.email ?? undefined;
            if (studentEmail) {
              const companyName = await getCompanyName();
              await sendEmail({
                to: studentEmail,
                subject: `${companyName} deposit unsuccessful`,
                html:
                  `<p>Hi there,</p>
                   <p>We were unable to collect your deposit. Please return to the booking portal and try again or contact the team if you need help.</p>`,
              });
            }
          }
        }
        break;
      }
      default:
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error handling Stripe webhook:", error);
    return new Response("Server Error", { status: 500 });
  }
});

