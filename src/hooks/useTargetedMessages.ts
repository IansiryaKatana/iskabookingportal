import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type BulkMessage = Database["public"]["Tables"]["bulk_messages"]["Row"];

export type TargetedMessageFilters = {
  // Direct student selection
  student_ids?: string[];
  
  // Application status filters
  application_status?: string[];
  
  // Accommodation filters
  studio_grade_id?: string[];
  contract_id?: string[];
  academic_year_id?: string[];
  
  // Personal details filters (from step 1)
  country?: string[];
  gender?: string[];
  
  // Academic info filters (from step 3)
  academic_year_student?: string[]; // 1st year, 2nd year, etc.
  field_of_study?: string[];
  has_disability?: boolean;
  
  // Application progress filters
  missing_steps?: number[];
  has_pending_documents?: boolean;
  has_rejected_documents?: boolean;
  
  // Payment filters
  has_overdue_payments?: boolean;
  payment_due_soon?: boolean; // within 7 days
  
  // Date filters
  application_created_after?: string;
  application_created_before?: string;
  contract_start_after?: string;
  contract_start_before?: string;
  
  // Filter combination logic
  filter_logic?: "AND" | "OR";
};

export const useTargetedMessages = () => {
  return useQuery({
    queryKey: ["targeted-messages"],
    queryFn: async () => {
      // Query all bulk_messages and filter for targeted ones (message_type in filters JSONB)
      const { data, error } = await supabase
        .from("bulk_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      
      // Filter for targeted messages (those with message_type: "targeted" in filters or student_ids)
      const targeted = (data ?? []).filter((msg) => {
        const filters = msg.filters as Record<string, unknown> | null;
        return (
          (filters && (filters.message_type === "targeted" || Array.isArray(filters.student_ids))) ||
          false
        );
      });
      
      return targeted;
    },
  });
};

export const useSendTargetedMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      title: string;
      message: string;
      notification_type?: "info" | "success" | "warning" | "error";
      email_template_id?: string;
      filters?: TargetedMessageFilters;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const filtersPayload = {
        ...(payload.filters || {}),
        message_type: "targeted",
      } as Record<string, unknown>;

      // Create targeted message record (using bulk_messages table with message_type)
      const { data: targetedMessage, error: messageError } = await supabase
        .from("bulk_messages")
        .insert({
          title: payload.title,
          message: payload.message,
          notification_type: payload.notification_type || "info",
          email_template_id: payload.email_template_id || null,
          sent_by: user?.id || null,
          filters: filtersPayload,
          status: "pending",
        })
        .select("*")
        .single();

      if (messageError) throw messageError;

      // Call Edge Function to send targeted message
      const { data: result, error: functionError } = await supabase.functions.invoke("send-bulk-message", {
        body: {
          mode: "targeted",
          bulk_message_id: targetedMessage.id,
          title: payload.title,
          message: payload.message,
          notification_type: payload.notification_type || "info",
          email_template_id: payload.email_template_id,
          filters: filtersPayload,
        },
      });

      if (functionError) {
        // Update status to failed
        await supabase
          .from("bulk_messages")
          .update({ status: "failed" })
          .eq("id", targetedMessage.id);
        throw functionError;
      }

      return { targetedMessage, result };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["targeted-messages"] });
      queryClient.invalidateQueries({ queryKey: ["bulk-messages"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
};

export const useBulkDeleteTargetedMessages = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (messageIds: string[]) => {
      if (messageIds.length === 0) return;

      const { error } = await supabase
        .from("bulk_messages")
        .delete()
        .in("id", messageIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["targeted-messages"] });
      queryClient.invalidateQueries({ queryKey: ["bulk-messages"] });
    },
  });
};

