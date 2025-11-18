import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

interface ForecastInput {
  targetRevenue: number;
  academicYearId: string;
  includeExistingBookings?: boolean;
  studioGradeFilter?: string[];
}

interface ContractBreakdown {
  contractId: string;
  contractName: string;
  studioGradeId: string;
  studioGradeName: string;
  weeks: number;
  weeklyPrice: number;
  totalContractValue: number;
  currentBookings: number;
  studentsNeeded: number;
  newBookingsNeeded: number;
  revenueContribution: number;
}

interface ForecastResult {
  targetRevenue: number;
  currentRevenue: number;
  revenueGap: number;
  breakdown: ContractBreakdown[];
  totalStudentsNeeded: number;
  occupancyImpact: {
    totalStudios: number;
    currentBookings: number;
    currentOccupancy: number;
    forecastedBookings: number;
    forecastedOccupancy: number;
    availableCapacity: number;
  };
}

async function calculateForecast(input: ForecastInput): Promise<ForecastResult> {
  // 1. Get all active contracts for academic year
  let contractsQuery = supabaseAdmin
    .from("contracts")
    .select(
      `
      id,
      name,
      weeks,
      weekly_price_override,
      studio_grade_id,
      studio_grade:studio_grades!inner(id, name)
    `,
    )
    .eq("academic_year_id", input.academicYearId)
    .eq("is_active", true);

  // Apply studio grade filter if provided
  if (input.studioGradeFilter && input.studioGradeFilter.length > 0) {
    contractsQuery = contractsQuery.in(
      "studio_grade_id",
      input.studioGradeFilter,
    );
  }

  const { data: contracts, error: contractsError } = await contractsQuery;

  if (contractsError) {
    throw new Error(`Failed to fetch contracts: ${contractsError.message}`);
  }

  if (!contracts || contracts.length === 0) {
    return {
      targetRevenue: input.targetRevenue,
      currentRevenue: 0,
      revenueGap: input.targetRevenue,
      breakdown: [],
      totalStudentsNeeded: 0,
      occupancyImpact: {
        totalStudios: 0,
        currentBookings: 0,
        currentOccupancy: 0,
        forecastedBookings: 0,
        forecastedOccupancy: 0,
        availableCapacity: 0,
      },
    };
  }

  // 2. Calculate current revenue from confirmed bookings
  const { data: currentBookings, error: bookingsError } = await supabaseAdmin
    .from("student_applications")
    .select("id, contract_id, total_contract_value, studio_grade_id")
    .eq("status", "confirmed")
    .in(
      "contract_id",
      contracts.map((c) => c.id),
    );

  if (bookingsError) {
    console.warn("Error fetching current bookings:", bookingsError);
  }

  const currentRevenue = (currentBookings || []).reduce((sum, booking) => {
    // Use total_contract_value if available, otherwise calculate
    if (booking.total_contract_value) {
      return sum + Number(booking.total_contract_value);
    }
    return sum;
  }, 0);

  // 3. Calculate revenue gap
  const revenueGap = input.targetRevenue - (input.includeExistingBookings ? 0 : currentRevenue);

  // 4. Get total studios count for occupancy calculation
  const { data: studios, error: studiosError } = await supabaseAdmin
    .from("studios")
    .select("id, studio_grade_id")
    .eq("is_active", true);

  if (studiosError) {
    console.warn("Error fetching studios:", studiosError);
  }

  const totalStudios = studios?.length || 0;
  const currentBookingsCount = currentBookings?.length || 0;

  // 4.5. Fetch studio grade prices for contracts
  const studioGradeIds = [...new Set(contracts.map((c) => c.studio_grade_id))];
  const { data: prices, error: pricesError } = await supabaseAdmin
    .from("studio_grade_prices")
    .select("studio_grade_id, weekly_price")
    .eq("academic_year_id", input.academicYearId)
    .in("studio_grade_id", studioGradeIds);

  if (pricesError) {
    console.warn("Error fetching prices:", pricesError);
  }

  const pricesMap = new Map(
    (prices || []).map((p) => [p.studio_grade_id, Number(p.weekly_price)]),
  );

  // 5. For each contract, calculate students needed
  const breakdown: ContractBreakdown[] = contracts.map((contract) => {
    // Get weekly price (override or from studio_grade_prices)
    const weeklyPrice = contract.weekly_price_override
      ? Number(contract.weekly_price_override)
      : pricesMap.get(contract.studio_grade_id) || 0;

    const contractValue = weeklyPrice * contract.weeks;
    const studentsNeeded = contractValue > 0
      ? Math.ceil(revenueGap / contractValue)
      : 0;

    // Count current bookings for this contract
    const currentBookingsForContract = (currentBookings || []).filter(
      (b) => b.contract_id === contract.id,
    ).length;

    const newBookingsNeeded = Math.max(
      0,
      studentsNeeded - (input.includeExistingBookings ? 0 : currentBookingsForContract),
    );

    return {
      contractId: contract.id,
      contractName: contract.name,
      studioGradeId: contract.studio_grade_id,
      studioGradeName: (contract.studio_grade as any)?.name || "Unknown",
      weeks: contract.weeks,
      weeklyPrice: weeklyPrice,
      totalContractValue: contractValue,
      currentBookings: currentBookingsForContract,
      studentsNeeded: studentsNeeded,
      newBookingsNeeded: newBookingsNeeded,
      revenueContribution: studentsNeeded * contractValue,
    };
  });

  // 6. Calculate total students needed
  const totalStudentsNeeded = breakdown.reduce(
    (sum, b) => sum + b.newBookingsNeeded,
    0,
  );

  // 7. Calculate occupancy impact
  const forecastedBookings = currentBookingsCount + totalStudentsNeeded;
  const currentOccupancy = totalStudios > 0
    ? (currentBookingsCount / totalStudios) * 100
    : 0;
  const forecastedOccupancy = totalStudios > 0
    ? (forecastedBookings / totalStudios) * 100
    : 0;
  const availableCapacity = totalStudios - currentBookingsCount;

  return {
    targetRevenue: input.targetRevenue,
    currentRevenue: input.includeExistingBookings ? 0 : currentRevenue,
    revenueGap,
    breakdown,
    totalStudentsNeeded,
    occupancyImpact: {
      totalStudios,
      currentBookings: currentBookingsCount,
      currentOccupancy: Math.round(currentOccupancy * 100) / 100,
      forecastedBookings,
      forecastedOccupancy: Math.round(forecastedOccupancy * 100) / 100,
      availableCapacity,
    },
  };
}

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

    const input: ForecastInput = await req.json();

    if (!input.targetRevenue || !input.academicYearId) {
      return new Response(
        JSON.stringify({
          error: "targetRevenue and academicYearId are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const result = await calculateForecast(input);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error calculating forecast:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

