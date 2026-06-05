import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "@/utils/auditLog";
import { notifyBookingEvent } from "@/utils/notifyBookingEvent";

type ManualPayment = Database["public"]["Tables"]["manual_payments"]["Row"];

export interface CreateManualPaymentInput {
  applicationId?: string; // Optional - allows orphaned payments
  paymentType: "deposit" | "instalment";
  instalmentId?: string;
  amount: number;
  paymentMethod: "cash" | "card" | "bank_transfer" | "cheque";
  receiptNumber: string; // Required for orphaned payments
  paymentDate: string;
  notes?: string;
}

export const useCreateManualPayment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateManualPaymentInput) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Prevent duplicate deposit: application must not already have a deposit recorded
      if (input.paymentType === "deposit" && input.applicationId) {
        const { data: app } = await supabase
          .from("student_applications")
          .select("deposit_payment_intent_id")
          .eq("id", input.applicationId)
          .single();
        if (app?.deposit_payment_intent_id) {
          throw new Error("This application already has a deposit recorded. You cannot add a second deposit.");
        }
        const { data: existingDeposit } = await supabase
          .from("manual_payments")
          .select("id")
          .eq("application_id", input.applicationId)
          .eq("payment_type", "deposit")
          .limit(1)
          .maybeSingle();
        if (existingDeposit) {
          throw new Error("This application already has a deposit recorded. You cannot add a second deposit.");
        }
      }

      const { data, error } = await supabase
        .from("manual_payments")
        .insert({
          application_id: input.applicationId || null, // Allow NULL for orphaned payments
          payment_type: input.paymentType,
          instalment_id: input.instalmentId || null,
          amount: input.amount,
          payment_method: input.paymentMethod,
          receipt_number: input.receiptNumber || null,
          payment_date: input.paymentDate,
          recorded_by: user?.id || null,
          notes: input.notes || null,
        })
        .select("*")
        .single();

      if (error) {
        const err = error as { code?: string; message?: string; details?: string | null };
        // Friendly message for duplicate receipt numbers (unique index conflict)
        if (
          err.code === "23505" &&
          (err.message?.includes("idx_manual_payments_receipt_number_unique") ||
            err.message?.includes("idx_manual_payments_receipt_number_unique_verify") ||
            err.message?.toLowerCase().includes("receipt_number"))
        ) {
          throw new Error(
            "A payment with this receipt / cheque number already exists. Please use a unique number or leave the field blank if you don't need to track it."
          );
        }
        throw error;
      }

      // Log manual payment creation
      await logActivity({
        action: "create",
        entityType: "payment",
        entityId: data.id,
        payload: {
          payment_type: "manual",
          application_id: input.applicationId,
          payment_type_detail: input.paymentType,
          amount: input.amount,
          payment_method: input.paymentMethod,
          receipt_number: input.receiptNumber || null,
          payment_date: input.paymentDate,
          instalment_id: input.instalmentId || null,
          notes: input.notes || null,
        },
      });

      // If deposit payment and application_id exists, update application status
      if (input.paymentType === "deposit" && input.applicationId) {
        // Update application deposit_payment_intent_id to indicate deposit is paid
        const { error: updateError } = await supabase
          .from("student_applications")
          .update({
            deposit_payment_intent_id: `manual-${data.id}`,
          })
          .eq("id", input.applicationId);

        if (updateError) {
          console.warn("Failed to update application deposit status:", updateError);
        }

        // Update Step 5 payload to mark deposit as paid
        const { data: step5 } = await supabase
          .from("student_application_steps")
          .select("id, payload")
          .eq("application_id", input.applicationId)
          .eq("step_number", 5)
          .single();

        if (step5) {
          const updatedPayload = {
            ...(step5.payload as Record<string, unknown>),
            deposit_paid: true,
          };

          await supabase
            .from("student_application_steps")
            .update({ payload: updatedPayload })
            .eq("id", step5.id);
        }

        // Update application status if needed
        const { data: application } = await supabase
          .from("student_applications")
          .select("status")
          .eq("id", input.applicationId)
          .single();

        if (application?.status === "awaiting_deposit") {
          await supabase
            .from("student_applications")
            .update({ status: "awaiting_signature" })
            .eq("id", input.applicationId);
        }

        void notifyBookingEvent("deposit_paid", input.applicationId, {
          amount: `£${Number(input.amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          paymentMethod: `Manual (${input.paymentMethod})`,
        });
      }

      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      queryClient.invalidateQueries({ queryKey: ["student-application"] });
      if (variables.applicationId) {
        queryClient.invalidateQueries({ queryKey: ["application-has-deposit", variables.applicationId] });
        queryClient.invalidateQueries({ queryKey: ["payment-summary", variables.applicationId] });
        queryClient.invalidateQueries({ queryKey: ["paid-instalment-ids", variables.applicationId] });
        queryClient.invalidateQueries({ queryKey: ["unified-payments", variables.applicationId] });
        queryClient.invalidateQueries({ queryKey: ["application-instalments", variables.applicationId] });
        queryClient.invalidateQueries({ queryKey: ["application-instalments-dialog", variables.applicationId] });
      }
      queryClient.invalidateQueries({ queryKey: ["orphaned-payments"] });
      queryClient.invalidateQueries({ queryKey: ["verify-payment"] });

      // Payments affect accounting views/RPCs (AR totals, outstanding balances, reconciliation, etc.).
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable-report"] });
      queryClient.invalidateQueries({ queryKey: ["outstanding-balances-report"] });
      queryClient.invalidateQueries({ queryKey: ["deposit-installment-breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["bank-reconciliation-report"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-paid-installments-report"] });
      queryClient.invalidateQueries({ queryKey: ["fully-paid-students-report"] });
      queryClient.invalidateQueries({ queryKey: ["revenue-summary"] });
    },
  });
};

/**
 * Link a payment (identified by receipt number) to an application
 * Used when student verifies payment in Step 5
 */
export const useLinkPaymentToApplication = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      receiptNumber,
      applicationId,
    }: {
      receiptNumber: string;
      applicationId: string;
    }) => {
      const { data, error } = await supabase.rpc("link_payment_to_application", {
        p_receipt_number: receiptNumber.trim(),
        p_application_id: applicationId,
      });

      if (error) throw error;

      // Get the linked payment details
      const { data: payment, error: paymentError } = await supabase
        .from("manual_payments")
        .select("*")
        .eq("id", data)
        .single();

      if (paymentError) throw paymentError;

      // If it's a deposit payment, update application status
      if (payment.payment_type === "deposit") {
        // Update application deposit_payment_intent_id
        const { error: updateError } = await supabase
          .from("student_applications")
          .update({
            deposit_payment_intent_id: `manual-${payment.id}`,
          })
          .eq("id", applicationId);

        if (updateError) {
          console.warn("Failed to update application deposit status:", updateError);
        }

        // Update Step 5 payload to mark deposit as paid
        const { data: step5 } = await supabase
          .from("student_application_steps")
          .select("id, payload")
          .eq("application_id", applicationId)
          .eq("step_number", 5)
          .single();

        if (step5) {
          const updatedPayload = {
            ...(step5.payload as Record<string, unknown>),
            deposit_paid: true,
            receipt_number: receiptNumber.trim(),
          };

          await supabase
            .from("student_application_steps")
            .update({ payload: updatedPayload })
            .eq("id", step5.id);
        }

        // Update application status if needed
        const { data: application } = await supabase
          .from("student_applications")
          .select("status")
          .eq("id", applicationId)
          .single();

        if (application?.status === "awaiting_deposit") {
          await supabase
            .from("student_applications")
            .update({ status: "awaiting_signature" })
            .eq("id", applicationId);
        }

        void notifyBookingEvent("deposit_paid", applicationId, {
          amount: `£${Number(payment.amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          paymentMethod: `Manual (${payment.payment_method})`,
        });
      }

      // Log payment linking
      await logActivity({
        action: "link",
        entityType: "payment",
        entityId: payment.id,
        payload: {
          receipt_number: receiptNumber.trim(),
          application_id: applicationId,
          payment_type: payment.payment_type,
          amount: payment.amount,
        },
      });

      return payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      queryClient.invalidateQueries({ queryKey: ["student-application"] });
      queryClient.invalidateQueries({ queryKey: ["orphaned-payments"] });
      queryClient.invalidateQueries({ queryKey: ["verify-payment"] });

      // Linking a payment changes totals and statuses used in accounting reports.
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable-report"] });
      queryClient.invalidateQueries({ queryKey: ["outstanding-balances-report"] });
      queryClient.invalidateQueries({ queryKey: ["deposit-installment-breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["bank-reconciliation-report"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-paid-installments-report"] });
      queryClient.invalidateQueries({ queryKey: ["fully-paid-students-report"] });
      queryClient.invalidateQueries({ queryKey: ["revenue-summary"] });
    },
  });
};

