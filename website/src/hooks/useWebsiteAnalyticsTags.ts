import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AnalyticsTag = {
  id: string;
  tag_name: string;
  element_selector: string;
  event_name: string;
  category: string | null;
};

export function useWebsiteAnalyticsTags() {
  return useQuery({
    queryKey: ["website-analytics-tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_analytics_tags")
        .select("id, tag_name, element_selector, event_name, category")
        .eq("is_active", true)
        .order("tag_name");
      if (error) throw error;
      return (data || []) as AnalyticsTag[];
    },
    staleTime: 2 * 60 * 1000,
  });
}
