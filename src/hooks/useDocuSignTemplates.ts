import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type DocuSignTemplate = Database["public"]["Tables"]["docusign_templates"]["Row"];

const fetchTemplates = async (academicYearId?: string): Promise<DocuSignTemplate[]> => {
  let query = supabase
    .from("docusign_templates")
    .select("*")
    .order("academic_year_id", { ascending: false })
    .order("template_type", { ascending: true });

  if (academicYearId) {
    query = query.eq("academic_year_id", academicYearId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data ?? [];
};

export const useDocuSignTemplates = (academicYearId?: string) =>
  useQuery({
    queryKey: ["docusign-templates", academicYearId],
    queryFn: () => fetchTemplates(academicYearId),
  });

export const useCreateDocuSignTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      academic_year_id: string;
      template_type: "tenancy" | "guarantor";
      template_id: string;
      role_names?: Record<string, string>;
      is_active?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("docusign_templates")
        .insert(payload)
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docusign-templates"] });
    },
  });
};

export const useUpdateDocuSignTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<DocuSignTemplate> & { id: string }) => {
      const { id, ...updateData } = payload;
      const { data, error } = await supabase
        .from("docusign_templates")
        .update(updateData)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docusign-templates"] });
    },
  });
};

export const useDeleteDocuSignTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("docusign_templates")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docusign-templates"] });
    },
  });
};

