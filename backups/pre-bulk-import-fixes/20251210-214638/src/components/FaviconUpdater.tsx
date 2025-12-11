import { useEffect } from "react";
import { useBrandingSetting } from "@/hooks/useBranding";

const FaviconUpdater = () => {
  const faviconPath = useBrandingSetting("favicon_path");

  useEffect(() => {
    if (faviconPath) {
      // Remove existing favicon links
      const existingLinks = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
      existingLinks.forEach((link) => link.remove());

      // Add new favicon link
      const link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/png";
      link.href = faviconPath;
      document.head.appendChild(link);

      // Also update og:image and twitter:image meta tags
      const updateMetaTag = (property: string, content: string) => {
        let meta = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
        if (!meta) {
          meta = document.createElement("meta");
          meta.setAttribute("property", property);
          document.head.appendChild(meta);
        }
        meta.setAttribute("content", content);
      };

      updateMetaTag("og:image", faviconPath);
      updateMetaTag("twitter:image", faviconPath);
    }
  }, [faviconPath]);

  return null;
};

export default FaviconUpdater;

