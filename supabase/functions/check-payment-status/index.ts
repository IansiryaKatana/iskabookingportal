import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { listPaymentIntents, searchPaymentIntents } from "../_shared/stripe_rest.ts";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

type PaymentIntentLike = { id: string; status: string; amount: number; created: number; metadata?: Record<string, string> };

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

    const { applicationId } = await req.json();
    if (!applicationId) {
      return new Response(JSON.stringify({ error: "applicationId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: application, error: applicationError } = await supabaseAdmin
      .from("student_applications")
      .select("id, stripe_customer_id, student_id")
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

    // Get manual payment instalments for this application (staff-recorded or approved student requests)
    const { data: manualPayments } = await supabaseAdmin
      .from("manual_payments")
      .select("instalment_id, amount, payment_date, created_at")
      .eq("application_id", applicationId)
      .eq("payment_type", "instalment")
      .not("instalment_id", "is", null);

    const manualInstalmentIds = new Set<string>();
    const manualPaidAtByInstalment = new Map<string, string>();
    const manualAmountByInstalment = new Map<string, number>();
    if (manualPayments) {
      manualPayments.forEach((mp: { instalment_id: string; amount: number; payment_date?: string; created_at?: string }) => {
        if (mp.instalment_id) {
          manualInstalmentIds.add(mp.instalment_id);
          manualPaidAtByInstalment.set(mp.instalment_id, mp.payment_date || mp.created_at || new Date().toISOString());
          manualAmountByInstalment.set(mp.instalment_id, Number(mp.amount));
        }
      });
    }

    // Approved student requests: manual_payment may have instalment_id = null (payment_plan_installments case).
    const { data: approvedRequests } = await supabaseAdmin
      .from("manual_payment_requests")
      .select("instalment_id, amount, reviewed_at, submitted_at")
      .eq("application_id", applicationId)
      .eq("status", "approved");
    if (approvedRequests) {
      approvedRequests.forEach((r: { instalment_id: string; amount: number; reviewed_at?: string; submitted_at?: string }) => {
        if (r.instalment_id) {
          manualInstalmentIds.add(r.instalment_id);
          if (!manualPaidAtByInstalment.has(r.instalment_id)) {
            manualPaidAtByInstalment.set(r.instalment_id, r.reviewed_at || r.submitted_at || new Date().toISOString());
            manualAmountByInstalment.set(r.instalment_id, Number(r.amount));
          }
        }
      });
    }

    if (!application.stripe_customer_id) {
      const paidInstalments = Array.from(manualInstalmentIds).map((instalmentId) => ({
        instalmentId,
        paymentIntentId: null as string | null,
        amount: manualAmountByInstalment.get(instalmentId) ?? 0,
        paidAt: manualPaidAtByInstalment.get(instalmentId) ?? new Date().toISOString(),
      }));
      return new Response(JSON.stringify({ paidInstalments }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const allPaymentIntents: PaymentIntentLike[] = [];

    if (application.stripe_customer_id) {
      const listRes = await listPaymentIntents(stripeSecret, {
        customer: application.stripe_customer_id,
        limit: 100,
      });
      if (listRes.data?.data) {
        allPaymentIntents.push(...listRes.data.data);
        console.log(`Found ${listRes.data.data.length} payment intents for customer ${application.stripe_customer_id}`);
      }
    }

    if (applicationId) {
      const searchRes = await searchPaymentIntents(stripeSecret, {
        query: `metadata['application_id']:'${applicationId}'`,
        limit: 100,
      });
      if (searchRes.data?.data) {
        const existingIds = new Set(allPaymentIntents.map((pi) => pi.id));
        searchRes.data.data.forEach((pi) => {
          if (!existingIds.has(pi.id)) allPaymentIntents.push(pi);
        });
        console.log(`Found ${searchRes.data.data.length} payment intents by metadata for application ${applicationId}`);
      }
    }

    console.log(`Total payment intents found: ${allPaymentIntents.length}`);

    const { data: dbPayments } = await supabaseAdmin
      .from("stripe_payments")
      .select("stripe_payment_intent_id, metadata, amount, created_at")
      .eq("student_application_id", applicationId)
      .eq("payment_type", "instalment")
      .in("status", ["succeeded", "completed"]);

    const dbInstalmentIds = new Set<string>();
    if (dbPayments) {
      dbPayments.forEach((payment: { metadata?: { instalment_id?: string } }) => {
        const instalmentId = payment.metadata?.instalment_id;
        if (instalmentId) dbInstalmentIds.add(instalmentId);
      });
    }

    const paidInstalments = allPaymentIntents
      .filter((pi) => {
        const isSucceeded = pi.status === "succeeded";
        const isInstalment = pi.metadata?.type === "instalment";
        const matchesApplication = pi.metadata?.application_id === applicationId;
        const hasInstalmentId = !!pi.metadata?.instalment_id;
        return isSucceeded && isInstalment && matchesApplication && hasInstalmentId;
      })
      .map((pi) => ({
        instalmentId: pi.metadata!.instalment_id as string,
        paymentIntentId: pi.id,
        amount: Number(pi.metadata?.base_amount_pence ?? pi.amount) / 100,
        paidAt: new Date(pi.created * 1000).toISOString(),
      }));

    dbInstalmentIds.forEach((instalmentId) => {
      if (paidInstalments.some((p) => p.instalmentId === instalmentId)) return;
      const dbPayment = dbPayments?.find((p: { metadata?: { instalment_id?: string } }) => p.metadata?.instalment_id === instalmentId);
      if (dbPayment) {
        paidInstalments.push({
          instalmentId,
          paymentIntentId: dbPayment.stripe_payment_intent_id,
          amount: Number(dbPayment.amount),
          paidAt: dbPayment.created_at,
        });
      }
    });

    manualInstalmentIds.forEach((instalmentId) => {
      if (paidInstalments.some((p) => p.instalmentId === instalmentId)) return;
      paidInstalments.push({
        instalmentId,
        paymentIntentId: null,
        amount: manualAmountByInstalment.get(instalmentId) ?? 0,
        paidAt: manualPaidAtByInstalment.get(instalmentId) ?? new Date().toISOString(),
      });
    });

    return new Response(JSON.stringify({ paidInstalments }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error checking payment status:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
