import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/utils/auditLog";

export type AllocationValue = "Student" | "OTA" | "Keyworkers" | null;
export type AllocationPolicy = "keep" | "move";

export type AllocationPrecheckResult = {
  studio_id: string;
  current_allocation: string | null;
  new_allocation: string | null;
  future_ota_bookings: number;
};

export type AllocationHistoryRow = {
  id: string;
  studio_id: string;
  previous_allocation: string | null;
  new_allocation: string | null;
  starts_at: string;
  ends_at: string | null;
  changed_by: string | null;
  reason: string | null;
  policy: string | null;
  impacted_ota_bookings_count: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export const useStudioAllocationHistory = (studioId?: string) => {
  return useQuery({
    queryKey: ["studio-allocation-history", studioId],
    enabled: Boolean(studioId),
    queryFn: async () => {
      if (!studioId) return [] as AllocationHistoryRow[];
      const { data, error } = await (supabase as any)
        .from("studio_allocation_history")
        .select("*")
        .eq("studio_id", studioId)
        .order("starts_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as AllocationHistoryRow[];
    },
  });
};

export const previewStudioAllocationChange = async (
  studioId: string,
  newAllocation: AllocationValue,
): Promise<AllocationPrecheckResult> => {
  const { data, error } = await (supabase as any).rpc("preview_studio_allocation_change", {
    p_studio_id: studioId,
    p_new_allocation: newAllocation,
  });

  if (error) throw error;
  return (data ?? {}) as AllocationPrecheckResult;
};

export const useReassignStudioAllocation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      studioId: string;
      newAllocation: AllocationValue;
      policy?: AllocationPolicy;
      reason?: string | null;
      targetStudioId?: string | null;
    }) => {
      const {
        studioId,
        newAllocation,
        policy = "keep",
        reason = null,
        targetStudioId = null,
      } = payload;

      const { data, error } = await (supabase as any).rpc("reassign_studio_allocation", {
        p_studio_id: studioId,
        p_new_allocation: newAllocation,
        p_policy: policy,
        p_reason: reason,
        p_target_studio_id: targetStudioId,
      });

      if (error) throw error;

      await logActivity({
        action: "reassign_allocation",
        entityType: "studio",
        entityId: studioId,
        payload: {
          new_allocation: newAllocation,
          policy,
          reason,
          target_studio_id: targetStudioId,
          result: data,
        },
      });

      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-studios"] });
      queryClient.invalidateQueries({ queryKey: ["studio-allocation-history", variables.studioId] });
      queryClient.invalidateQueries({ queryKey: ["ota-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["booking-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["ota-studio-income-summary"] });
      queryClient.invalidateQueries({ queryKey: ["room-no-income-summary"] });
    },
  });
};
