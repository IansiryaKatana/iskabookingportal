import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// Types
// ============================================================================

export type AccountsReceivableItem = {
  application_id: string;
  student_id: string;
  student_name: string;
  application_status: string;
  contract_name: string;
  studio_grade: string;
  total_contract_value: number | null;
  cashback_amount: number;
  discount_amount: number;
  adjusted_contract_value: number;
  total_due: number;
  total_paid: number;
  outstanding_balance: number;
  payment_status: string;
  assigned_studio_id: string | null;
  studio_number: string | null;
  application_date: string;
  contract_start: string | null;
  contract_end: string | null;
  academic_year_name: string | null;
};

export type RevenueSummaryItem = {
  period_label: string;
  period_start: string;
  period_end: string;
  deposit_revenue: number;
  installment_revenue: number;
  total_revenue: number;
  payment_count: number;
  stripe_revenue: number;
  manual_revenue: number;
  total_refunds: number;
  net_revenue: number;
};

export type OutstandingBalanceItem = {
  application_id: string;
  student_id: string;
  student_name: string;
  application_status: string;
  contract_name: string;
  studio_grade: string;
  academic_year_id: string | null;
  academic_year_name: string | null;
  total_due: number;
  total_paid: number;
  outstanding_balance: number;
  oldest_unpaid_due_date: string | null;
  days_overdue: number;
  application_date: string;
  contract_start: string | null;
  contract_end: string | null;
};

export type DepositInstallmentBreakdownItem = {
  application_id: string;
  student_id: string;
  student_name: string;
  contract_name: string;
  studio_grade: string;
  academic_year_id: string | null;
  academic_year_name: string | null;
  total_contract_value: number | null;
  deposit_paid: number;
  expected_deposit: number;
  installments_paid: number;
  expected_installments: number;
  deposit_payment_count: number;
  installment_payment_count: number;
  status: string;
  application_date: string;
};

export type BankReconciliationItem = {
  payment_id: string;
  payment_source: string;
  student_application_id: string;
  student_id: string;
  student_name: string;
  amount_paid: number;
  currency: string;
  payment_status: string;
  payment_date: string;
  stripe_payment_intent_id: string | null;
  payment_method: string;
  manual_entry_notes: string | null;
  entered_by_user_id: string | null;
  entered_by_name: string | null;
  payment_type: string;
  contract_name: string | null;
  studio_grade: string | null;
  invoice_number: string | null;
  invoice_generated_at: string | null;
};

export type UpcomingPaidInstallmentItem = {
  application_id: string;
  student_id: string;
  student_name: string | null;
  studio_number: string | null;
  studio_grade: string | null;
  contract_id: string;
  contract_name: string | null;
  academic_year_id: string | null;
  academic_year_name: string | null;
  installment_id: string;
  sequence: number;
  installment_label: string | null;
  due_date: string;
  amount: number;
  amount_paid?: number;
  amount_remaining?: number;
  is_deposit: boolean;
  is_paid: boolean;
  paid_date: string | null;
  status: "upcoming" | "overdue" | "paid" | "partially_paid";
};

// ============================================================================
// Hooks
// ============================================================================

export const useAccountsReceivableReport = () => {
  return useQuery({
    queryKey: ["accounts-receivable-report"],
    queryFn: async (): Promise<AccountsReceivableItem[]> => {
      const { data, error } = await supabase
        .from("accounts_receivable_report")
        .select("*")
        .order("outstanding_balance", { ascending: false });

      if (error) {
        console.error("Failed to fetch accounts receivable report:", error);
        throw error;
      }

      return (data || []) as AccountsReceivableItem[];
    },
  });
};

export const useRevenueSummary = (
  startDate?: string,
  endDate?: string,
  groupBy: "month" | "quarter" = "month"
) => {
  return useQuery({
    queryKey: ["revenue-summary", startDate, endDate, groupBy],
    queryFn: async (): Promise<RevenueSummaryItem[]> => {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      // Validate groupBy parameter
      if (groupBy !== "month" && groupBy !== "quarter") {
        console.warn(`Invalid groupBy value: ${groupBy}, defaulting to "month"`);
        groupBy = "month";
      }

      const { data, error } = await supabase.rpc("get_revenue_summary", {
        p_start_date: start?.toISOString().split("T")[0] || null,
        p_end_date: end?.toISOString().split("T")[0] || null,
        p_group_by: groupBy,
      });

      if (error) {
        // Don't log as error if it's just a validation issue
        if (error.code === "42883" || error.message?.includes("does not exist")) {
          console.warn("Revenue summary function not available:", error.message);
          return [];
        }
        console.error("Failed to fetch revenue summary:", error);
        // Return empty array instead of throwing to prevent UI crashes
        return [];
      }

      return (data || []) as RevenueSummaryItem[];
    },
    enabled: startDate !== undefined && endDate !== undefined && !!startDate && !!endDate, // Only run when dates are provided
    retry: false, // Don't retry on error
  });
};

export const useOutstandingBalancesReport = () => {
  return useQuery({
    queryKey: ["outstanding-balances-report"],
    queryFn: async (): Promise<OutstandingBalanceItem[]> => {
      const { data, error } = await supabase
        .from("outstanding_balances_report")
        .select("*")
        .order("days_overdue", { ascending: false });

      if (error) {
        console.error("Failed to fetch outstanding balances report:", error);
        throw error;
      }

      return (data || []) as OutstandingBalanceItem[];
    },
  });
};

export const useDepositInstallmentBreakdown = () => {
  return useQuery({
    queryKey: ["deposit-installment-breakdown"],
    queryFn: async (): Promise<DepositInstallmentBreakdownItem[]> => {
      const { data, error } = await supabase
        .from("deposit_installment_breakdown")
        .select("*")
        .order("application_date", { ascending: false });

      if (error) {
        console.error("Failed to fetch deposit/installment breakdown:", error);
        throw error;
      }

      return (data || []) as DepositInstallmentBreakdownItem[];
    },
  });
};

export const useBankReconciliationReport = (
  startDate?: string,
  endDate?: string
) => {
  return useQuery({
    queryKey: ["bank-reconciliation-report", startDate, endDate],
    queryFn: async (): Promise<BankReconciliationItem[]> => {
      let query = supabase
        .from("bank_reconciliation_report")
        .select("*")
        .order("payment_date", { ascending: false });

      if (startDate) {
        query = query.gte("payment_date", startDate);
      }
      if (endDate) {
        query = query.lte("payment_date", endDate);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Failed to fetch bank reconciliation report:", error);
        throw error;
      }

      return (data || []) as BankReconciliationItem[];
    },
  });
};

export const useUpcomingPaidInstallmentsReport = () => {
  return useQuery({
    queryKey: ["upcoming-paid-installments-report"],
    queryFn: async (): Promise<UpcomingPaidInstallmentItem[]> => {
      const { data, error } = await supabase
        .from("upcoming_and_paid_installments_report")
        .select("*")
        .order("due_date", { ascending: true });

      if (error) {
        console.error("Failed to fetch upcoming/paid installments report:", error);
        throw error;
      }

      return (data || []) as UpcomingPaidInstallmentItem[];
    },
  });
};

