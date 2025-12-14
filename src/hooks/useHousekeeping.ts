import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type HousekeepingStatus = Database["public"]["Tables"]["housekeeping_status"]["Row"];

export type HousekeepingStatusWithRelations = HousekeepingStatus & {
  studio?: {
    id: string;
    studio_number: string;
    studio_grade_id: string;
    floor: string | null;
  } | null;
  assigned_cleaner?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
};

export const useHousekeepingStatus = (filters?: {
  status?: string;
  assigned_cleaner_id?: string;
  studio_id?: string;
}) => {
  return useQuery({
    queryKey: ["housekeeping-status", filters],
    queryFn: async () => {
      let query = supabase
        .from("housekeeping_status")
        .select(`
          *,
          studio:studios(id, studio_number, studio_grade_id, floor)
        `)
        .order("updated_at", { ascending: false });

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.assigned_cleaner_id) {
        query = query.eq("assigned_cleaner_id", filters.assigned_cleaner_id);
      }
      if (filters?.studio_id) {
        query = query.eq("studio_id", filters.studio_id);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      if (!data || data.length === 0) {
        return [] as HousekeepingStatusWithRelations[];
      }

      // Fetch assigned_cleaner profiles separately
      const cleanerIds = data
        .map((h) => h.assigned_cleaner_id)
        .filter((id): id is string => Boolean(id));
      
      let profilesMap: Record<string, { id: string; first_name: string | null; last_name: string | null }> = {};
      
      if (cleanerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", cleanerIds);
        
        if (profiles) {
          profiles.forEach((profile) => {
            profilesMap[profile.id] = profile;
          });
        }
      }

      // Map housekeeping status with assigned_cleaner profile
      return data.map((status) => ({
        ...status,
        assigned_cleaner: status.assigned_cleaner_id 
          ? (profilesMap[status.assigned_cleaner_id] || null)
          : null,
      })) as HousekeepingStatusWithRelations[];
    },
  });
};

export const useUpdateHousekeepingStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<HousekeepingStatus>;
    }) => {
      const { data, error } = await supabase
        .from("housekeeping_status")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["housekeeping-status"] });
    },
  });
};

export const useBulkUpdateHousekeepingStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ids,
      updates,
    }: {
      ids: string[];
      updates: Partial<HousekeepingStatus>;
    }) => {
      const { data, error } = await supabase
        .from("housekeeping_status")
        .update(updates)
        .in("id", ids)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["housekeeping-status"] });
    },
  });
};

