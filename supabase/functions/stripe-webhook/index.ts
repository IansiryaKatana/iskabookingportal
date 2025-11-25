import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
const staffNotificationEmail = Deno.env.get("NOTIFICATIONS_STAFF_EMAIL") ?? "";

const stripe = new Stripe(stripeSecret);
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const sendEmail = async (payload: {
  to: string;
  subject: string;
  html: string;
}) => {
  if (!resendApiKey) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: Deno.env.get("NOTIFICATIONS_FROM_EMAIL") ?? "Urban Hub <noreply@urbanhub.com>",
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
        if (applicationId) {
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
          }

          // Also create a record in stripe_payments table
          if (!error) {
            const { error: paymentError } = await supabaseAdmin
              .from("stripe_payments")
              .insert({
                student_application_id: applicationId,
                stripe_payment_intent_id: paymentIntent.id,
                amount: paymentIntent.amount / 100, // Convert from cents
                currency: paymentIntent.currency.toUpperCase(),
                status: "succeeded",
                payment_type: "deposit",
                metadata: {
                  application_id: applicationId,
                  student_id: paymentIntent.metadata?.student_id,
                },
              })
              .select()
              .single();

            if (paymentError) {
              console.error("Failed to create stripe_payments record:", paymentError);
              // Don't fail the webhook if this fails, but log it
            }
          }

          if (!error) {
            const customerId =
              typeof paymentIntent.customer === "string"
                ? paymentIntent.customer
                : paymentIntent.customer?.id ?? null;

            const studentId = paymentIntent.metadata?.student_id;
            let studentEmail: string | undefined;
            let studentName: string | undefined;

            if (studentId) {
              const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(
                studentId,
              );
              studentEmail = authUser?.user?.email ?? undefined;

              const { data: profile } = await supabaseAdmin
                .from("profiles")
                .select("first_name, last_name")
                .eq("id", studentId)
                .maybeSingle();
              if (profile) {
                studentName = [profile.first_name, profile.last_name]
                  .filter(Boolean)
                  .join(" ");
              }
            }

            // Send deposit received email via transactional email function
            if (studentId) {
              try {
                await supabaseAdmin.functions.invoke("send-transactional-email", {
                  body: {
                    user_id: studentId,
                    email_type: "deposit_received",
                    variables: {
                      student_name: studentName || "Student",
                      amount: `£${(paymentIntent.amount / 100).toFixed(2)}`,
                    },
                    create_notification: true,
                  },
                });
              } catch (emailError) {
                console.error("Error sending deposit received email:", emailError);
                // Fallback to direct email if function fails
                if (studentEmail) {
                  await sendEmail({
                    to: studentEmail,
                    subject: "Urban Hub deposit received",
                    html:
                      `<p>Hi ${studentName ?? ""},</p>
                       <p>Thanks for paying your £${(paymentIntent.amount / 100).toFixed(
                         2,
                       )} deposit. We're preparing your tenancy agreement.</p>
                       <p>You can now continue your booking journey via the Urban Hub portal.</p>`,
                  });
                }
              }
            }

            if (staffNotificationEmail && studentEmail) {
              await sendEmail({
                to: staffNotificationEmail,
                subject: "Deposit received – Urban Hub booking update",
                html:
                  `<p>Deposit payment succeeded for application ${applicationId}.</p>
                   <p>Student: ${studentName ?? studentEmail}</p>
                   <p>Stripe Customer: ${customerId ?? "n/a"}</p>
                   <p>Amount: £${(paymentIntent.amount / 100).toFixed(2)}</p>`,
              });
            }
          }
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const applicationId = paymentIntent.metadata?.application_id;
        if (applicationId) {
          const { error } = await supabaseAdmin
            .from("student_applications")
            .update({ status: "awaiting_deposit" })
            .eq("id", applicationId);

          if (error) {
            console.error("Failed to mark deposit as failed:", error);
          }

          const studentId = paymentIntent.metadata?.student_id;
          if (studentId) {
            const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(
              studentId,
            );
            const studentEmail = authUser?.user?.email ?? undefined;
            if (studentEmail) {
              await sendEmail({
                to: studentEmail,
                subject: "Urban Hub deposit unsuccessful",
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

