import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notifyBookingEvent } from "@/utils/notifyBookingEvent";
import type { Database } from "@/integrations/supabase/types";

type StudioRow = Database["public"]["Tables"]["studios"]["Row"];

/** When academicYearId is set, uses per-year effective status (e.g. maintenance for that year only). */
const fetchStudios = async (
  studioGradeId: string,
  academicYearId?: string | null
): Promise<StudioRow[]> => {
  // Release stale holds before reading availability (no external cron required).
  await supabase.rpc("release_expired_studio_holds").then(({ error }) => {
    if (error) console.warn("release_expired_studio_holds:", error.message);
  });

  if (academicYearId) {
    const { data, error } = await supabase
      .from("studio_status_by_academic_year")
      .select(
        "studio_id, studio_number, studio_grade_id, floor, allocation, is_active, effective_status, reservation_expires_at"
      )
      .eq("studio_grade_id", studioGradeId)
      .eq("academic_year_id", academicYearId)
      .order("studio_number", { ascending: true });

    if (error) throw error;

    const filtered = (data ?? []).filter((row) => {
      const allocation = row.allocation;
      return (
        allocation === null ||
        allocation === "Student" ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(allocation ?? "")
      );
    });

    return filtered.map((row) => ({
      id: row.studio_id,
      studio_number: row.studio_number,
      studio_grade_id: row.studio_grade_id,
      floor: row.floor,
      allocation: row.allocation,
      is_active: row.is_active ?? true,
      status: (row.effective_status ?? "available") as StudioRow["status"],
      reservation_expires_at: row.reservation_expires_at,
      created_at: "",
      updated_at: "",
    })) as StudioRow[];
  }

  const { data, error } = await supabase
    .from("studios")
    .select("*")
    .eq("studio_grade_id", studioGradeId)
    .eq("is_active", true)
    .order("studio_number", { ascending: true });

  if (error) throw error;

  const filtered = (data ?? []).filter((studio) => {
    const allocation = studio.allocation;
    return (
      allocation === null ||
      allocation === "Student" ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(allocation ?? "")
    );
  });

  return filtered;
};

export const useStudios = (
  studioGradeId?: string,
  academicYearId?: string | null
) =>
  useQuery({
    queryKey: ["studios", studioGradeId, academicYearId ?? null],
    queryFn: () =>
      studioGradeId
        ? fetchStudios(studioGradeId, academicYearId)
        : Promise.resolve([]),
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
    const { data: studioRow } = await supabase
      .from("studios")
      .select("studio_number")
      .eq("id", studioId)
      .maybeSingle();

    void notifyBookingEvent("studio_reserved", applicationId, {
      studioNumber: studioRow?.studio_number ?? undefined,
    });

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

