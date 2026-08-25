import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EarlyCheckInPaymentStatus =
  | "unpaid"
  | "partially_paid"
  | "fully_paid"
  | "overpaid"
  | "void"
  | "no_amount_due";

export type EarlyCheckInSummary = {
  early_check_in_id: string;
  status: "confirmed" | "cancelled" | string;
  early_check_in_date: string;
  early_check_out_date: string;
  nights: number;
  nightly_rate: number;
  amount_due: number;
  total_received: number;
  remaining_balance: number;
  payment_count: number;
  last_payment_date: string | null;
  payment_status: EarlyCheckInPaymentStatus;
  currency: string;
};

export type EarlyCheckInPayment = {
  id: string;
  early_check_in_id: string;
  application_id: string;
  amount: number;
  payment_type: "payment" | "refund" | "adjustment" | string;
  payment_method: string;
  reference_number: string;
  payment_date: string;
  currency: string;
  notes: string | null;
  recorded_by: string;
  invoice_number: string | null;
  invoice_generated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateEarlyCheckInInput = {
  applicationId: string;
  earlyCheckInDate: string;
  notes?: string | null;
  nightlyRateOverride?: number | null;
};

export type CancelEarlyCheckInInput = {
  applicationId: string;
  reason?: string | null;
};

export type RecordEarlyCheckInPaymentInput = {
  applicationId: string;
  amount: number;
  paymentDate: string;
  referenceNumber: string;
  paymentMethod?: "bank_transfer" | "cash" | "card" | "stripe" | "other";
  paymentType?: "payment" | "refund" | "adjustment";
  notes?: string | null;
};

export type UpdateEarlyCheckInPaymentInput = {
  paymentId: string;
  applicationId: string;
  amount: number;
  paymentDate: string;
  referenceNumber: string;
  paymentMethod?: "bank_transfer" | "cash" | "card" | "stripe" | "other";
  paymentType?: "payment" | "refund" | "adjustment";
  notes?: string | null;
};

export type DeleteEarlyCheckInPaymentInput = {
  paymentId: string;
  applicationId: string;
};

export type EarlyCheckInLedgerRow = {
  early_check_in_id: string;
  application_id: string;
  studio_id: string | null;
  early_check_in_date: string;
  early_check_out_date: string;
  nights: number;
  nightly_rate: number;
  total_amount: number;
  currency: string;
  eci_status: string;
  notes: string | null;
  created_at: string;
  application_status: string;
  student_id: string;
  academic_year_id: string | null;
  academic_year_name: string | null;
  contract_name: string | null;
  contract_start: string | null;
  studio_number: string | null;
  studio_grade: string | null;
  student_name: string;
  amount_due: number;
  total_received: number;
  remaining_balance: number;
  payment_count: number;
  last_payment_date: string | null;
  payment_status: EarlyCheckInPaymentStatus;
};

export type EarlyCheckInLedgerFilters = {
  academicYearId?: string;
  paymentStatus?: EarlyCheckInPaymentStatus | "all";
  eciStatus?: "confirmed" | "cancelled" | "all";
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

const invalidateEarlyCheckInQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
  applicationId: string,
) => {
  void Promise.all([
    queryClient.invalidateQueries({ queryKey: ["early-check-in"] }),
    queryClient.invalidateQueries({ queryKey: ["early-check-in-summary", applicationId] }),
    queryClient.invalidateQueries({ queryKey: ["early-check-in-payments", applicationId] }),
    queryClient.invalidateQueries({ queryKey: ["early-check-in-nightly-rate", applicationId] }),
    queryClient.invalidateQueries({ queryKey: ["early-check-in-ledger"] }),
    queryClient.invalidateQueries({ queryKey: ["student-application", applicationId] }),
    queryClient.invalidateQueries({ queryKey: ["booking-calendar"] }),
    queryClient.invalidateQueries({ queryKey: ["revenue-summary"] }),
    queryClient.invalidateQueries({ queryKey: ["all-payments"] }),
    queryClient.invalidateQueries({ queryKey: ["accounts-receivable-report"] }),
  ]);
};

export const useEarlyCheckInLedger = (filters?: EarlyCheckInLedgerFilters) => {
  return useQuery({
    queryKey: ["early-check-in-ledger", filters],
    queryFn: async (): Promise<EarlyCheckInLedgerRow[]> => {
      let query = (supabase as any)
        .from("early_check_ins_payment_ledger")
        .select("*")
        .order("early_check_in_date", { ascending: false });

      if (filters?.academicYearId) {
        query = query.eq("academic_year_id", filters.academicYearId);
      }
      if (filters?.paymentStatus && filters.paymentStatus !== "all") {
        query = query.eq("payment_status", filters.paymentStatus);
      }
      if (filters?.eciStatus && filters.eciStatus !== "all") {
        query = query.eq("eci_status", filters.eciStatus);
      }
      if (filters?.dateFrom) {
        query = query.gte("early_check_in_date", filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte("early_check_in_date", filters.dateTo);
      }

      const { data, error } = await query;
      if (error) throw error;

      let rows = ((data ?? []) as EarlyCheckInLedgerRow[]).map((row) => ({
        ...row,
        nights: Number(row.nights ?? 0),
        nightly_rate: Number(row.nightly_rate ?? 0),
        total_amount: Number(row.total_amount ?? 0),
        amount_due: Number(row.amount_due ?? 0),
        total_received: Number(row.total_received ?? 0),
        remaining_balance: Number(row.remaining_balance ?? 0),
        payment_count: Number(row.payment_count ?? 0),
      }));

      const q = filters?.search?.trim().toLowerCase();
      if (q) {
        rows = rows.filter((r) => (r.student_name ?? "").toLowerCase().includes(q));
      }

      return rows;
    },
  });
};

export const useEarlyCheckInSummary = (applicationId: string | null | undefined) => {
  return useQuery({
    queryKey: ["early-check-in-summary", applicationId],
    queryFn: async (): Promise<EarlyCheckInSummary | null> => {
      if (!applicationId) return null;
      const { data, error } = await (supabase as any).rpc("get_early_check_in_payment_summary", {
        p_application_id: applicationId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        early_check_in_id: row.early_check_in_id,
        status: row.status,
        early_check_in_date: row.early_check_in_date,
        early_check_out_date: row.early_check_out_date,
        nights: Number(row.nights ?? 0),
        nightly_rate: Number(row.nightly_rate ?? 0),
        amount_due: Number(row.amount_due ?? 0),
        total_received: Number(row.total_received ?? 0),
        remaining_balance: Number(row.remaining_balance ?? 0),
        payment_count: Number(row.payment_count ?? 0),
        last_payment_date: row.last_payment_date ?? null,
        payment_status: (row.payment_status ?? "unpaid") as EarlyCheckInPaymentStatus,
        currency: row.currency ?? "GBP",
      };
    },
    enabled: Boolean(applicationId),
  });
};

export const useEarlyCheckInPayments = (applicationId: string | null | undefined) => {
  return useQuery({
    queryKey: ["early-check-in-payments", applicationId],
    queryFn: async (): Promise<EarlyCheckInPayment[]> => {
      if (!applicationId) return [];
      const { data, error } = await (supabase as any)
        .from("early_check_in_payments")
        .select("*")
        .eq("application_id", applicationId)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EarlyCheckInPayment[];
    },
    enabled: Boolean(applicationId),
  });
};

export const useEarlyCheckInNightlyRate = (applicationId: string | null | undefined) => {
  return useQuery({
    queryKey: ["early-check-in-nightly-rate", applicationId],
    queryFn: async (): Promise<number> => {
      if (!applicationId) return 0;
      const { data, error } = await (supabase as any).rpc("get_early_check_in_nightly_rate", {
        p_application_id: applicationId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    enabled: Boolean(applicationId),
  });
};

export const useCreateEarlyCheckIn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateEarlyCheckInInput) => {
      const { data, error } = await (supabase as any).rpc("admin_create_early_check_in", {
        p_application_id: input.applicationId,
        p_early_check_in_date: input.earlyCheckInDate,
        p_notes: input.notes?.trim() || null,
        p_nightly_rate_override:
          input.nightlyRateOverride != null && !Number.isNaN(input.nightlyRateOverride)
            ? input.nightlyRateOverride
            : null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      invalidateEarlyCheckInQueries(queryClient, variables.applicationId);
    },
  });
};

export const useCancelEarlyCheckIn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CancelEarlyCheckInInput) => {
      const { data, error } = await (supabase as any).rpc("admin_cancel_early_check_in", {
        p_application_id: input.applicationId,
        p_reason: input.reason?.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      invalidateEarlyCheckInQueries(queryClient, variables.applicationId);
    },
  });
};

export const useRecordEarlyCheckInPayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RecordEarlyCheckInPaymentInput) => {
      const { data, error } = await (supabase as any).rpc("admin_record_early_check_in_payment", {
        p_application_id: input.applicationId,
        p_amount: input.amount,
        p_payment_date: input.paymentDate,
        p_reference_number: input.referenceNumber.trim(),
        p_payment_method: input.paymentMethod ?? "bank_transfer",
        p_payment_type: input.paymentType ?? "payment",
        p_notes: input.notes?.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      invalidateEarlyCheckInQueries(queryClient, variables.applicationId);
    },
  });
};

export const useUpdateEarlyCheckInPayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateEarlyCheckInPaymentInput) => {
      const { data, error } = await (supabase as any).rpc("admin_update_early_check_in_payment", {
        p_payment_id: input.paymentId,
        p_amount: input.amount,
        p_payment_date: input.paymentDate,
        p_reference_number: input.referenceNumber.trim(),
        p_payment_method: input.paymentMethod ?? "bank_transfer",
        p_payment_type: input.paymentType ?? "payment",
        p_notes: input.notes?.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      invalidateEarlyCheckInQueries(queryClient, variables.applicationId);
    },
  });
};

export const useDeleteEarlyCheckInPayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DeleteEarlyCheckInPaymentInput) => {
      const { data, error } = await (supabase as any).rpc("admin_delete_early_check_in_payment", {
        p_payment_id: input.paymentId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      invalidateEarlyCheckInQueries(queryClient, variables.applicationId);
    },
  });
};
