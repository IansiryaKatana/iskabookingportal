import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type UnifiedPayment = {
  payment_source: "stripe" | "manual";
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
};

export type PaymentSummary = {
  total_due: number;
  total_paid: number;
  remaining_balance: number;
  payment_count: number;
  last_payment_date: string | null;
  payment_status: "fully_paid" | "partially_paid" | "unpaid";
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
  });
};

/**
 * Get payment summary for a student application
 */
export const usePaymentSummary = (applicationId: string) => {
  return useQuery({
    queryKey: ["payment-summary", applicationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_payment_summary", { p_application_id: applicationId });

      if (error) throw error;
      return (data?.[0] || null) as PaymentSummary | null;
    },
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
      let query = supabase
        .from("unified_payment_history")
        .select("*")
        .order("payment_date", { ascending: false });

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
      return (data || []) as UnifiedPayment[];
    },
  });
};

