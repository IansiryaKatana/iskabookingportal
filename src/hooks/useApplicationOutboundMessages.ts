import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OutboundMessageType =
  | "deposit_reminder"
  | "signature_reminder"
  | "application_confirmed"
  | "installment_invoice";

export type ApplicationOutboundMessage = {
  id: string;
  application_id: string;
  student_id: string | null;
  sent_by: string | null;
  message_type: OutboundMessageType;
  channel: string;
  recipient_email: string;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  status: "sent" | "failed";
  provider_message_id: string | null;
  attachment_path: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export const OUTBOUND_MESSAGE_LABELS: Record<OutboundMessageType, string> = {
  deposit_reminder: "Deposit reminder",
  signature_reminder: "Signature reminder",
  application_confirmed: "Confirmation",
  installment_invoice: "Installment invoice",
};

export function useApplicationOutboundMessages(applicationId: string | undefined) {
  return useQuery({
    queryKey: ["application-outbound-messages", applicationId],
    enabled: Boolean(applicationId),
    queryFn: async () => {
      if (!applicationId) return [] as ApplicationOutboundMessage[];
      const { data, error } = await (supabase as any)
        .from("application_outbound_messages")
        .select("*")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApplicationOutboundMessage[];
    },
  });
}

export function useInvalidateOutboundMessages() {
  const queryClient = useQueryClient();
  return (applicationId: string) =>
    queryClient.invalidateQueries({
      queryKey: ["application-outbound-messages", applicationId],
    });
}

export async function createSignedInvoiceUrl(attachmentPath: string) {
  const { data, error } = await supabase.storage
    .from("application-invoices")
    .createSignedUrl(attachmentPath, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export function useActiveEmailTemplateByType(templateType: string | null) {
  return useQuery({
    queryKey: ["email-template-by-type", templateType],
    enabled: Boolean(templateType),
    queryFn: async () => {
      if (!templateType) return null;
      const { data, error } = await supabase
        .from("email_templates")
        .select("id, name, subject, body_html, body_text, template_type, is_active")
        .eq("template_type", templateType)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSendApplicationTransactionalEmail() {
  return useMutation({
    mutationFn: async (payload: {
      user_id: string;
      email_type: OutboundMessageType;
      message_type: OutboundMessageType;
      application_id: string;
      template_id?: string;
      variables: Record<string, string>;
    }) => {
      const { data, error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          user_id: payload.user_id,
          email_type: payload.email_type,
          message_type: payload.message_type,
          application_id: payload.application_id,
          template_id: payload.template_id,
          variables: payload.variables,
          create_notification: true,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as {
        message: string;
        email_id?: string;
        subject?: string;
        outboundMessageId?: string;
      };
    },
  });
}

export function usePreviewInstallmentInvoice() {
  return useMutation({
    mutationFn: async (payload: {
      applicationId: string;
      installmentId: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("send-installment-invoice-email", {
        body: {
          applicationId: payload.applicationId,
          installmentId: payload.installmentId,
          preview: true,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as {
        preview: true;
        subject: string;
        html: string;
        text: string;
        invoiceNumber: string;
        pdfBase64: string;
        recipientEmail: string;
        installmentId: string;
        filename: string;
      };
    },
  });
}

export function useSendInstallmentInvoice() {
  return useMutation({
    mutationFn: async (payload: {
      applicationId: string;
      installmentId: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("send-installment-invoice-email", {
        body: {
          applicationId: payload.applicationId,
          installmentId: payload.installmentId,
          preview: false,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as {
        message: string;
        invoiceNumber: string;
        installmentId: string;
        outboundMessageId?: string;
      };
    },
  });
}
