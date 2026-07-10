import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type UnifiedPayment = {
  payment_source: "stripe" | "manual" | "early_check_in";
  payment_id: string;
  student_application_id: string;
  payment_plan_id: string | null;
  amount_paid: number;
  currency: string;
  payment_status: string;
  stripe_payment_intent_id: string | null;
  payment_date: string;
  updated_at: string;
  manual_entry_id: string | null;
  manual_entry_notes: string | null;
  entered_by_user_id: string | null;
  student_id: string;
  installment_number: number | null;
  due_date: string | null;
  contract_id: string;
  contract_name: string;
  academic_year_id: string;
  academic_year_name: string;
  /** From view: deposit | instalment | early_check_in */
  payment_type?: string | null;
  /** From view: human-readable for CSV/reports */
  student_name?: string | null;
  studio_number?: string | null;
  studio_grade?: string | null;
  payment_metadata?: {
    label?: string;
    type?: string;
    instalment_id?: string;
    amount_pounds?: string;
    [key: string]: unknown;
  } | null;
};

export type PaymentSummary = {
  total_due: number;
  total_paid: number;
  remaining_balance: number;
  payment_count: number;
  last_payment_date: string | null;
  payment_status: "fully_paid" | "partially_paid" | "unpaid";
};

export type InstallmentBreakdown = {
  installment_id: string;
  sequence: number;
  label: string;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  remaining_amount: number;
  payment_status: "unpaid" | "partial" | "paid";
};

/**
 * Get unified payment history for a student application
 */
export const useUnifiedPayments = (applicationId: string) => {
  return useQuery({
    queryKey: ["unified-payments", applicationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unified_payment_history")
        .select("*")
        .eq("student_application_id", applicationId)
        .order("payment_date", { ascending: false });

      if (error) throw error;
      return (data || []) as UnifiedPayment[];
    },
    enabled: !!applicationId,
    // Optimize for invisible polling - only update if data actually changed
    staleTime: 30000, // Consider data fresh for 30s (matches polling interval)
    cacheTime: 300000, // Keep in cache for 5 minutes
    refetchOnMount: false, // Don't refetch on mount if data is fresh
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnReconnect: false, // Don't refetch on reconnect
    // React Query automatically compares data - no re-render if unchanged
  });
};

/**
 * Get payment summary for a student application
 */
export const usePaymentSummary = (applicationId: string | null | undefined) => {
  return useQuery({
    queryKey: ["payment-summary", applicationId],
    queryFn: async () => {
      if (!applicationId) return null;

      const { data, error } = await supabase
        .rpc("get_payment_summary", { p_application_id: applicationId });

      if (error) {
        // Don't throw for applications without payment schedules (draft applications)
        // Just return null to prevent console errors
        if (error.code === "P0001" || error.message?.includes("payment schedule")) {
          console.warn(`Payment summary not available for application ${applicationId}:`, error.message);
          return null;
        }
        throw error;
      }
      return (data?.[0] || null) as PaymentSummary | null;
    },
    enabled: !!applicationId,
    retry: false, // Don't retry on error to prevent spam
    // Optimize for invisible polling - only update if data actually changed
    staleTime: 30000, // Consider data fresh for 30s (matches polling interval)
    cacheTime: 300000, // Keep in cache for 5 minutes
    refetchOnMount: false, // Don't refetch on mount if data is fresh
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnReconnect: false, // Don't refetch on reconnect
    // React Query automatically compares data - no re-render if unchanged
  });
};

/**
 * Per-instalment breakdown (amount due, amount paid, remaining, status) for an application.
 * Non-breaking: if RPC fails or no data, returns an empty array so callers can fall back.
 */
export const useInstallmentBreakdown = (applicationId: string | null | undefined) => {
  return useQuery({
    queryKey: ["installment-breakdown", applicationId],
    queryFn: async () => {
      if (!applicationId) return [] as InstallmentBreakdown[];

      const { data, error } = await supabase.rpc("get_installment_breakdown", {
        p_application_id: applicationId,
      });

      if (error) {
        // Log full error so we can see Postgres message (400 usually means function threw).
        console.error("get_installment_breakdown failed for application", applicationId, {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return [] as InstallmentBreakdown[];
      }

      return (data || []) as InstallmentBreakdown[];
    },
    enabled: !!applicationId,
    retry: false,
    staleTime: 30000,
    cacheTime: 300000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

/**
 * Get all payments for a student (across all applications)
 */
export const useStudentAllPayments = (studentId: string) => {
  return useQuery({
    queryKey: ["student-all-payments", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unified_payment_history")
        .select("*")
        .eq("student_id", studentId)
        .order("payment_date", { ascending: false });

      if (error) throw error;
      return (data || []) as UnifiedPayment[];
    },
  });
};

/**
 * Get set of contract_payment_schedule IDs that have at least one payment for this application.
 * Used to show "Paid" badges and to filter dropdown to unpaid-only (by id, not sequence).
 */
export const usePaidInstalmentIds = (applicationId: string) => {
  return useQuery({
    queryKey: ["paid-instalment-ids", applicationId],
    queryFn: async () => {
      const ids = new Set<string>();

      const { data: manualRows } = await supabase
        .from("manual_payments")
        .select("instalment_id")
        .eq("application_id", applicationId)
        .eq("payment_type", "instalment")
        .not("instalment_id", "is", null);
      manualRows?.forEach((r) => {
        if (r.instalment_id) ids.add(r.instalment_id);
      });

      const { data: stripeRows } = await supabase
        .from("stripe_payments")
        .select("metadata")
        .eq("student_application_id", applicationId)
        .eq("payment_type", "instalment")
        .in("status", ["succeeded", "completed"]);
      stripeRows?.forEach((r) => {
        const id = (r.metadata as { instalment_id?: string } | null)?.instalment_id;
        if (id) ids.add(id);
      });

      return ids;
    },
    enabled: !!applicationId,
    staleTime: 30000,
  });
};

/**
 * Get all payments for staff view (all students)
 */
export const useAllPayments = (filters?: {
  contractId?: string;
  academicYearId?: string;
  startDate?: string;
  endDate?: string;
}) => {
  return useQuery({
    queryKey: ["all-payments", filters],
    queryFn: async () => {
      const pageSize = 1000;
      let offset = 0;
      const allRows: UnifiedPayment[] = [];

      while (true) {
        let query = supabase
          .from("unified_payment_history")
          .select("*")
          .order("payment_date", { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (filters?.contractId) {
          query = query.eq("contract_id", filters.contractId);
        }
        if (filters?.academicYearId) {
          query = query.eq("academic_year_id", filters.academicYearId);
        }
        if (filters?.startDate) {
          query = query.gte("payment_date", filters.startDate);
        }
        if (filters?.endDate) {
          query = query.lte("payment_date", filters.endDate);
        }

        const { data, error } = await query;
        if (error) throw error;

        const pageRows = (data || []) as UnifiedPayment[];
        allRows.push(...pageRows);

        // Stop when this page is not full; we've reached the end.
        if (pageRows.length < pageSize) break;
        offset += pageSize;
      }

      return allRows;
    },
  });
};

