import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

export type SalesDemographicsRow = {
  application_id: string;
  application_status:
    | "confirmed"
    | "checked_out"
    | "awaiting_deposit"
    | "awaiting_signature"
    | "awaiting_verification";
  student_id: string;
  ucas_id: string | null;
  first_name: string | null;
  last_name: string | null;
  country: string | null;
  entry_into_uk: string | null;
  studio_number: string | null;
  studio_grade: string | null;
  company_name: string | null;
  booking_source: string | null;
  created_at: string;
  confirmed_date: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  weeks: number | null;
  academic_year_id: string | null;
  academic_year_name: string | null;
  weekly_rent: number | null;
  total_sales_value: number | null;
  cashback_applied: boolean;
  cashback_value: number | null;
  discount_applied: boolean;
  discount_value: number | null;
  partner_referral_code: string | null;
  partner_name: string | null;
  partner_commission: number | null;
  is_rebooker: boolean;
  summer_sales_value: number | null;
  payment_plan: string | null;
};

export type SalesOccupancyMonthlyRow = {
  academic_year_id: string | null;
  academic_year_name: string | null;
  month_start: string;
  month_label: string;
  studio_grade_id: string;
  studio_grade_name: string;
  capacity: number;
  confirmed_contracts: number;
  occupancy_percentage: number;
};

export type SalesRebookersMonthlyRow = {
  academic_year_id: string | null;
  academic_year_name: string | null;
  month_start: string;
  month_label: string;
  rebooker_contracts: number;
  rebooker_total_sales_value: number | null;
  total_contracts: number;
  rebooker_share_percentage: number;
};

