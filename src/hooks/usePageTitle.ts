import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBrandingSettings } from "@/hooks/useBranding";

const routeTitleMap: Record<string, string> = {
  "/": "Studios Catalog",
  "/studios": "Studios Catalog",
  "/admin/login": "Admin Portal Login",
  "/admin": "Admin Dashboard",
  "/admin/academic-years": "Academic Years",
  "/admin/studio-grades": "Studio Grades",
  "/admin/payment-plans": "Payment Plans",
  "/admin/payment-history": "Payment History",
  "/admin/early-check-in-payments": "Early Check-in Payments",
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
  const companyName = brandingSettings?.company_name || "Urban Hub";
  const baseTitle = `${companyName} Booking Portal`;
  const [studioGradeName, setStudioGradeName] = useState<string | null>(null);

  useEffect(() => {
    // Get the base path (without dynamic segments)
    const pathname = location.pathname;
    
    // Reset studio grade name when navigating away from studio pages
    if (!pathname.startsWith("/studios/") || pathname === "/studios") {
      setStudioGradeName(null);
    }
    
    // Try exact match first
    let pageTitle = routeTitleMap[pathname];
    
    // If no exact match, try to match route patterns
    if (!pageTitle) {
      // Match studio grade pages - fetch the actual name
      if (pathname.startsWith("/studios/") && pathname !== "/studios") {
        const slug = pathname.split("/studios/")[1]?.split("/")[0]; // Get slug, ignore any additional path segments
        if (slug) {
          // Set temporary title while loading
          document.title = `Studio Grade | ${baseTitle}`;
          
          // Fetch studio grade name
          supabase
            .from("studio_grades")
            .select("name")
            .eq("slug", slug)
            .eq("is_active", true)
            .maybeSingle()
            .then(({ data, error }) => {
              if (!error && data?.name) {
                setStudioGradeName(data.name);
                document.title = `${data.name} | ${baseTitle}`;
              } else {
                // Fallback if fetch fails
                setStudioGradeName(null);
                document.title = `Studio Grade | ${baseTitle}`;
              }
            });
          return; // Exit early, title will be set by the fetch
        } else {
          pageTitle = "Studio Grade";
        }
      }
      // Match admin routes
      else if (pathname.startsWith("/admin/")) {
        const segments = pathname.split("/");
        if (segments.length >= 3) {
          const section = segments[2];
          // Capitalize and format section name
          pageTitle = section
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
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
      // Default fallback
      else {
        pageTitle = companyName;
      }
    }

    // Set the document title
    document.title = `${pageTitle} | ${baseTitle}`;
  }, [location.pathname, companyName, baseTitle]);
};

