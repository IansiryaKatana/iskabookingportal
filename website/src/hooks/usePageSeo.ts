import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PageSeo = {
  meta_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  og_image_alt: string | null;
  twitter_title: string | null;
  twitter_description: string | null;
  twitter_image_url: string | null;
  twitter_image_alt: string | null;
  canonical_url: string | null;
  robots_meta: string | null;
};

/**
 * Normalizes paths for SEO lookup so dynamic routes use their base path.
 * e.g. /studios/2025-26 → /studios, / → /studios
 */
function normalizeSeoPath(path: string): string {
  // Index redirects to /studios/:year, so treat / as /studios
  if (path === "/") return "/studios";
  // /studios/:year should use /studios SEO
  if (path.startsWith("/studios/")) return "/studios";
  return path;
}

export function usePageSeo(pagePath: string) {
  const normalizedPath = normalizeSeoPath(pagePath || "/");

  return useQuery({
    queryKey: ["seo-page", normalizedPath],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seo_pages")
        .select("meta_title, meta_description, og_title, og_description, og_image_url, og_image_alt, twitter_title, twitter_description, twitter_image_url, twitter_image_alt, canonical_url, robots_meta")
        .eq("page_path", normalizedPath)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as PageSeo | null;
    },
    enabled: !!pagePath,
    staleTime: 5 * 60 * 1000,
  });
}
