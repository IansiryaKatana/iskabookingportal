import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useBrandingSettings } from "@/hooks/useBranding";
import { usePageSeo } from "@/hooks/usePageSeo";

/**
 * Fallback titles for admin/portal routes not covered by seo_pages.
 * Public website pages use seo_pages via MetaTagsUpdater.
 */
const routeTitleMap: Record<string, string> = {
  "/admin/login": "Website Admin Login",
  "/admin": "Website Admin",
  "/admin/form-submissions": "Form Submissions",
  "/admin/faqs": "FAQs",
  "/admin/amenities": "Amenities",
  "/admin/why-us": "Why Us",
  "/admin/blog": "Blog",
  "/admin/seo": "SEO",
  "/admin/analytics": "Analytics",
  "/admin/reviews": "Reviews",
  "/admin/academic-years": "Academic Years",
  "/admin/studio-grades": "Studio Grades",
  "/admin/payment-plans": "Payment Plans",
  "/admin/payment-history": "Payment History",
  "/admin/fully-paid-students": "Fully Paid Students",
  "/admin/contracts": "Contracts",
  "/admin/studios": "Studios",
  "/admin/applications": "Applications",
  "/admin/settings": "Settings",
  "/portal/login": "Student Portal Login",
  "/portal": "Student Portal",
  "/portal/applications": "Application",
};

export const usePageTitle = () => {
  const location = useLocation();
  const { data: brandingSettings } = useBrandingSettings();
  const { data: pageSeo } = usePageSeo(location.pathname);
  const companyName = brandingSettings?.company_name || "Urban Hub";
  const baseTitle = `${companyName} Student Accommodation Preston`;

  useEffect(() => {
    const pathname = location.pathname;

    // If pageSeo has a meta_title, MetaTagsUpdater will handle it – don't override
    if (pageSeo?.meta_title) {
      document.title = pageSeo.meta_title;
      return;
    }

    // Fallback for admin/portal routes and pages without seo_pages entry
    let pageTitle: string | undefined = routeTitleMap[pathname];

    if (!pageTitle) {
      // Match admin routes
      if (pathname.startsWith("/admin/")) {
        const segments = pathname.split("/");
        if (segments.length >= 3) {
          const section = segments[2];
          pageTitle = section
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
        } else {
          pageTitle = "Admin";
        }
      }
      // Match portal routes
      else if (pathname.startsWith("/portal/")) {
        if (pathname.includes("/applications/")) {
          pageTitle = "Application";
        } else if (pathname.includes("/select-studio")) {
          pageTitle = "Select Studio";
        } else {
          pageTitle = "Student Portal";
        }
      }
      // Match contract pages
      else if (pathname.startsWith("/contracts/")) {
        pageTitle = "Contract Details";
      }
      // Default fallback for any other route without seo_pages
      else {
        pageTitle = companyName;
      }
    }

    document.title = `${pageTitle} | ${baseTitle}`;
  }, [location.pathname, companyName, baseTitle, pageSeo?.meta_title]);
};