/**
 * Link an existing unlinked (orphaned) manual payment to an application by payment id.
 * Used on Manual Payment Entry when staff clicks "Link to application" on an unlinked payment.
 */
export const useLinkManualPaymentById = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      paymentId,
      applicationId,
      instalmentId,
    }: {
      paymentId: string;
      applicationId: string;
      instalmentId?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("link_manual_payment_to_application_by_id", {
        p_payment_id: paymentId,
        p_application_id: applicationId,
        p_instalment_id: instalmentId || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async (_data, variables) => {
      const { data: payment } = await supabase
        .from("manual_payments")
        .select("payment_type, amount, payment_method")
        .eq("id", variables.paymentId)
        .maybeSingle();

      if (payment?.payment_type === "deposit" && variables.applicationId) {
        void notifyBookingEvent("deposit_paid", variables.applicationId, {
          amount: `£${Number(payment.amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          paymentMethod: `Manual (${payment.payment_method})`,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["orphaned-payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment-summary", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["paid-instalment-ids", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["unified-payments", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["application-instalments", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["application-instalments-dialog", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["application-instalments-link-dialog", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      queryClient.invalidateQueries({ queryKey: ["student-application"] });

      // Linking a payment changes totals and statuses used in accounting reports.
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable-report"] });
      queryClient.invalidateQueries({ queryKey: ["outstanding-balances-report"] });
      queryClient.invalidateQueries({ queryKey: ["deposit-installment-breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["bank-reconciliation-report"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-paid-installments-report"] });
      queryClient.invalidateQueries({ queryKey: ["fully-paid-students-report"] });
      queryClient.invalidateQueries({ queryKey: ["revenue-summary"] });
    },
  });
};

