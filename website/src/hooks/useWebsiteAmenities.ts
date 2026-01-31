import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WebsiteAmenity = {
  id: string;
  title: string;
  short_description: string | null;
  vertical_image_url: string | null;
  horizontal_image_url: string | null;
  display_order: number;
};

export type WebsiteAmenityPhoto = {
  id: string;
  amenity_id: string;
  url: string;
  position: number;
};

export function useWebsiteAmenities() {
  return useQuery({
    queryKey: ["website-amenities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_amenities")
        .select("id, title, short_description, vertical_image_url, horizontal_image_url, display_order")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      // Table may not exist until website migration 002 is run (404) – return [] so UI fallback is used
      if (error) {
        const isMissingTable =
          (error as { status?: number }).status === 404 ||
          String(error.message || "").includes("404") ||
          String(error.message || "").toLowerCase().includes("not found");
        if (isMissingTable) {
          return [] as WebsiteAmenity[];
        }
        throw error;
      }
      return (data || []) as WebsiteAmenity[];
    },
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      const msg = String((error as Error)?.message || "");
      if (msg.includes("404") || msg.toLowerCase().includes("not found")) return false;
      return failureCount < 2;
    },
  });
}

/** For homepage: title + vertical image only. */
export function useWebsiteAmenitiesForHomepage() {
  return useWebsiteAmenities();
}

/** For about page: title + description + horizontal image. */
export function useWebsiteAmenitiesForAbout() {
  return useWebsiteAmenities();
}
