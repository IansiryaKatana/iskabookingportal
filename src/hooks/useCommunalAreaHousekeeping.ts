import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type CommunalAreaHousekeeping = Database["public"]["Tables"]["communal_area_housekeeping"]["Row"];

export type CommunalAreaHousekeepingWithRelations = CommunalAreaHousekeeping & {
  communal_area?: {
    id: string;
    name: string;
    location: string | null;
    cleaning_schedule_type: string;
    cleaning_schedule_days: number[] | null;
  } | null;
  assigned_cleaner?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
  approved_by_profile?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export const useCommunalAreaHousekeeping = (filters?: {
  assignedCleanerId?: string;
  status?: string;
}) => {
  return useQuery({
    queryKey: ["communal-area-housekeeping", filters],
    queryFn: async () => {
      let query = supabase
        .from("communal_area_housekeeping")
        .select(`
          *,
          communal_area:communal_areas(id, name, location, cleaning_schedule_type, cleaning_schedule_days),
          assigned_cleaner:profiles!assigned_cleaner_id(id, first_name, last_name),
          approved_by_profile:profiles!approved_by(id, first_name, last_name)
        `)
        .order("next_clean_due_at", { ascending: true });

      if (filters?.assignedCleanerId) {
        query = query.eq("assigned_cleaner_id", filters.assignedCleanerId);
      }

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []) as CommunalAreaHousekeepingWithRelations[];
    },
  });
};

export const useUpdateCommunalAreaHousekeeping = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<CommunalAreaHousekeeping>;
    }) => {
      const { data, error } = await supabase
        .from("communal_area_housekeeping")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communal-area-housekeeping"] });
    },
  });
};

export const useCreateCommunalAreaHousekeeping = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (housekeeping: {
      communal_area_id: string;
      status?: string;
      assigned_cleaner_id?: string;
      next_clean_due_at?: string;
    }) => {
      const { data, error } = await supabase
        .from("communal_area_housekeeping")
        .insert({
          ...housekeeping,
          status: housekeeping.status || "clean",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communal-area-housekeeping"] });
    },
  });
};

export const useBulkUpdateCommunalAreaHousekeeping = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ids,
      updates,
    }: {
      ids: string[];
      updates: Partial<CommunalAreaHousekeeping>;
    }) => {
      const { data, error } = await supabase
        .from("communal_area_housekeeping")
        .update(updates)
        .in("id", ids)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communal-area-housekeeping"] });
    },
  });
};

