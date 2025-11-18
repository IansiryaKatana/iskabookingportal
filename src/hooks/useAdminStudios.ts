import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type StudioRow = Database["public"]["Tables"]["studios"]["Row"];

export type AdminStudio = StudioRow & {
  studio_grade: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

const fetchStudios = async (options?: { gradeId?: string; status?: string; allocation?: string }) => {
  let query = supabase
    .from("studios")
    .select(
      `
        *,
        studio_grade:studio_grades ( id, name, slug )
      `,
    )
    .order("studio_number", { ascending: true });

  if (options?.gradeId) {
    query = query.eq("studio_grade_id", options.gradeId);
  }

  if (options?.status) {
    query = query.eq("status", options.status);
  }

  if (options?.allocation) {
    if (options.allocation === "unallocated") {
      query = query.is("allocation", null);
    } else {
      query = query.eq("allocation", options.allocation);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as AdminStudio[]) ?? [];
};

export const useAdminStudios = (options?: { gradeId?: string; status?: string; allocation?: string }) =>
  useQuery({
    queryKey: ["admin-studios", options],
    queryFn: () => fetchStudios(options),
  });

export const useUpdateStudio = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<StudioRow> & { id: string }) => {
      const { id, ...rest } = payload;
      const { data, error } = await supabase
        .from("studios")
        .update(rest)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-studios"] });
    },
  });
};

