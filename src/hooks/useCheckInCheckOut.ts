import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useUpdateCheckInCheckOut = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: {
      applicationId: string;
      checkInDate?: string | null;
      checkOutDate?: string | null;
      checkInNotes?: string | null;
      checkOutNotes?: string | null;
    }) => {
      const updates: any = {};

      if (payload.checkInDate !== undefined) {
        updates.actual_check_in_date = payload.checkInDate;
        if (payload.checkInDate) {
          updates.checked_in_at = new Date().toISOString();
          updates.checked_in_by = user?.id;
        } else {
          updates.checked_in_at = null;
          updates.checked_in_by = null;
        }
      }

      if (payload.checkOutDate !== undefined) {
        updates.actual_check_out_date = payload.checkOutDate;
        if (payload.checkOutDate) {
          updates.checked_out_at = new Date().toISOString();
          updates.checked_out_by = user?.id;
        } else {
          updates.checked_out_at = null;
          updates.checked_out_by = null;
        }
      }

      if (payload.checkInNotes !== undefined) {
        updates.check_in_notes = payload.checkInNotes;
      }

      if (payload.checkOutNotes !== undefined) {
        updates.check_out_notes = payload.checkOutNotes;
      }

      const { data, error } = await supabase
        .from("student_applications")
        .update(updates)
        .eq("id", payload.applicationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      queryClient.invalidateQueries({ queryKey: ["student-applications"] });
    },
  });
};

