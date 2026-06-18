import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/utils/auditLog";

export type AmendBookingPayload = {
  applicationId: string;
  contractStart: string;
  weeks: number;
  extraDays?: number;
  studioGradeId?: string | null;
  reason?: string | null;
  resetSigning?: boolean;
};

export type AmendBookingResult = {
  success: boolean;
  application_id: string;
  previous_contract_id: string;
  new_contract_id: string;
  contract_start: string;
  contract_end: string;
  weeks: number;
  extra_days: number;
  studio_grade_id: string;
  total_contract_value: number;
  reason?: string | null;
  signing_reset?: boolean;
  envelopes_superseded?: number;
  application_status?: string;
};

const AMENDABLE_STATUSES = new Set([
  "draft",
  "awaiting_deposit",
  "awaiting_signature",
  "awaiting_verification",
]);

export function isApplicationAmendable(
  status: string | null | undefined,
  hasInstalmentPayments: boolean | undefined,
): { allowed: boolean; reason?: string } {
  if (!status || !AMENDABLE_STATUSES.has(status)) {
    return {
      allowed: false,
      reason:
        "Only draft and pre-confirmation applications can be amended. Use Create extension for confirmed stays.",
    };
  }
  if (hasInstalmentPayments) {
    return {
      allowed: false,
      reason:
        "Instalment payments are recorded. Amend is blocked to protect payment schedule links.",
    };
  }
  return { allowed: true };
}

async function amendStudentApplicationBooking(
  payload: AmendBookingPayload,
): Promise<AmendBookingResult> {
  const {
    applicationId,
    contractStart,
    weeks,
    extraDays = 0,
    studioGradeId,
    reason,
    resetSigning = false,
  } = payload;

  const { data, error } = await supabase.rpc("amend_student_application_booking", {
    p_application_id: applicationId,
    p_contract_start: contractStart,
    p_weeks: weeks,
    p_extra_days: extraDays,
    p_studio_grade_id: studioGradeId ?? undefined,
    p_reason: reason?.trim() || null,
    p_reset_signing: resetSigning,
  });

  if (error) throw error;
  if (!data || typeof data !== "object") {
    throw new Error("Amend booking did not return a result.");
  }

  const result = data as AmendBookingResult;

  await logActivity({
    action: "amend",
    entityType: "application",
    entityId: applicationId,
    payload: {
      previous_contract_id: result.previous_contract_id,
      new_contract_id: result.new_contract_id,
      contract_start: result.contract_start,
      contract_end: result.contract_end,
      weeks: result.weeks,
      extra_days: result.extra_days,
      studio_grade_id: result.studio_grade_id,
      total_contract_value: result.total_contract_value,
      reason: reason?.trim() || null,
      signing_reset: result.signing_reset ?? false,
      envelopes_superseded: result.envelopes_superseded ?? 0,
      application_status: result.application_status ?? null,
    },
  });

  return result;
}

export function useAmendStudentApplicationBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: amendStudentApplicationBooking,
    onSuccess: (_result, variables) => {
      const id = variables.applicationId;
      queryClient.invalidateQueries({ queryKey: ["student-application", id] });
      queryClient.invalidateQueries({ queryKey: ["student-payments", id] });
      queryClient.invalidateQueries({ queryKey: ["payment-summary", id] });
      queryClient.invalidateQueries({ queryKey: ["application-has-instalment-payments", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      queryClient.invalidateQueries({ queryKey: ["admin-contracts"] });
      queryClient.invalidateQueries({ queryKey: ["booking-calendar"] });
    },
  });
}
