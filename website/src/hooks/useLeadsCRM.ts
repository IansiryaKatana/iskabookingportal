import { useState } from "react";
import { toast } from "sonner";

export const WEBHOOK_URL = 'https://btbsslznsexidjnzizre.supabase.co/functions/v1/wordpress-webhook';

export type LeadFormData = {
  full_name: string;
  email: string;
  phone: string;
  form_type: "booking" | "callback";
  preferred_date: string;
  preferred_time: string;
  studio_type?: string;
  landing_page?: string;
};

export const useLeadsCRM = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitToLeadsCRM = async (formData: LeadFormData) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to send lead to CRM');
      }

      const result = await response.json();
      toast.success(formData.form_type === "booking" ? "Viewing booked successfully!" : "Callback requested successfully!");
      return result;
    } catch (error) {
      console.error('CRM Webhook Error:', error);
      toast.error("Something went wrong. Please try again later.");
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    submitToLeadsCRM,
    isSubmitting,
  };
};
