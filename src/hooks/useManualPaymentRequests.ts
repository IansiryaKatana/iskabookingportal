import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notifyBookingEvent } from "@/utils/notifyBookingEvent";

export type ManualPaymentRequestRow = {
  id: string;
  application_id: string;
  instalment_id: string;
  amount: number;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  submitted_by: string | null;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

/** Pending manual payment requests for an application (student portal). */
export function useManualPaymentRequests(applicationId: string | null) {
  return useQuery({
    queryKey: ["manual-payment-requests", applicationId],
    queryFn: async () => {
      if (!applicationId) return [];
      const { data, error } = await supabase
        .from("manual_payment_requests")
        .select("*")
        .eq("application_id", applicationId)
        .eq("status", "pending")
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ManualPaymentRequestRow[];
    },
    enabled: !!applicationId,
  });
}

/** All manual payment requests for an application (pending, rejected, approved) – for request history and rejected feedback. */
export function useManualPaymentRequestHistory(applicationId: string | null) {
  return useQuery({
    queryKey: ["manual-payment-request-history", applicationId],
    queryFn: async () => {
      if (!applicationId) return [];
      const { data, error } = await supabase
        .from("manual_payment_requests")
        .select("*")
        .eq("application_id", applicationId)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ManualPaymentRequestRow[];
    },
    enabled: !!applicationId,
  });
}

export interface CreateManualPaymentRequestInput {
  applicationId: string;
  instalmentId: string;
  amount: number;
  paymentMethod: "cash" | "card" | "bank_transfer" | "cheque";
  reference?: string;
  notes?: string;
}

export function useCreateManualPaymentRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateManualPaymentRequestInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("manual_payment_requests")
        .insert({
          application_id: input.applicationId,
          instalment_id: input.instalmentId,
          amount: input.amount,
          payment_method: input.paymentMethod,
          reference: input.reference?.trim() || null,
          notes: input.notes?.trim() || null,
          status: "pending",
          submitted_by: user?.id ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as ManualPaymentRequestRow;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["manual-payment-requests", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["manual-payment-request-history", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["student-payments", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["manual-payment-requests-pending"] });
      queryClient.invalidateQueries({ queryKey: ["manual-payment-requests-pending-count"] });

      const methodLabels: Record<string, string> = {
        cash: "Cash",
        card: "Card",
        bank_transfer: "Bank Transfer",
        cheque: "Cheque",
      };
      void notifyBookingEvent("manual_payment_request_submitted", variables.applicationId, {
        amount: `£${Number(data.amount).toFixed(2)}`,
        paymentMethod: methodLabels[data.payment_method] ?? data.payment_method,
      });
    },
  });
}
