import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface WeeklyReportRequest {
  weekStartDate: string; // ISO date string
  weekEndDate?: string; // Optional, defaults to 7 days after weekStartDate
  contractId?: string;
  academicYearId?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify user is authenticated
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if user is staff or superadmin
    const userRole = user.app_metadata?.role;
    if (userRole !== "staff" && userRole !== "superadmin") {
      return new Response(
        JSON.stringify({ error: "Forbidden: Staff access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body: WeeklyReportRequest = await req.json();
    const { weekStartDate, weekEndDate, contractId, academicYearId } = body;

    if (!weekStartDate) {
      return new Response(
        JSON.stringify({ error: "weekStartDate is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Calculate end date if not provided (default to 7 days)
    const startDate = new Date(weekStartDate);
    const endDate = weekEndDate
      ? new Date(weekEndDate)
      : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Build query for unified payment history
    let query = supabaseClient
      .from("unified_payment_history")
      .select("*")
      .gte("payment_date", startDate.toISOString())
      .lte("payment_date", endDate.toISOString())
      .order("payment_date", { ascending: false });

    if (contractId) {
      query = query.eq("contract_id", contractId);
    }

    if (academicYearId) {
      query = query.eq("academic_year_id", academicYearId);
    }

    const { data: payments, error } = await query;

    if (error) {
      throw error;
    }

    // Calculate summary statistics
    const totalAmount = payments?.reduce((sum, p) => sum + p.amount_paid, 0) || 0;
    const stripeAmount = payments
      ?.filter((p) => p.payment_source === "stripe")
      .reduce((sum, p) => sum + p.amount_paid, 0) || 0;
    const manualAmount = payments
      ?.filter((p) => p.payment_source === "manual")
      .reduce((sum, p) => sum + p.amount_paid, 0) || 0;
    const stripeCount = payments?.filter((p) => p.payment_source === "stripe").length || 0;
    const manualCount = payments?.filter((p) => p.payment_source === "manual").length || 0;

    // Group by day
    const paymentsByDay: Record<string, typeof payments> = {};
    payments?.forEach((payment) => {
      const day = new Date(payment.payment_date).toISOString().split("T")[0];
      if (!paymentsByDay[day]) {
        paymentsByDay[day] = [];
      }
      paymentsByDay[day].push(payment);
    });

    return new Response(
      JSON.stringify({
        weekStartDate: startDate.toISOString(),
        weekEndDate: endDate.toISOString(),
        summary: {
          totalAmount,
          totalCount: payments?.length || 0,
          stripeAmount,
          stripeCount,
          manualAmount,
          manualCount,
        },
        paymentsByDay,
        payments: payments || [],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error generating weekly report:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

