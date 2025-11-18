import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ManualPayment = Database["public"]["Tables"]["manual_payments"]["Row"];

export interface CreateManualPaymentInput {
  applicationId: string;
  paymentType: "deposit" | "instalment";
  instalmentId?: string;
  amount: number;
  paymentMethod: "cash" | "card" | "bank_transfer" | "cheque";
  receiptNumber?: string;
  paymentDate: string;
  notes?: string;
}

export const useCreateManualPayment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateManualPaymentInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("manual_payments")
        .insert({
          application_id: input.applicationId,
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

      if (error) throw error;

      // If deposit payment, update application status
      if (input.paymentType === "deposit") {
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
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      queryClient.invalidateQueries({ queryKey: ["student-application"] });
    },
  });
};

