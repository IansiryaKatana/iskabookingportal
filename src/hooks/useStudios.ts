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
  return data ?? [];
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
  const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  await supabase
    .from("studios")
    .update({
      status: "available",
      reservation_expires_at: null,
      allocation: null,
    })
    .eq("id", studioId)
    .eq("status", "reserved")
    .lt("reservation_expires_at", now);

  const { error: reserveError, data } = await supabase
    .from("studios")
    .update({
      status: "reserved",
      reservation_expires_at: expiry,
      allocation: studentId,
    })
    .eq("id", studioId)
    .eq("status", "available")
    .select("id")
    .maybeSingle();

  if (reserveError) throw reserveError;
  if (!data) throw new Error("Studio already reserved");

  const { error: applicationError } = await supabase
    .from("student_applications")
    .update({
      assigned_studio_id: studioId,
      reserved_studio_expires_at: expiry,
    })
    .eq("id", applicationId);

  if (applicationError) throw applicationError;

  return { studioId, expiry };
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

