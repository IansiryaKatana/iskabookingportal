import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { portalStudiosUrl } from "@/config";

/**
 * Redirects /studios/:year/:slug to the booking portal so users land on the correct studio grade page.
 */
const StudioGradeRedirect = () => {
  const { year, slug } = useParams<{ year: string; slug: string }>();

  useEffect(() => {
    if (year && slug) {
      window.location.replace(portalStudiosUrl(year, slug));
    }
  }, [year, slug]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse text-center">
        <p className="text-muted-foreground">Taking you to the booking portal…</p>
        <div className="mt-4 h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
      </div>
    </div>
  );
};

export default StudioGradeRedirect;
