import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

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

  // 1.5. Fetch studio grade prices for contracts (needed for revenue calculation)
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

  // 2. Calculate current revenue from confirmed bookings
  // First, get all confirmed bookings for this academic year (via contract join)
  // This ensures we catch all confirmed bookings even if contract_id doesn't match exactly
  const contractIds = contracts.map((c) => c.id);
  
  console.log("🔍 Forecast Debug:", {
    academicYearId: input.academicYearId,
    contractsFound: contracts.length,
    contractIds: contractIds,
  });

  // Query confirmed bookings that belong to contracts in this academic year
  // Use a join approach to ensure we get all bookings for the academic year
  const { data: currentBookings, error: bookingsError } = await supabaseAdmin
    .from("student_applications")
    .select(
      `
      id, 
      contract_id, 
      total_contract_value, 
      studio_grade_id,
      status,
      contract:contracts!inner(
        id,
        weeks,
        weekly_price_override,
        studio_grade_id,
        academic_year_id
      )
    `,
    )
    .eq("status", "confirmed")
    .eq("contract.academic_year_id", input.academicYearId);

  if (bookingsError) {
    console.error("❌ Error fetching current bookings:", bookingsError);
  } else {
    console.log("✅ Current bookings found:", currentBookings?.length || 0);
    if (currentBookings && currentBookings.length > 0) {
      console.log("📊 Booking details:", currentBookings.map((b: any) => ({
        id: b.id,
        contract_id: b.contract_id,
        total_contract_value: b.total_contract_value,
        contract_weeks: (b.contract as any)?.weeks,
        contract_weekly_price_override: (b.contract as any)?.weekly_price_override,
      })));
    }
  }

  // Create a map of contract_id to contract details for quick lookup
  const contractsMap = new Map(
    contracts.map((c) => [
      c.id,
      {
        weeks: c.weeks,
        weekly_price_override: c.weekly_price_override,
        studio_grade_id: c.studio_grade_id,
      },
    ]),
  );

  let currentRevenue = 0;
  
  if (currentBookings && currentBookings.length > 0) {
    currentRevenue = currentBookings.reduce((sum: number, booking: any) => {
      let bookingRevenue = 0;
      
      // Use total_contract_value if available
      if (booking.total_contract_value) {
        bookingRevenue = Number(booking.total_contract_value);
        console.log(`💰 Using total_contract_value: £${bookingRevenue} for booking ${booking.id}`);
      } else {
        // Otherwise, calculate from contract details
        // Try to get contract from the joined data first
        const joinedContract = booking.contract;
        const contract = joinedContract 
          ? {
              weeks: joinedContract.weeks,
              weekly_price_override: joinedContract.weekly_price_override,
              studio_grade_id: joinedContract.studio_grade_id,
            }
          : contractsMap.get(booking.contract_id);

        if (contract) {
          // Get weekly price (override or from prices map)
          const weeklyPrice = contract.weekly_price_override
            ? Number(contract.weekly_price_override)
            : pricesMap.get(contract.studio_grade_id) || 0;

          bookingRevenue = weeklyPrice * contract.weeks;
          console.log(`💰 Calculated revenue: £${bookingRevenue} (${weeklyPrice} × ${contract.weeks}) for booking ${booking.id}`);
        } else {
          // If no contract found, log warning and skip
          console.warn(`⚠️ No contract found for booking ${booking.id} with contract_id ${booking.contract_id}`);
          bookingRevenue = 0;
        }
      }
      
      const newSum = sum + bookingRevenue;
      console.log(`💰 Accumulated revenue: £${sum} + £${bookingRevenue} = £${newSum}`);
      return newSum;
    }, 0);
  }

  console.log(`💰 Total current revenue calculated: £${currentRevenue}`);

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

  // Determine final current revenue based on includeExistingBookings flag
  const finalCurrentRevenue = input.includeExistingBookings ? 0 : currentRevenue;
  
  console.log("📊 Final Revenue Calculation:", {
    calculatedRevenue: currentRevenue,
    includeExistingBookings: input.includeExistingBookings,
    finalCurrentRevenue: finalCurrentRevenue,
    revenueGap: revenueGap,
    targetRevenue: input.targetRevenue,
  });

  return {
    targetRevenue: input.targetRevenue,
    currentRevenue: finalCurrentRevenue,
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
    
    console.log("📤 Returning forecast result:", {
      targetRevenue: result.targetRevenue,
      currentRevenue: result.currentRevenue,
      revenueGap: result.revenueGap,
      totalStudentsNeeded: result.totalStudentsNeeded,
    });

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

