import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WebsiteAnalyticsSettings = {
  id: string;
  google_analytics_id: string | null;
  google_tag_manager_id: string | null;
  is_active: boolean;
};

export function useWebsiteAnalyticsSettings() {
  return useQuery({
    queryKey: ["website-analytics-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_analytics_settings")
        .select("id, google_analytics_id, google_tag_manager_id, is_active")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as WebsiteAnalyticsSettings | null;
    },
    staleTime: 5 * 60 * 1000,
  });
}
