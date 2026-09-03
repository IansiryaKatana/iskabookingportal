import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notifyBookingEvent } from "@/utils/notifyBookingEvent";
import {
  isScheduleInstalmentAlreadyPaid,
  resolveScheduleInstalmentId,
} from "@/utils/resolveScheduleInstalmentId";

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

      // Always store contract_payment_schedule.id (portal may still send plan installment ids).
      const scheduleInstalmentId = await resolveScheduleInstalmentId(
        input.applicationId,
        input.instalmentId,
      );

      const paidCheck = await isScheduleInstalmentAlreadyPaid(
        input.applicationId,
        scheduleInstalmentId,
      );
      if (paidCheck.paid) {
        throw new Error(
          `${paidCheck.label ?? "This instalment"} is already marked as paid. You do not need to submit another request.`,
        );
      }

      const { data: existingPending, error: pendingError } = await supabase
        .from("manual_payment_requests")
        .select("id")
        .eq("application_id", input.applicationId)
        .eq("instalment_id", scheduleInstalmentId)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();
      if (pendingError) throw pendingError;
      if (existingPending) {
        throw new Error(
          "You already have a pending request for this instalment. Please wait for the office to review it.",
        );
      }

      // Also block duplicate pending against the raw id the UI sent (legacy plan ids still in flight).
      if (input.instalmentId !== scheduleInstalmentId) {
        const { data: legacyPending, error: legacyError } = await supabase
          .from("manual_payment_requests")
          .select("id")
          .eq("application_id", input.applicationId)
          .eq("instalment_id", input.instalmentId)
          .eq("status", "pending")
          .limit(1)
          .maybeSingle();
        if (legacyError) throw legacyError;
        if (legacyPending) {
          throw new Error(
            "You already have a pending request for this instalment. Please wait for the office to review it.",
          );
        }
      }

      const { data, error } = await supabase
        .from("manual_payment_requests")
        .insert({
          application_id: input.applicationId,
          instalment_id: scheduleInstalmentId,
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
