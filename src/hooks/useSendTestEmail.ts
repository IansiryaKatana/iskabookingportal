import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SendTestEmailResult = {
  sent: number;
  failed: number;
  errors: string[];
};

/**
 * Sends a [TEST] copy of a transactional email template (email_templates)
 * to staff/admin recipients. Variables are filled with sample data by the
 * edge function so the layout can be checked in a real inbox.
 */
export const useSendTestEmail = () =>
  useMutation({
    mutationFn: async (payload: {
      template_id?: string;
      subject?: string;
      body_html?: string;
      body_text?: string;
      to: string[];
    }) => {
      const recipients = Array.from(
        new Set(
          payload.to
            .map((email) => email.trim().toLowerCase())
            .filter((email) => EMAIL_REGEX.test(email)),
        ),
      );

      if (recipients.length === 0) {
        throw new Error("Enter at least one valid email address.");
      }

      const { data, error } = await supabase.functions.invoke("send-test-email", {
        body: { ...payload, to: recipients },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as SendTestEmailResult;
    },
  });
