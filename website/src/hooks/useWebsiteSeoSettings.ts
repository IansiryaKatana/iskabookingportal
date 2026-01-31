import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WebsiteSeoSettings = {
  id: string;
  site_name: string;
  default_meta_title: string | null;
  default_meta_description: string | null;
  default_og_image_url: string | null;
  twitter_handle: string | null;
  is_active: boolean;
};

export function useWebsiteSeoSettings() {
  return useQuery({
    queryKey: ["website-seo-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_seo_settings")
        .select("id, site_name, default_meta_title, default_meta_description, default_og_image_url, twitter_handle, is_active")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as WebsiteSeoSettings | null;
    },
    staleTime: 5 * 60 * 1000,
  });
}
