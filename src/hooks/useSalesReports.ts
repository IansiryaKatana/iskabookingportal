import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

export type SalesDemographicsRow = {
  application_id: string;
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

export const useSalesReportCashSummary = (academicYearId?: string) => {
  return useQuery({
    queryKey: ["sales-report-cash-summary", academicYearId],
    queryFn: async (): Promise<SalesReportCashSummary> => {
      const { data, error } = await supabase.rpc("get_sales_report_cash_summary", {
        p_academic_year_id: academicYearId || null,
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

export const useSalesDemographicsReport = (academicYearId?: string) => {
  return useQuery({
    queryKey: ["sales-demographics-report", academicYearId],
    queryFn: async (): Promise<SalesDemographicsRow[]> => {
      let query = supabase.from("sales_demographics_report").select("*");
      if (academicYearId) {
        query = query.eq("academic_year_id", academicYearId);
      }
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
      let query = supabase.from("sales_occupancy_monthly").select("*");
      if (academicYearId) {
        query = query.eq("academic_year_id", academicYearId);
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
      let query = supabase.from("sales_rebookers_monthly").select("*");
      if (academicYearId) {
        query = query.eq("academic_year_id", academicYearId);
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
    mutationFn: async (academicYearId?: string) => {
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
        body: JSON.stringify(academicYearId ? { academicYearId } : {}),
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


