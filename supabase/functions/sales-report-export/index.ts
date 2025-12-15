import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5?target=deno&no-check";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface SalesReportRequest {
  academicYearId?: string;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user and role (staff or superadmin)
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

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || (profile.role !== "staff" && profile.role !== "superadmin")) {
      return new Response(JSON.stringify({ error: "Forbidden: Staff access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: SalesReportRequest = {};
    if (req.method === "POST") {
      try {
        body = (await req.json()) as SalesReportRequest;
      } catch {
        // ignore, treat as empty body
      }
    }

    const { academicYearId } = body;

    // -----------------------------------------------------------------------
    // Fetch data from reporting views
    // -----------------------------------------------------------------------

    // 1) Demographics (per-contract)
    let demographicsQuery = supabaseAdmin.from("sales_demographics_report").select("*");
    if (academicYearId) {
      demographicsQuery = demographicsQuery.eq("academic_year_id", academicYearId);
    }
    const { data: demographics, error: demographicsError } = await demographicsQuery;
    if (demographicsError) throw demographicsError;

    // 2) Occupancy by grade / month
    let occupancyQuery = supabaseAdmin.from("sales_occupancy_monthly").select("*");
    if (academicYearId) {
      occupancyQuery = occupancyQuery.eq("academic_year_id", academicYearId);
    }
    const { data: occupancy, error: occupancyError } = await occupancyQuery;
    if (occupancyError) throw occupancyError;

    // 3) Rebookers monthly
    let rebookersQuery = supabaseAdmin.from("sales_rebookers_monthly").select("*");
    if (academicYearId) {
      rebookersQuery = rebookersQuery.eq("academic_year_id", academicYearId);
    }
    const { data: rebookers, error: rebookersError } = await rebookersQuery;
    if (rebookersError) throw rebookersError;

    // Derive a friendly academic year name (if any)
    let academicYearName = "All Years";
    if (academicYearId && demographics && demographics.length > 0) {
      const first = demographics[0] as any;
      if (first.academic_year_name) {
        academicYearName = first.academic_year_name;
      }
    } else if (occupancy && occupancy.length > 0) {
      const firstOcc = occupancy[0] as any;
      if (firstOcc.academic_year_name) {
        academicYearName = firstOcc.academic_year_name;
      }
    }

    // -----------------------------------------------------------------------
    // Build workbook
    // -----------------------------------------------------------------------
    const workbook = XLSX.utils.book_new();
    const generatedAt = new Date();

    // Summary sheet
    const totalContracts = demographics?.length ?? 0;
    const totalSalesValue = (demographics ?? []).reduce(
      (sum: number, row: any) => sum + (row.total_sales_value || 0),
      0,
    );
    const totalSummerSales = (demographics ?? []).reduce(
      (sum: number, row: any) => sum + (row.summer_sales_value || 0),
      0,
    );
    const totalRebookers = (demographics ?? []).filter((row: any) => row.is_rebooker).length;

    const summaryData = [
      ["Academic Year", academicYearName],
      ["Generated At", generatedAt.toISOString()],
      [],
      ["Metric", "Value"],
      ["Total Confirmed Contracts", totalContracts],
      ["Total Sales Value", totalSalesValue],
      ["Total Summer Sales Value", totalSummerSales],
      ["Total Rebooker Contracts", totalRebookers],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

    // Occupancy by grade sheet
    const occupancyRows = [
      [
        "Academic Year",
        "Month",
        "Studio Grade",
        "Capacity",
        "Confirmed Contracts",
        "Occupancy %",
      ],
      ...(occupancy ?? []).map((row: any) => [
        row.academic_year_name,
        row.month_label,
        row.studio_grade_name,
        row.capacity,
        row.confirmed_contracts,
        row.occupancy_percentage,
      ]),
    ];
    const occupancySheet = XLSX.utils.aoa_to_sheet(occupancyRows);
    XLSX.utils.book_append_sheet(workbook, occupancySheet, "OccupancyByGrade");

    // Rebookers sheet
    const rebookerRows = [
      [
        "Academic Year",
        "Month",
        "Rebooker Contracts",
        "Rebooker Total Sales Value",
        "Total Contracts",
        "Rebooker Share %",
      ],
      ...(rebookers ?? []).map((row: any) => [
        row.academic_year_name,
        row.month_label,
        row.rebooker_contracts,
        row.rebooker_total_sales_value,
        row.total_contracts,
        row.rebooker_share_percentage,
      ]),
    ];
    const rebookersSheet = XLSX.utils.aoa_to_sheet(rebookerRows);
    XLSX.utils.book_append_sheet(workbook, rebookersSheet, "Rebookers");

    // Demographics sheet (tabular per-contract data)
    const demographicsHeaders = [
      "Application ID",
      "Student ID",
      "UCAS ID",
      "First Name",
      "Last Name",
      "Country",
      "Entry Into UK",
      "Studio Number",
      "Studio Grade",
      "Company Name",
      "Created At",
      "Confirmed Date",
      "Arrival Date",
      "Departure Date",
      "Weeks",
      "Academic Year",
      "Weekly Rent",
      "Total Sales Value",
      "Cashback Applied",
      "Cashback Value",
      "Partner Referral Code",
      "Partner Name",
      "Partner Commission",
      "Rebooker",
      "Summer Sales Value",
    ];

    const demographicsRows = [
      demographicsHeaders,
      ...(demographics ?? []).map((row: any) => [
        row.application_id,
        row.student_id,
        row.ucas_id,
        row.first_name,
        row.last_name,
        row.country,
        row.entry_into_uk,
        row.studio_number,
        row.studio_grade,
        row.company_name,
        row.created_at,
        row.confirmed_date,
        row.arrival_date,
        row.departure_date,
        row.weeks,
        row.academic_year_name,
        row.weekly_rent,
        row.total_sales_value,
        row.cashback_applied,
        row.cashback_value,
        row.partner_referral_code,
        row.partner_name,
        row.partner_commission,
        row.is_rebooker,
        row.summer_sales_value,
      ]),
    ];
    const demographicsSheet = XLSX.utils.aoa_to_sheet(demographicsRows);
    XLSX.utils.book_append_sheet(workbook, demographicsSheet, "Demographics");

    // Generate XLSX binary - ensure we return a Uint8Array for the Response body
    const wbArray = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const wbout = wbArray instanceof ArrayBuffer ? new Uint8Array(wbArray) : (wbArray as Uint8Array);
    const filename = `sales_report_${academicYearName.replace(/\s+/g, "_")}_${generatedAt
      .toISOString()
      .split("T")[0]}.xlsx`;

    return new Response(wbout, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error generating sales report:", error);
    return new Response(
      JSON.stringify({
        error: (error as Error).message ?? "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});


