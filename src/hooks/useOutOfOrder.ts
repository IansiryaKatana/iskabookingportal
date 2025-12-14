import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type OutOfOrderRecord = Database["public"]["Tables"]["out_of_order_records"]["Row"];

export type OutOfOrderRecordWithRelations = OutOfOrderRecord & {
  studio?: {
    id: string;
    studio_number: string;
    studio_grade_id: string;
    floor: string | null;
  } | null;
  maintenance_request?: {
    id: string;
    title: string;
    status: string;
  } | null;
  created_by_user?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export const useOutOfOrderRecords = (filters?: {
  is_active?: boolean;
  studio_id?: string;
}) => {
  return useQuery({
    queryKey: ["out-of-order-records", filters],
    queryFn: async () => {
      let query = supabase
        .from("out_of_order_records")
        .select(`
          *,
          studio:studios(id, studio_number, studio_grade_id, floor),
          maintenance_request:maintenance_requests(id, title, status)
        `)
        .order("start_at", { ascending: false });

      if (filters?.is_active !== undefined) {
        query = query.eq("is_active", filters.is_active);
      }
      if (filters?.studio_id) {
        query = query.eq("studio_id", filters.studio_id);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      if (!data || data.length === 0) {
        return [] as OutOfOrderRecordWithRelations[];
      }

      // Fetch created_by profiles separately
      const createdByIds = data
        .map((r) => r.created_by)
        .filter((id): id is string => Boolean(id));
      
      let profilesMap: Record<string, { id: string; first_name: string | null; last_name: string | null }> = {};
      
      if (createdByIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", createdByIds);
        
        if (profiles) {
          profiles.forEach((profile) => {
            profilesMap[profile.id] = profile;
          });
        }
      }

      // Map out of order records with created_by_user profile
      return data.map((record) => ({
        ...record,
        created_by_user: record.created_by 
          ? (profilesMap[record.created_by] || null)
          : null,
      })) as OutOfOrderRecordWithRelations[];
    },
  });
};

export const useCreateOutOfOrderRecord = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (record: {
      studio_id: string;
      maintenance_request_id?: string;
      reason: string;
      start_at?: string;
      expected_end_at?: string;
      is_active?: boolean;
      is_blocking?: boolean;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("out_of_order_records")
        .insert({
          ...record,
          created_by: userData.user?.id,
          is_active: record.is_active ?? true,
          is_blocking: record.is_blocking ?? true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["out-of-order-records"] });
      queryClient.invalidateQueries({ queryKey: ["housekeeping-status"] });
    },
  });
};

export const useUpdateOutOfOrderRecord = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<OutOfOrderRecord>;
    }) => {
      const { data, error } = await supabase
        .from("out_of_order_records")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["out-of-order-records"] });
      queryClient.invalidateQueries({ queryKey: ["housekeeping-status"] });
    },
  });
};

