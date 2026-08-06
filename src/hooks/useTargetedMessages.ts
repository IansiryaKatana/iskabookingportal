import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  filterPaymentInstallmentsForReminders,
  toPaymentRecipientPreviews,
  type PaymentDueWithinDays,
  type PaymentRecipientPreview,
  type PaymentReminderStatus,
} from "@/utils/paymentDueWindow";
import type { UpcomingPaidInstallmentItem } from "@/hooks/useAccountingReports";

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
  
  // Payment filters (Accounting Upcoming parity)
  payment_status?: PaymentReminderStatus;
  payment_due_within_days?: PaymentDueWithinDays;
  /** @deprecated Prefer payment_status === "overdue" */
  has_overdue_payments?: boolean;
  /** @deprecated Prefer payment_status + payment_due_within_days */
  payment_due_soon?: boolean;
  
  // Date filters
  application_created_after?: string;
  application_created_before?: string;
  contract_start_after?: string;
  contract_start_before?: string;
  
  // Filter combination logic
  filter_logic?: "AND" | "OR";
};

async function fetchAllUpcomingInstallments(): Promise<UpcomingPaidInstallmentItem[]> {
  const pageSize = 1000;
  let offset = 0;
  const allRows: UpcomingPaidInstallmentItem[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("upcoming_and_paid_installments_report")
      .select("*")
      .order("due_date", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const pageRows = (data || []) as UpcomingPaidInstallmentItem[];
    allRows.push(...pageRows);
    if (pageRows.length < pageSize) break;
    offset += pageSize;
  }

  return allRows;
}

export const usePaymentReminderRecipientsPreview = (
  filters: TargetedMessageFilters,
  enabled: boolean,
) => {
  return useQuery({
    queryKey: [
      "payment-reminder-recipients-preview",
      filters.payment_status,
      filters.payment_due_within_days,
      filters.academic_year_id,
      filters.studio_grade_id,
    ],
    enabled: enabled && !!filters.payment_status,
    queryFn: async (): Promise<PaymentRecipientPreview[]> => {
      if (!filters.payment_status) return [];

      const rows = await fetchAllUpcomingInstallments();
      const academicYearId = filters.academic_year_id?.[0] ?? null;

      let matched = filterPaymentInstallmentsForReminders(rows, {
        paymentStatus: filters.payment_status,
        dueWithinDays:
          filters.payment_status === "upcoming"
            ? filters.payment_due_within_days ?? null
            : null,
        academicYearId,
      });

      // Optional studio grade filter via grade name on the report row
      // (report stores grade name; UI filter uses grade IDs — resolve via applications if needed)
      if (filters.studio_grade_id && filters.studio_grade_id.length > 0) {
        const gradeIds = filters.studio_grade_id;
        const studentIds = [...new Set(matched.map((r) => r.student_id))];
        if (studentIds.length === 0) return [];

        const { data: apps } = await supabase
          .from("student_applications")
          .select("student_id, studio_grade_id, assigned_studio_id")
          .in("student_id", studentIds);

        const matchingStudentIds = new Set<string>();
        for (const app of apps || []) {
          if (app.studio_grade_id && gradeIds.includes(app.studio_grade_id)) {
            matchingStudentIds.add(app.student_id);
          }
        }

        // Also check via assigned studio when studio_grade_id is null on application
        const needsStudioLookup = (apps || []).filter(
          (a) => !a.studio_grade_id && a.assigned_studio_id && !matchingStudentIds.has(a.student_id),
        );
        if (needsStudioLookup.length > 0) {
          const studioIds = needsStudioLookup.map((a) => a.assigned_studio_id!).filter(Boolean);
          const { data: studios } = await supabase
            .from("studios")
            .select("id, studio_grade_id")
            .in("id", studioIds)
            .in("studio_grade_id", gradeIds);
          const matchingStudios = new Set((studios || []).map((s) => s.id));
          for (const app of needsStudioLookup) {
            if (app.assigned_studio_id && matchingStudios.has(app.assigned_studio_id)) {
              matchingStudentIds.add(app.student_id);
            }
          }
        }

        matched = matched.filter((r) => matchingStudentIds.has(r.student_id));
      }

      return toPaymentRecipientPreviews(matched);
    },
  });
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

/** True when emails never finished for a campaign that still has a template. */
export function canRetryTargetedMessage(message: BulkMessage): boolean {
  if (!message.email_template_id) return false;
  if (message.status === "failed" || message.status === "pending") return true;
  if (message.status === "completed") {
    return (message.emails_sent ?? 0) < (message.total_recipients ?? 0);
  }
  return false;
}

export const useRetryTargetedMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (message: BulkMessage) => {
      const filters = (message.filters || {}) as Record<string, unknown>;
      const skipNotifications = (message.notifications_sent ?? 0) > 0;

      await supabase
        .from("bulk_messages")
        .update({ status: "pending" })
        .eq("id", message.id);

      const { data: result, error: functionError } = await supabase.functions.invoke(
        "send-bulk-message",
        {
          body: {
            mode: "targeted",
            bulk_message_id: message.id,
            title: message.title,
            message: message.message,
            notification_type: message.notification_type || "info",
            email_template_id: message.email_template_id,
            filters,
            skip_notifications: skipNotifications,
          },
        },
      );

      if (functionError) {
        await supabase
          .from("bulk_messages")
          .update({ status: "failed" })
          .eq("id", message.id);
        throw functionError;
      }

      return { message, result, skipNotifications };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["targeted-messages"] });
      queryClient.invalidateQueries({ queryKey: ["bulk-messages"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
};