export type SalesReportCashSummary = {
  total_received: number;
  total_deposits_collected: number;
  total_installments_collected: number;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SALES_REPORT_ALLOWED_STATUSES = [
  "confirmed",
  "checked_out",
  "awaiting_deposit",
  "awaiting_signature",
  "awaiting_verification",
] as const;
export type SalesReportStatus = (typeof SALES_REPORT_ALLOWED_STATUSES)[number];

export const SALES_REPORT_REALIZED_STATUSES = ["confirmed", "checked_out"] as const satisfies readonly SalesReportStatus[];

export type SalesReportPreset = "all_sales" | "realized_only" | "in_residence";

export const SALES_REPORT_PRESET_STATUSES: Record<SalesReportPreset, SalesReportStatus[]> = {
  all_sales: [...SALES_REPORT_ALLOWED_STATUSES],
  realized_only: [...SALES_REPORT_REALIZED_STATUSES],
  in_residence: ["confirmed"],
};

export const SALES_REPORT_PRESET_LABELS: Record<SalesReportPreset, string> = {
  all_sales: "All Sales",
  realized_only: "Realized Only",
  in_residence: "In Residence",
};

const toValidStatusFilter = (statuses?: SalesReportStatus[] | null): SalesReportStatus[] => {
  if (!statuses?.length) return [...SALES_REPORT_PRESET_STATUSES.all_sales];
  const valid = statuses.filter((status): status is SalesReportStatus =>
    SALES_REPORT_ALLOWED_STATUSES.includes(status),
  );
  return valid.length ? valid : [...SALES_REPORT_PRESET_STATUSES.all_sales];
};

/** Export rule for all academic years: exclude awaiting_deposit unless drill-down only. */
export const getSalesReportExportStatuses = (
  selectedStatus: SalesReportStatus | null,
  activeStatuses: SalesReportStatus[],
): SalesReportStatus[] => {
  if (selectedStatus) return activeStatuses;
  return activeStatuses.filter((status) => status !== "awaiting_deposit");
};

const toValidAcademicYearParam = (id?: string | null): string | null => {
  if (!id || id === "all") return null;
  return UUID_REGEX.test(id) ? id : null;
};

export const useSalesReportCashSummary = (academicYearId?: string) => {
  return useQuery({
    queryKey: ["sales-report-cash-summary", academicYearId],
    queryFn: async (): Promise<SalesReportCashSummary> => {
      const pAcademicYearId = toValidAcademicYearParam(academicYearId ?? null);
      const { data, error } = await supabase.rpc("get_sales_report_cash_summary", {
        p_academic_year_id: pAcademicYearId,
      });
      if (error) {
        console.error("Failed to fetch sales report cash summary:", error);
        throw error;
      }
      const row = Array.isArray(data) ? data[0] : data;
      return {
        total_received: Number(row?.total_received ?? 0),
        total_deposits_collected: Number(row?.total_deposits_collected ?? 0),
        total_installments_collected: Number(row?.total_installments_collected ?? 0),
      };
    },
  });
};

export const useSalesDemographicsReport = (
  academicYearId?: string,
  statuses?: SalesReportStatus[],
) => {
  return useQuery({
    queryKey: ["sales-demographics-report", academicYearId, statuses],
    queryFn: async (): Promise<SalesDemographicsRow[]> => {
      const pAcademicYearId = toValidAcademicYearParam(academicYearId ?? null);
      const statusFilter = toValidStatusFilter(statuses);
      let query = supabase.from("sales_demographics_report").select("*");
      if (pAcademicYearId) {
        query = query.eq("academic_year_id", pAcademicYearId);
      }
      query = query.in("application_status", statusFilter);
      const { data, error } = await query;
      if (error) {
        console.error("Failed to fetch sales demographics report:", error);
        throw error;
      }
      return (data || []) as SalesDemographicsRow[];
    },
  });
};

export const useSalesOccupancyMonthly = (academicYearId?: string) => {
  return useQuery({
    queryKey: ["sales-occupancy-monthly", academicYearId],
    queryFn: async (): Promise<SalesOccupancyMonthlyRow[]> => {
      const pAcademicYearId = toValidAcademicYearParam(academicYearId ?? null);
      let query = supabase.from("sales_occupancy_monthly").select("*");
      if (pAcademicYearId) {
        query = query.eq("academic_year_id", pAcademicYearId);
      }
      const { data, error } = await query;
      if (error) {
        console.error("Failed to fetch sales occupancy monthly:", error);
        throw error;
      }
      return (data || []) as SalesOccupancyMonthlyRow[];
    },
  });
};

export const useSalesRebookersMonthly = (academicYearId?: string) => {
  return useQuery({
    queryKey: ["sales-rebookers-monthly", academicYearId],
    queryFn: async (): Promise<SalesRebookersMonthlyRow[]> => {
      const pAcademicYearId = toValidAcademicYearParam(academicYearId ?? null);
      let query = supabase.from("sales_rebookers_monthly").select("*");
      if (pAcademicYearId) {
        query = query.eq("academic_year_id", pAcademicYearId);
      }
      const { data, error } = await query;
      if (error) {
        console.error("Failed to fetch sales rebookers monthly:", error);
        throw error;
      }
      return (data || []) as SalesRebookersMonthlyRow[];
    },
  });
};

export const useDownloadSalesReport = () => {
  return useMutation({
    mutationFn: async ({
      academicYearId,
      statuses,
    }: {
      academicYearId?: string;
      statuses?: SalesReportStatus[];
    }) => {
      const pAcademicYearId = toValidAcademicYearParam(academicYearId ?? null);
      const statusFilter = toValidStatusFilter(statuses);
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;

      if (!accessToken) {
        throw new Error("You must be signed in to download the sales report.");
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/sales-report-export`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(pAcademicYearId ? { academicYearId: pAcademicYearId } : {}),
          statuses: statusFilter,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("Failed to generate sales report:", response.status, text);
        throw new Error("Failed to generate sales report.");
      }

      const arrayBuffer = await response.arrayBuffer();

      const blob = new Blob([arrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "sales_report.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
  });
};


