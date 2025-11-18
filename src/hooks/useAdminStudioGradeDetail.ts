import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type StudioGrade = Database["public"]["Tables"]["studio_grades"]["Row"];
type StudioGradeMedia = Database["public"]["Tables"]["studio_grade_media"]["Row"];
type StudioGradeBanner = Database["public"]["Tables"]["studio_grade_banners"]["Row"];

type GradeDetail = StudioGrade & {
  studio_grade_media: StudioGradeMedia[];
  studio_grade_banners: StudioGradeBanner[];
};

const fetchGradeDetail = async (gradeId: string): Promise<GradeDetail> => {
  const { data, error } = await supabase
    .from("studio_grades")
    .select(
      `
        *,
        studio_grade_media (*),
        studio_grade_banners (*)
      `,
    )
    .eq("id", gradeId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Studio grade not found");

  return {
    ...data,
    studio_grade_media:
      data.studio_grade_media?.sort((a, b) => a.position - b.position) ?? [],
    studio_grade_banners:
      data.studio_grade_banners?.sort(
        (a, b) => a.display_order - b.display_order,
      ) ?? [],
  };
};

export const useAdminStudioGradeDetail = (gradeId: string | null) =>
  useQuery({
    queryKey: ["admin-studio-grade-detail", gradeId],
    queryFn: () => (gradeId ? fetchGradeDetail(gradeId) : Promise.resolve(null)),
    enabled: Boolean(gradeId),
  });

const getStoragePathFromUrl = (url: string | null | undefined) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/public/studio-media/");
    if (segments.length < 2) return null;
    return decodeURIComponent(segments[1]);
  } catch {
    return null;
  }
};

export const useUploadStudioGradeMedia = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      gradeId: string;
      gradeSlug: string;
      file: File;
    }) => {
      const { gradeId, gradeSlug, file } = payload;

      const extension = file.name.split(".").pop() ?? "jpg";
      const path = `${gradeSlug}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("studio-media")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: existingMax, error: positionError } = await supabase
        .from("studio_grade_media")
        .select("position")
        .eq("studio_grade_id", gradeId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (positionError && positionError.code !== 'PGRST116') {
        // PGRST116 is "no rows returned" which is expected with maybeSingle(), ignore it
        throw positionError;
      }

      const nextPosition = (existingMax?.position ?? -1) + 1;

      const { data: publicUrlData } = supabase.storage
        .from("studio-media")
        .getPublicUrl(path);

      const publicUrl = publicUrlData.publicUrl;

      const { data, error } = await supabase
        .from("studio_grade_media")
        .insert({
          studio_grade_id: gradeId,
          media_type: "image",
          url: publicUrl,
          position: nextPosition,
        })
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["admin-studio-grade-detail", variables.gradeId],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-studio-grades"] });
    },
  });
};

export const useSetHeroStudioMedia = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { mediaId: string; gradeId: string }) => {
      const { mediaId, gradeId } = payload;

      const { error: resetError } = await supabase
        .from("studio_grade_media")
        .update({ is_hero: false })
        .eq("studio_grade_id", gradeId);

      if (resetError) throw resetError;

      const { data, error } = await supabase
        .from("studio_grade_media")
        .update({ is_hero: true })
        .eq("id", mediaId)
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["admin-studio-grade-detail", variables.gradeId],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-studio-grades"] });
    },
  });
};

export const useDeleteStudioMedia = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      mediaId: string;
      gradeId: string;
      url?: string | null;
    }) => {
      const { mediaId, url } = payload;

      const path = getStoragePathFromUrl(url ?? null);

      const { error } = await supabase
        .from("studio_grade_media")
        .delete()
        .eq("id", mediaId);

      if (error) throw error;

      if (path) {
        await supabase.storage.from("studio-media").remove([path]);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["admin-studio-grade-detail", variables.gradeId],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-studio-grades"] });
    },
  });
};

export const useCreateStudioGradeBanner = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { gradeId: string; text: string }) => {
      const { gradeId, text } = payload;

      const { data: maxOrder, error: orderError } = await supabase
        .from("studio_grade_banners")
        .select("display_order")
        .eq("studio_grade_id", gradeId)
        .order("display_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (orderError) throw orderError;

      const nextOrder = (maxOrder?.display_order ?? -1) + 1;

      const { data, error } = await supabase
        .from("studio_grade_banners")
        .insert({
          studio_grade_id: gradeId,
          text,
          display_order: nextOrder,
        })
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["admin-studio-grade-detail", variables.gradeId],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-studio-grades"] });
    },
  });
};

export const useUpdateStudioGradeBanner = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      gradeId: string;
      text?: string;
      display_order?: number;
    }) => {
      const { id, gradeId, ...rest } = payload;
      const { data, error } = await supabase
        .from("studio_grade_banners")
        .update(rest)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;
      return { data, gradeId };
    },
    onSuccess: ({ gradeId }) => {
      queryClient.invalidateQueries({
        queryKey: ["admin-studio-grade-detail", gradeId],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-studio-grades"] });
    },
  });
};

export const useDeleteStudioGradeBanner = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; gradeId: string }) => {
      const { id } = payload;
      const { error } = await supabase
        .from("studio_grade_banners")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return payload.gradeId;
    },
    onSuccess: (gradeId) => {
      queryClient.invalidateQueries({
        queryKey: ["admin-studio-grade-detail", gradeId],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-studio-grades"] });
    },
  });
};


