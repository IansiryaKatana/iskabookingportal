import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Review = {
  id: string;
  reviewer_name: string;
  reviewer_email: string | null;
  rating: number;
  title: string | null;
  content: string;
  status: "pending" | "approved" | "rejected";
  featured: boolean;
  helpful_count: number;
  verified_purchase: boolean;
  created_at: string;
};

/** Public: fetch approved reviews for display on /reviews */
export function useReviews() {
  return useQuery({
    queryKey: ["website-reviews-approved"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_reviews")
        .select("id, reviewer_name, rating, title, content, featured, helpful_count, verified_purchase, created_at")
        .eq("status", "approved")
        .order("featured", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Omit<Review, "reviewer_email" | "status">[];
    },
  });
}
