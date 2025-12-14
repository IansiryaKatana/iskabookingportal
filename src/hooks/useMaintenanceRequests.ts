import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type MaintenanceRequest = Database["public"]["Tables"]["maintenance_requests"]["Row"];

export type MaintenanceRequestWithRelations = MaintenanceRequest & {
  application?: {
    id: string;
    status: string;
  } | null;
  studio?: {
    id: string;
    studio_number: string;
  } | null;
  academic_year?: {
    id: string;
    name: string;
  } | null;
  assigned_to?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export const useMaintenanceRequests = (
  filters?: {
    studentId?: string;
    assignedToUserId?: string;
    includeUnassigned?: boolean; // For maintenance officers to see unassigned requests they can claim
  } | string // Backward compatibility: allow old signature (studentId as string)
) => {
  // Handle backward compatibility: convert string to filters object
  const normalizedFilters = typeof filters === "string" 
    ? { studentId: filters }
    : filters || {};

  return useQuery({
    queryKey: ["maintenance-requests", normalizedFilters],
    queryFn: async () => {
      let query = supabase
        .from("maintenance_requests")
        .select(`
          *,
          application:student_applications(id, status),
          studio:studios(id, studio_number),
          academic_year:academic_years(id, name)
        `)
        .order("created_at", { ascending: false });

      if (normalizedFilters.studentId) {
        query = query.eq("student_id", normalizedFilters.studentId);
      }

      // Filter by assigned user (for maintenance officers)
      if (normalizedFilters.assignedToUserId) {
        if (normalizedFilters.includeUnassigned) {
          // Show assigned to this user OR unassigned (to allow claiming)
          query = query.or(`assigned_to_user_id.eq.${normalizedFilters.assignedToUserId},assigned_to_user_id.is.null`);
        } else {
          // Show only assigned to this user
          query = query.eq("assigned_to_user_id", normalizedFilters.assignedToUserId);
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      
      if (!data || data.length === 0) {
        return [] as MaintenanceRequestWithRelations[];
      }

      // Fetch assigned_to profiles separately (assigned_to_user_id references auth.users)
      const assignedUserIds = data
        .map((r) => r.assigned_to_user_id)
        .filter((id): id is string => Boolean(id));
      
      let profilesMap: Record<string, { id: string; first_name: string | null; last_name: string | null }> = {};
      
      if (assignedUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", assignedUserIds);
        
        if (profiles) {
          profiles.forEach((profile) => {
            profilesMap[profile.id] = profile;
          });
        }
      }

      // Map maintenance requests with assigned_to profile
      return data.map((request) => ({
        ...request,
        assigned_to: request.assigned_to_user_id 
          ? (profilesMap[request.assigned_to_user_id] || null)
          : null,
      })) as MaintenanceRequestWithRelations[];
    },
    // Query is enabled when studentId is provided (student view) or when no studentId (admin view)
    enabled: true,
  });
};

export const useCreateMaintenanceRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: {
      student_id: string;
      application_id?: string;
      studio_id?: string;
      request_type: "maintenance" | "cleaning" | "general" | "other";
      title: string;
      description: string;
      priority?: "low" | "normal" | "high" | "urgent";
      images?: string[];
      academic_year_id?: string;
    }) => {
      const { data, error } = await supabase
        .from("maintenance_requests")
        .insert({
          ...request,
          images: request.images || [], // Ensure images is always an array
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      // Invalidate all related queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["maintenance-requests"] });
    },
  });
};

export const useUpdateMaintenanceRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<MaintenanceRequest>;
    }) => {
      const { data, error } = await supabase
        .from("maintenance_requests")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Invalidate all maintenance request queries to ensure all views update
      queryClient.invalidateQueries({ queryKey: ["maintenance-requests"] });
    },
  });
};

