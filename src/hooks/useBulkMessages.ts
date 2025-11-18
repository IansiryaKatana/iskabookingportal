import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type BulkMessage = Database["public"]["Tables"]["bulk_messages"]["Row"];

export const useBulkMessages = () => {
  return useQuery({
    queryKey: ["bulk-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulk_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data ?? [];
    },
  });
};

export const useSendBulkMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      title: string;
      message: string;
      notification_type?: "info" | "success" | "warning" | "error";
      email_template_id?: string;
      filters?: Record<string, unknown>;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Create bulk message record
      const { data: bulkMessage, error: bulkError } = await supabase
        .from("bulk_messages")
        .insert({
          title: payload.title,
          message: payload.message,
          notification_type: payload.notification_type || "info",
          email_template_id: payload.email_template_id || null,
          sent_by: user?.id || null,
          filters: payload.filters || {},
          status: "pending",
        })
        .select("*")
        .single();

      if (bulkError) throw bulkError;

      // Call Edge Function to send bulk message
      const { data: result, error: functionError } = await supabase.functions.invoke("send-bulk-message", {
        body: {
          bulk_message_id: bulkMessage.id,
          title: payload.title,
          message: payload.message,
          notification_type: payload.notification_type || "info",
          email_template_id: payload.email_template_id,
          filters: payload.filters || {},
        },
      });

      if (functionError) {
        // Update status to failed
        await supabase
          .from("bulk_messages")
          .update({ status: "failed" })
          .eq("id", bulkMessage.id);
        throw functionError;
      }

      return { bulkMessage, result };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bulk-messages"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
};

