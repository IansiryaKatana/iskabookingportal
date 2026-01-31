import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useBrandingSettings } from "@/hooks/useBranding";
import { useWebsiteSeoSettings } from "@/hooks/useWebsiteSeoSettings";
import { usePageSeo } from "@/hooks/usePageSeo";

const MetaTagsUpdater = () => {
  const location = useLocation();
  const { data: brandingSettings } = useBrandingSettings();
  const { data: seoSettings } = useWebsiteSeoSettings();
  const { data: pageSeo } = usePageSeo(location.pathname);

  useEffect(() => {
    const companyName = seoSettings?.site_name ?? brandingSettings?.company_name ?? "Urban Hub";
    const defaultMetaDesc = seoSettings?.default_meta_description ?? brandingSettings?.meta_description ??
      `Modern student accommodation. Book your studio apartment for the academic year. Premium amenities and convenient location.`;
    const defaultOgImage = brandingSettings?.favicon_path ?? "/favicon.png";
    const defaultOg = seoSettings?.default_og_image_url || defaultOgImage;
    const twitterHandle = seoSettings?.twitter_handle ?? brandingSettings?.twitter_handle ?? "@UrbanHubBooking";

    const metaDescription = pageSeo?.meta_description ?? defaultMetaDesc;
    const ogTitle = pageSeo?.og_title ?? `${companyName} | Student Accommodation`;
    const ogDescription = pageSeo?.og_description ?? metaDescription;
    const ogImage = pageSeo?.og_image_url ?? defaultOg;
    const twitterTitle = pageSeo?.twitter_title ?? ogTitle;
    const twitterDescription = pageSeo?.twitter_description ?? ogDescription;
    const twitterImage = pageSeo?.twitter_image_url ?? ogImage;

    if (!brandingSettings && !seoSettings && !pageSeo) return;

    const updateMetaTagByProperty = (property: string, content: string) => {
      let meta = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("property", property);
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", content);
    };

    const updateMetaTagByName = (name: string, content: string) => {
      let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", name);
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", content);
    };

    // Set document title from seo_pages or fallback to default
    // usePageTitle handles admin/portal routes; MetaTagsUpdater handles public website pages
    const defaultMetaTitle = seoSettings?.default_meta_title ?? `${companyName} Student Accommodation Preston`;
    const pageTitle = pageSeo?.meta_title ?? defaultMetaTitle;
    if (pageTitle) {
      document.title = pageTitle;
    }

    updateMetaTagByName("description", metaDescription);
    updateMetaTagByName("author", companyName);

    updateMetaTagByProperty("og:title", ogTitle);
    updateMetaTagByProperty("og:description", ogDescription);
    updateMetaTagByProperty("og:image", ogImage);
    if (pageSeo?.og_image_alt) {
      updateMetaTagByProperty("og:image:alt", pageSeo.og_image_alt);
    }

    updateMetaTagByName("twitter:card", "summary_large_image");
    updateMetaTagByName("twitter:site", twitterHandle);
    updateMetaTagByName("twitter:title", twitterTitle);
    updateMetaTagByName("twitter:description", twitterDescription);
    updateMetaTagByName("twitter:image", twitterImage);
    if (pageSeo?.twitter_image_alt) {
      updateMetaTagByName("twitter:image:alt", pageSeo.twitter_image_alt);
    }

    if (pageSeo?.canonical_url) {
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.setAttribute("href", pageSeo.canonical_url);
    }

    if (pageSeo?.robots_meta) {
      updateMetaTagByName("robots", pageSeo.robots_meta);
    }

    updateMetaTagByName("theme-color", "#ff2020");
  }, [brandingSettings, seoSettings, pageSeo, location.pathname]);

  return null;
};

export default MetaTagsUpdater;

