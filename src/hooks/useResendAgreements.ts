import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/utils/auditLog";

export function useResendAgreements(applicationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!applicationId) throw new Error("Application id is required.");

      const { data, error } = await supabase.functions.invoke<{
        tenancyEnvelopeId?: string;
        guarantorEnvelopeId?: string;
        message?: string;
        error?: string;
        hint?: string;
      }>("docusign-envelopes", {
        body: {
          applicationId,
          allowResend: true,
        },
      });

      if (error || data?.error) {
        const errorBody = (error as { context?: { body?: { error?: string; hint?: string } } })
          ?.context?.body;
        const merged =
          data?.error ?? errorBody?.error ?? (error as Error)?.message ?? "Failed to resend agreements";
        const hint = errorBody?.hint ?? data?.hint;
        throw new Error(hint ? `${merged} (${hint})` : merged);
      }

      await logActivity({
        action: "resend",
        entityType: "application",
        entityId: applicationId,
        payload: {
          tenancy_envelope_id: data?.tenancyEnvelopeId ?? null,
          guarantor_envelope_id: data?.guarantorEnvelopeId ?? null,
          reason: "updated_terms_after_amend",
        },
      });

      return data;
    },
    onSuccess: () => {
      if (!applicationId) return;
      queryClient.invalidateQueries({ queryKey: ["student-application", applicationId] });
    },
  });
}
