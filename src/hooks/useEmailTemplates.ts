import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "@/utils/auditLog";

type EmailTemplate = Database["public"]["Tables"]["email_templates"]["Row"];

export const useEmailTemplates = () => {
  return useQuery({
    queryKey: ["email-templates"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return [];
      }

      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        // Log error but don't throw - return empty array to prevent UI crashes
        console.error("Error fetching email templates:", error);
        return [];
      }
      return data ?? [];
    },
    retry: 1,
    retryDelay: 1000,
  });
};

export const useEmailTemplate = (templateId: string) => {
  return useQuery({
    queryKey: ["email-template", templateId],
    queryFn: async () => {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!templateId || !uuidRegex.test(templateId)) {
        throw new Error("Invalid template ID");
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Use Edge Function to fetch template (bypasses RLS)
      const { data, error } = await supabase.functions.invoke("get-email-template", {
        body: { template_id: templateId },
      });

      if (error) {
        console.error("Error fetching email template:", error);
        throw error;
      }

      return data;
    },
    enabled: !!templateId && templateId !== "disabled" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(templateId),
    retry: 1,
    retryDelay: 1000,
  });
};

export const useCreateEmailTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      subject: string;
      body_html: string;
      body_text?: string;
      template_type: EmailTemplate["template_type"];
      variables?: unknown[];
      is_active?: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("email_templates")
        .insert({
          ...payload,
          created_by: user?.id || null,
          variables: payload.variables ? JSON.stringify(payload.variables) : "[]",
        })
        .select("*")
        .single();

      if (error) throw error;

      // Log email template creation
      await logActivity({
        action: "create",
        entityType: "email_template",
        entityId: data.id,
        payload: {
          name: payload.name,
          template_type: payload.template_type,
          is_active: payload.is_active ?? true,
        },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
    },
  });
};

export const useUpdateEmailTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      name?: string;
      subject?: string;
      body_html?: string;
      body_text?: string;
      template_type?: EmailTemplate["template_type"];
      variables?: unknown[];
      is_active?: boolean;
    }) => {
      const { id, ...rest } = payload;
      const updateData: Record<string, unknown> = { ...rest };
      
      if (payload.variables) {
        updateData.variables = JSON.stringify(payload.variables);
      }

      // Get old template data for logging
      const { data: oldTemplate } = await supabase
        .from("email_templates")
        .select("name, is_active")
        .eq("id", id)
        .single();

      const { data, error } = await supabase
        .from("email_templates")
        .update(updateData)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;

      // Log email template update
      await logActivity({
        action: "update",
        entityType: "email_template",
        entityId: id,
        payload: {
          changes: {
            name: payload.name !== undefined
              ? { from: oldTemplate?.name, to: payload.name }
              : undefined,
            is_active: payload.is_active !== undefined
              ? { from: oldTemplate?.is_active, to: payload.is_active }
              : undefined,
          },
        },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
    },
  });
};

export const useDeleteEmailTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      // Get template name for logging
      const { data: template } = await supabase
        .from("email_templates")
        .select("name")
        .eq("id", templateId)
        .single();

      const { error } = await supabase
        .from("email_templates")
        .delete()
        .eq("id", templateId);

      if (error) throw error;

      // Log email template deletion
      await logActivity({
        action: "delete",
        entityType: "email_template",
        entityId: templateId,
        payload: {
          name: template?.name,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
    },
  });
};

export const useBulkDeleteEmailTemplates = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateIds: string[]) => {
      if (templateIds.length === 0) return;

      const { error } = await supabase
        .from("email_templates")
        .delete()
        .in("id", templateIds);

      if (error) throw error;

      await logActivity({
        action: "delete",
        entityType: "email_template",
        entityId: templateIds.join(","),
        payload: {
          bulk: true,
          count: templateIds.length,
          ids: templateIds,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
    },
  });
};

export const useBulkUpdateEmailTemplatesActive = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { templateIds: string[]; is_active: boolean }) => {
      if (payload.templateIds.length === 0) return;

      const { error } = await supabase
        .from("email_templates")
        .update({ is_active: payload.is_active })
        .in("id", payload.templateIds);

      if (error) throw error;

      await logActivity({
        action: "update",
        entityType: "email_template",
        entityId: payload.templateIds.join(","),
        payload: {
          bulk: true,
          count: payload.templateIds.length,
          ids: payload.templateIds,
          is_active: payload.is_active,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
    },
  });
};

