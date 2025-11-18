import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AcademicYear = Database["public"]["Tables"]["academic_years"]["Row"];

const fetchAcademicYears = async (): Promise<AcademicYear[]> => {
  const { data, error } = await supabase
    .from("academic_years")
    .select("*")
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
};

export const useAdminAcademicYears = () =>
  useQuery({
    queryKey: ["admin-academic-years"],
    queryFn: fetchAcademicYears,
  });

export const useCreateAcademicYear = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      start_date: string;
      end_date: string;
      is_active: boolean;
    }) => {
      const { data, error } = await supabase
        .from("academic_years")
        .insert(payload)
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-academic-years"] });
    },
  });
};

export const useUpdateAcademicYear = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<AcademicYear> & { id: string }) => {
      const { id, ...rest } = payload;
      const { data, error } = await supabase
        .from("academic_years")
        .update(rest)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-academic-years"] });
    },
  });
};

export const useSetActiveAcademicYear = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error: disableError } = await supabase
        .from("academic_years")
        .update({ is_active: false })
        .eq("is_active", true);
      if (disableError) throw disableError;

      const { data, error } = await supabase
        .from("academic_years")
        .update({ is_active: true })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-academic-years"] });
    },
  });
};

