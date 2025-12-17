import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type StudioRow = Database["public"]["Tables"]["studios"]["Row"];

const fetchStudios = async (studioGradeId: string): Promise<StudioRow[]> => {
  const { data, error } = await supabase
    .from("studios")
    .select("*")
    .eq("studio_grade_id", studioGradeId)
    .eq("is_active", true)
    .order("studio_number", { ascending: true });

  if (error) throw error;
  
  // Filter out studios allocated to OTA or Keyworkers
  // Students should only see: NULL (Unallocated), 'Student', or UUID (temporary reservation)
  const filtered = (data ?? []).filter((studio) => {
    const allocation = studio.allocation;
    // Allow NULL, 'Student', or UUID format (temporary reservations)
    return (
      allocation === null ||
      allocation === "Student" ||
      // UUID format check (temporary student reservation)
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(allocation)
    );
  });
  
  return filtered;
};

export const useStudios = (studioGradeId?: string) =>
  useQuery({
    queryKey: ["studios", studioGradeId],
    queryFn: () =>
      studioGradeId ? fetchStudios(studioGradeId) : Promise.resolve([]),
    enabled: Boolean(studioGradeId),
    refetchInterval: 30_000,
  });

type ReservePayload = {
  studioId: string;
  applicationId: string;
  studentId: string;
};

const reserveStudio = async ({
  studioId,
  applicationId,
  studentId,
}: ReservePayload) => {
  // Use atomic database function to prevent race conditions
  const { data, error } = await supabase.rpc("reserve_studio_atomic", {
    p_studio_id: studioId,
    p_application_id: applicationId,
    p_student_id: studentId,
    p_reservation_duration_minutes: 30, // 30 minutes default
  });

  if (error) {
    // Extract error message from database
    // Supabase RPC errors can have message, details, or hint
    const errorMessage = 
      error.message || 
      (error as any).details || 
      (error as any).hint || 
      "Failed to reserve studio";
    throw new Error(errorMessage);
  }

  if (!data) {
    throw new Error("Failed to reserve studio - no response from server");
  }

  // Check if the function returned an error (function returns JSONB with success flag)
  if (data && typeof data === 'object' && 'success' in data && data.success === false) {
    const errorMessage = (data as any).error || "Studio reservation failed";
    throw new Error(errorMessage);
  }

  // Return the result in the expected format
  // Handle both old format (if function returns directly) and new JSONB format
  if (data && typeof data === 'object' && 'studio_id' in data) {
    return {
      studioId: (data as any).studio_id,
      expiry: (data as any).expiry,
    };
  }

  // Fallback for unexpected response format
  throw new Error("Unexpected response format from reservation service");
};

type ReleasePayload = {
  studioId: string;
  applicationId: string;
};

const releaseStudio = async ({
  studioId,
  applicationId,
}: ReleasePayload) => {
  const { error: releaseError } = await supabase
    .from("studios")
    .update({
      status: "available",
      reservation_expires_at: null,
      allocation: null,
    })
    .eq("id", studioId)
    .eq("status", "reserved");

  if (releaseError) throw releaseError;

  const { error: applicationError } = await supabase
    .from("student_applications")
    .update({
      assigned_studio_id: null,
      reserved_studio_expires_at: null,
    })
    .eq("id", applicationId);

  if (applicationError) throw applicationError;
};

export const useReserveStudio = (studioGradeId?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reserveStudio,
    onSuccess: (_data, variables) => {
      if (studioGradeId) {
        queryClient.invalidateQueries({
          queryKey: ["studios", studioGradeId],
        });
      }
      queryClient.invalidateQueries({
        queryKey: ["student-application", variables.applicationId],
      });
    },
  });
};

export const useReleaseStudio = (studioGradeId?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: releaseStudio,
    onSuccess: (_, variables) => {
      if (studioGradeId) {
        queryClient.invalidateQueries({
          queryKey: ["studios", studioGradeId],
        });
      }
      queryClient.invalidateQueries({
        queryKey: ["student-application", variables.applicationId],
      });
    },
  });
};

