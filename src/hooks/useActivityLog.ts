import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ActivityLog = Database["public"]["Tables"]["activity_log"]["Row"];

export type ActivityLogWithRelations = ActivityLog & {
  created_by_user?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export const useActivityLog = (filters?: {
  entity_type?: string;
  entity_id?: string;
  limit?: number;
}) => {
  return useQuery({
    queryKey: ["activity-log", filters],
    queryFn: async () => {
      let query = supabase
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false });

      if (filters?.entity_type) {
        query = query.eq("entity_type", filters.entity_type);
      }
      if (filters?.entity_id) {
        query = query.eq("entity_id", filters.entity_id);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      if (!data || data.length === 0) {
        return [] as ActivityLogWithRelations[];
      }

      // Fetch created_by profiles separately
      const createdByIds = data
        .map((log) => log.created_by)
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

      // Map activity logs with created_by_user profile
      return data.map((log) => ({
        ...log,
        created_by_user: log.created_by 
          ? (profilesMap[log.created_by] || null)
          : null,
      })) as ActivityLogWithRelations[];
    },
    enabled: !!(filters?.entity_type && filters?.entity_id),
  });
};

