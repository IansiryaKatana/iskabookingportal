import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { recordFormSubmitEvent } from "@/utils/recordAnalyticsEvent";

const SHORT_TERM_WEBHOOK_URL =
  "https://btbsslznsexidjnzizre.supabase.co/functions/v1/wordpress-webhook";

export type ShortTermFormData = {
  full_name: string;
  email: string;
  phone: string;
  guest_type: "tourist" | "keyworker";
  rooms_count: number;
  start_date: string;
  end_date: string;
};

async function saveShortTermToDb(formData: ShortTermFormData) {
  await supabase.from("website_form_submissions").insert({
    form_type: "short_term",
    name: formData.full_name,
    email: formData.email,
    phone: formData.phone || null,
    message: null,
    metadata: {
      guest_type: formData.guest_type,
      rooms_count: formData.rooms_count,
      start_date: formData.start_date,
      end_date: formData.end_date,
      landing_page: "Short Term",
    },
  });
}

export const useShortTermForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitShortTermForm = async (formData: ShortTermFormData) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(SHORT_TERM_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          landing_page: "Short Term",
          form_type: "short_term",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send short term form");
      }

      await response.json();
      await saveShortTermToDb(formData).catch((err) => console.warn("Website form save:", err));
      recordFormSubmitEvent("short_term", typeof window !== "undefined" ? window.location.pathname : "/short-term");
      toast.success(
        "Thank you! Your short stay request has been sent. We'll get back to you soon."
      );
    } catch (error) {
      console.error("Short Term Form Webhook Error:", error);
      toast.error("Something went wrong. Please try again later.");
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  return { submitShortTermForm, isSubmitting };
};
