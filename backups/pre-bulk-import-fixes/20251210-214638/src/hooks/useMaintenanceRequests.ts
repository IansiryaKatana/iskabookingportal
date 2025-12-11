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
};

export const useMaintenanceRequests = (studentId?: string) => {
  return useQuery({
    queryKey: ["maintenance-requests", studentId],
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

      if (studentId) {
        query = query.eq("student_id", studentId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as MaintenanceRequestWithRelations[];
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
      queryClient.invalidateQueries({ queryKey: ["maintenance-requests", variables.student_id] });
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
      queryClient.invalidateQueries({ queryKey: ["maintenance-requests"] });
    },
  });
};

