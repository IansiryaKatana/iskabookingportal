import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/utils/auditLog";

export const useEarlyCheckoutStudent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      applicationId: string;
      checkoutDate: string;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("admin_early_checkout_student", {
        p_application_id: payload.applicationId,
        p_checkout_date: payload.checkoutDate,
        p_notes: payload.notes?.trim() || null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, variables) => {
      await logActivity({
        action: "early_checkout",
        entityType: "student_application",
        entityId: variables.applicationId,
        payload: {
          checkout_date: variables.checkoutDate,
          notes: variables.notes ?? null,
        },
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["student-application", variables.applicationId] }),
        queryClient.invalidateQueries({ queryKey: ["admin-applications"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-studios"] }),
        queryClient.invalidateQueries({ queryKey: ["booking-calendar"] }),
        queryClient.invalidateQueries({ queryKey: ["studio-occupied-applications"] }),
      ]);
    },
  });
};
