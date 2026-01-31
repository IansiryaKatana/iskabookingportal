import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { recordFormSubmitEvent } from "@/utils/recordAnalyticsEvent";

export const CONTACT_WEBHOOK_URL = 'https://btbsslznsexidjnzizre.supabase.co/functions/v1/wordpress-webhook';

export type ContactFormData = {
  full_name: string;
  email: string;
  phone: string;
  form_type: "inquiry" | "resident_support";
  reason?: string;
  message: string;
  landing_page?: string;
};

async function saveContactToDb(formData: ContactFormData) {
  await supabase.from("website_form_submissions").insert({
    form_type: formData.form_type,
    name: formData.full_name,
    email: formData.email,
    phone: formData.phone || null,
    message: formData.message || null,
    metadata: {
      reason: formData.reason,
      landing_page: formData.landing_page || "Contact Page",
    },
  });
}

export const useContactForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitContactForm = async (formData: ContactFormData) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(CONTACT_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          form_type: formData.form_type === "inquiry" ? "inquiry" : "resident_support",
          landing_page: formData.landing_page || "Contact Page",
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send contact form');
      }

      const result = await response.json();
      await saveContactToDb(formData).catch((err) => console.warn("Website form save:", err));
      recordFormSubmitEvent(formData.form_type, typeof window !== "undefined" ? window.location.pathname : "/contact");
      toast.success("Thank you! Your message has been sent successfully. We'll get back to you soon.");
      return result;
    } catch (error) {
      console.error('Contact Form Webhook Error:', error);
      toast.error("Something went wrong. Please try again later.");
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    submitContactForm,
    isSubmitting,
  };
};
