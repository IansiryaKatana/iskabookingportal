import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
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

    if (!application.stripe_customer_id) {
      return new Response(
        JSON.stringify({ paidInstalments: [] }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // Get all payment intents for this customer with instalment type
    const allPaymentIntents: Stripe.PaymentIntent[] = [];
    
    // First, try to get payment intents by customer
    if (application.stripe_customer_id) {
      try {
        const customerPayments = await stripe.paymentIntents.list({
          customer: application.stripe_customer_id,
          limit: 100,
        });
        allPaymentIntents.push(...customerPayments.data);
        console.log(`Found ${customerPayments.data.length} payment intents for customer ${application.stripe_customer_id}`);
      } catch (err) {
        console.error("Error fetching payment intents by customer:", err);
      }
    }
    
    // Also search by application_id metadata directly (more reliable)
    if (applicationId) {
      try {
        const metadataSearch = await stripe.paymentIntents.search({
          query: `metadata['application_id']:'${applicationId}'`,
          limit: 100,
        });
        console.log(`Found ${metadataSearch.data.length} payment intents by metadata for application ${applicationId}`);
        
        // Merge results, avoiding duplicates
        const existingIds = new Set(allPaymentIntents.map(pi => pi.id));
        metadataSearch.data.forEach(pi => {
          if (!existingIds.has(pi.id)) {
            allPaymentIntents.push(pi);
          }
        });
      } catch (err) {
        console.error("Error searching payment intents by metadata:", err);
        // Continue with customer-based search if metadata search fails
      }
    }
    
    console.log(`Total payment intents found: ${allPaymentIntents.length}`);

    // Log all payment intents for debugging
    console.log("All payment intents:", allPaymentIntents.map(pi => ({
      id: pi.id,
      status: pi.status,
      metadata: pi.metadata,
      customer: pi.customer,
    })));

    // Filter for successful instalment payments for this application
    const paidInstalments = allPaymentIntents
      .filter((pi) => {
        const isSucceeded = pi.status === "succeeded";
        const isInstalment = pi.metadata?.type === "instalment";
        const matchesApplication = pi.metadata?.application_id === applicationId;
        const hasInstalmentId = !!pi.metadata?.instalment_id;
        
        console.log(`Payment intent ${pi.id}:`, {
          isSucceeded,
          isInstalment,
          matchesApplication,
          hasInstalmentId,
          metadata: pi.metadata,
        });
        
        return isSucceeded && isInstalment && matchesApplication && hasInstalmentId;
      })
      .map((pi) => ({
        instalmentId: pi.metadata.instalment_id as string,
        paymentIntentId: pi.id,
        amount: pi.amount / 100, // Convert from pence to pounds
        paidAt: new Date(pi.created * 1000).toISOString(),
      }));
    
    console.log(`Found ${paidInstalments.length} paid instalments:`, paidInstalments);

    return new Response(
      JSON.stringify({ paidInstalments }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Error checking payment status:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

