import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { notifyBookingEvent } from "../_shared/booking-notifications.ts";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const stripe = new Stripe(stripeSecret);
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
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

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const isStaff = profile?.role === "staff" || profile?.role === "superadmin";

    const { applicationId, paymentIntentId } = await req.json();

    if (!applicationId && !paymentIntentId) {
      return new Response(
        JSON.stringify({ error: "applicationId or paymentIntentId required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get application to find customer ID
    let application;
    if (applicationId) {
      const { data: appData, error: appError } = await supabaseAdmin
        .from("student_applications")
        .select("id, student_id, stripe_customer_id")
        .eq("id", applicationId)
        .maybeSingle();

      if (appError) {
        console.error("Error fetching application:", appError);
        return new Response(
          JSON.stringify({ error: "Error fetching application", details: appError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (!appData) {
        console.error("Application not found:", applicationId);
        return new Response(
          JSON.stringify({ error: "Application not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      
      // If user is not staff, verify they own this application
      if (!isStaff && appData.student_id !== user.id) {
        console.error("Ownership check failed:", {
          applicationId,
          applicationStudentId: appData.student_id,
          userId: user.id,
          isStaff,
        });
        return new Response(
          JSON.stringify({ 
            error: "Forbidden - You can only sync payments for your own applications",
            details: `Application ${applicationId} belongs to ${appData.student_id}, but user is ${user.id}`
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      
      application = appData;
      console.log("Application verified:", { applicationId, studentId: appData.student_id, userId: user.id });
    }

    // Find payment intents
    const paymentIntents: Stripe.PaymentIntent[] = [];

    let requestedPaymentIntentStatus: string | null = null;

    if (paymentIntentId) {
      // Get specific payment intent
      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        requestedPaymentIntentStatus = pi.status;

        if (
          applicationId &&
          pi.metadata?.application_id &&
          pi.metadata.application_id !== applicationId
        ) {
          return new Response(
            JSON.stringify({
              success: false,
              verified: false,
              error: "Payment intent does not belong to this application",
            }),
            {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        if (pi.status === "succeeded") {
          paymentIntents.push(pi);
        } else {
          return new Response(
            JSON.stringify({
              success: false,
              verified: false,
              status: pi.status,
              synced: 0,
              payments: [],
              error: `Payment intent status is ${pi.status}`,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      } catch (err) {
        console.error("Error retrieving payment intent:", err);
        return new Response(
          JSON.stringify({
            success: false,
            verified: false,
            synced: 0,
            error: "Unable to retrieve payment intent from Stripe",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    } else if (application?.stripe_customer_id) {
      // Get all payment intents for customer
      try {
        const customerPayments = await stripe.paymentIntents.list({
          customer: application.stripe_customer_id,
          limit: 100,
        });
        paymentIntents.push(
          ...customerPayments.data.filter((pi) => pi.status === "succeeded"),
        );
      } catch (err) {
        console.error("Error listing payment intents:", err);
      }
    }

    if (applicationId) {
      // Also search by application_id metadata
      try {
        const metadataSearch = await stripe.paymentIntents.search({
          query: `metadata['application_id']:'${applicationId}'`,
          limit: 100,
        });
        const existingIds = new Set(paymentIntents.map((pi) => pi.id));
        metadataSearch.data
          .filter((pi) => pi.status === "succeeded" && !existingIds.has(pi.id))
          .forEach((pi) => paymentIntents.push(pi));
      } catch (err) {
        console.error("Error searching payment intents by metadata:", err);
      }
    }

    const syncedPayments = [];
    const errors = [];

    for (const paymentIntent of paymentIntents) {
      const applicationIdFromMetadata = paymentIntent.metadata?.application_id;
      const paymentType = paymentIntent.metadata?.type || "deposit";

      if (!applicationIdFromMetadata) {
        if (applicationId) {
          // Use provided applicationId if metadata doesn't have it
          paymentIntent.metadata = {
            ...paymentIntent.metadata,
            application_id: applicationId,
          };
        } else {
          errors.push({
            paymentIntentId: paymentIntent.id,
            error: "No application_id in metadata",
          });
          continue;
        }
      }

      const targetApplicationId =
        applicationIdFromMetadata || applicationId;

      // If user is not staff, verify they own this application
      // Skip check if we already verified ownership for this applicationId
      if (!isStaff && targetApplicationId) {
        // If we already verified this applicationId earlier, skip the check
        const alreadyVerified = application && application.id === targetApplicationId;
        
        if (!alreadyVerified) {
          console.log("Checking ownership for payment intent:", {
            paymentIntentId: paymentIntent.id,
            targetApplicationId,
            userId: user.id,
          });
          
          const { data: appCheck, error: appCheckError } = await supabaseAdmin
            .from("student_applications")
            .select("student_id")
            .eq("id", targetApplicationId)
            .maybeSingle();
          
          if (appCheckError) {
            console.error("Error checking application ownership:", appCheckError);
            errors.push({
              paymentIntentId: paymentIntent.id,
              error: "Error verifying application ownership",
            });
            continue;
          }
          
          if (!appCheck || appCheck.student_id !== user.id) {
            console.error("Ownership check failed in loop:", {
              paymentIntentId: paymentIntent.id,
              targetApplicationId,
              applicationStudentId: appCheck?.student_id,
              userId: user.id,
            });
            errors.push({
              paymentIntentId: paymentIntent.id,
              error: "Forbidden - You can only sync payments for your own applications",
            });
            continue;
          }
        } else {
          console.log("Skipping ownership check - already verified:", {
            paymentIntentId: paymentIntent.id,
            applicationId: application.id,
          });
        }
      }

      // Check if payment already exists
      const { data: existingPayment } = await supabaseAdmin
        .from("stripe_payments")
        .select("id")
        .eq("stripe_payment_intent_id", paymentIntent.id)
        .maybeSingle();

      if (existingPayment) {
        console.log(
          `Payment ${paymentIntent.id} already exists, skipping insert`,
        );
      } else {
        // Create payment record
        const instalmentId = paymentIntent.metadata?.instalment_id;
        const label = paymentIntent.metadata?.label || "Payment";
        const baseAmountPence = Number(paymentIntent.metadata?.base_amount_pence ?? paymentIntent.amount);
        const grossAmountPence = paymentIntent.amount;
        const processingFeePence = Number(paymentIntent.metadata?.processing_fee_pence ?? Math.max(0, grossAmountPence - baseAmountPence));

        const { error: insertError } = await supabaseAdmin
          .from("stripe_payments")
          .insert({
            student_application_id: targetApplicationId,
            stripe_payment_intent_id: paymentIntent.id,
            amount: baseAmountPence / 100,
            currency: paymentIntent.currency.toUpperCase(),
            status: "succeeded",
            payment_type: paymentType,
            metadata: {
              application_id: targetApplicationId,
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
              type: paymentType,
            },
          })
          .select()
          .single();

        if (insertError) {
          console.error(
            `Error creating payment record for ${paymentIntent.id}:`,
            insertError,
          );
          errors.push({
            paymentIntentId: paymentIntent.id,
            error: insertError.message,
          });
          continue;
        }
      }

      // For deposit payments, ensure the application and step 5 payload reflect the paid state
      if (paymentType === "deposit" && targetApplicationId) {
        try {
          // Update application deposit reference and status if needed
          const { data: appRow, error: appFetchError } = await supabaseAdmin
            .from("student_applications")
            .select("id, deposit_payment_intent_id, status")
            .eq("id", targetApplicationId)
            .maybeSingle();

          if (appFetchError) {
            console.error("Error fetching application for deposit sync:", appFetchError);
          } else if (appRow) {
            const needsDepositIntentUpdate =
              !appRow.deposit_payment_intent_id ||
              appRow.deposit_payment_intent_id === "";

            if (needsDepositIntentUpdate || appRow.status === "awaiting_deposit") {
              const updates: Record<string, unknown> = {};
              if (needsDepositIntentUpdate) {
                updates.deposit_payment_intent_id = paymentIntent.id;
              }
              if (appRow.status === "awaiting_deposit") {
                updates.status = "awaiting_signature";
              }

              if (Object.keys(updates).length > 0) {
                const { error: appUpdateError } = await supabaseAdmin
                  .from("student_applications")
                  .update(updates)
                  .eq("id", targetApplicationId);

                if (appUpdateError) {
                  console.error("Error updating application during deposit sync:", appUpdateError);
                }
              }
            }
          }

          // Update step 5 payload.deposit_paid = true so the wizard reflects the synced deposit
          const { data: step5, error: stepError } = await supabaseAdmin
            .from("student_application_steps")
            .select("id, payload")
            .eq("application_id", targetApplicationId)
            .eq("step_number", 5)
            .maybeSingle();

          if (stepError) {
            console.error("Failed to fetch Step 5 for deposit sync:", stepError);
          } else if (step5?.id) {
            const currentPayload =
              (step5.payload && typeof step5.payload === "object"
                ? step5.payload
                : {}) as Record<string, unknown>;

            if (currentPayload.deposit_paid !== true) {
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
                console.error("Failed to update Step 5 payload during deposit sync:", stepUpdateError);
              }
            }
          }
        } catch (depositSyncError) {
          console.error("Unexpected error while syncing deposit state:", depositSyncError);
        }

        // Notify only when this sync newly recorded the deposit (avoid duplicate with stripe-webhook)
        if (!existingPayment) {
          try {
            const baseAmountPence = Number(
              paymentIntent.metadata?.base_amount_pence ?? paymentIntent.amount,
            );
            await notifyBookingEvent(
              supabaseAdmin,
              "deposit_paid",
              targetApplicationId,
              {
                amount: `£${(baseAmountPence / 100).toFixed(2)}`,
                paymentMethod: "Stripe (synced)",
              },
            );
          } catch (notifyError) {
            console.error("Error sending deposit notifications after sync:", notifyError);
          }
        }
      }

      syncedPayments.push({
        paymentIntentId: paymentIntent.id,
        amount: Number(paymentIntent.metadata?.base_amount_pence ?? paymentIntent.amount) / 100,
        type: paymentType,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        verified: paymentIntentId ? requestedPaymentIntentStatus === "succeeded" : true,
        status: requestedPaymentIntentStatus ?? undefined,
        synced: syncedPayments.length,
        payments: syncedPayments,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error syncing payments:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

