import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ReviewFormData = {
  reviewer_name: string;
  reviewer_email: string;
  rating: number;
  title?: string;
  content: string;
};

export function useSubmitReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ReviewFormData) => {
      const { error } = await supabase.from("website_reviews").insert({
        reviewer_name: data.reviewer_name,
        reviewer_email: data.reviewer_email || null,
        rating: data.rating,
        title: data.title?.trim() || null,
        content: data.content.trim(),
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["website-reviews-approved"] });
    },
    onError: () => {
      toast.error("Failed to submit review. Please try again.");
    },
  });
}
