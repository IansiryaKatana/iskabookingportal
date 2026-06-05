import { useEffect } from "react";
import { useBrandingSettings } from "@/hooks/useBranding";

const MetaTagsUpdater = () => {
  const { data: brandingSettings } = useBrandingSettings();

  useEffect(() => {
    if (!brandingSettings) return;

    const companyName = brandingSettings.company_name || "Urban Hub";
    const metaDescription = brandingSettings.meta_description || 
      `Modern student accommodation. Book your studio apartment for the academic year. Premium amenities and convenient location.`;
    const faviconPath = brandingSettings.favicon_path || "/favicon.png";
    const twitterHandle = brandingSettings.twitter_handle || "@UrbanHubBooking";
    const ogImage = faviconPath;

    // Helper function to update or create meta tag by property
    const updateMetaTagByProperty = (property: string, content: string) => {
      let meta = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("property", property);
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", content);
    };

    // Helper function to update or create meta tag by name
    const updateMetaTagByName = (name: string, content: string) => {
      let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", name);
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", content);
    };

    // Update title (base title - usePageTitle will add page-specific parts)
    const baseTitle = `${companyName} Booking Portal`;
    if (!document.title.includes("|")) {
      document.title = baseTitle;
    }

    // Update meta description
    updateMetaTagByName("description", metaDescription);

    // Update meta author
    updateMetaTagByName("author", companyName);

    // Update Open Graph tags
    updateMetaTagByProperty("og:title", `${companyName} | Student Accommodation`);
    updateMetaTagByProperty("og:description", metaDescription);
    updateMetaTagByProperty("og:image", ogImage);

    // Update Twitter Card tags
    updateMetaTagByName("twitter:card", "summary_large_image");
    updateMetaTagByName("twitter:site", twitterHandle);
    updateMetaTagByName("twitter:image", ogImage);
  }, [brandingSettings]);

  return null;
};

export default MetaTagsUpdater;

