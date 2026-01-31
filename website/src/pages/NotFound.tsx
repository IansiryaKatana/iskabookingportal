import { useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { useBrandingSettings } from "@/hooks/useBranding";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { GridScan } from "@/components/GridScan";

const NotFound = () => {
  const location = useLocation();
  const { data: brandingSettings } = useBrandingSettings();
  const companyName = brandingSettings?.company_name || "Urban Hub";

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    document.title = `Page Not Found | ${companyName} Student Accommodation Preston`;
  }, [companyName]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />
      <main className="flex-1">
        <section
          aria-label="Page not found - Urban Hub Preston student accommodation"
          className="relative flex items-center justify-center overflow-hidden min-h-[100vh] bg-black"
        >
          <div className="absolute inset-0">
            <GridScan
              enablePost={false}
              enableWebcam={false}
              linesColor="rgba(255,255,255,0.15)"
              scanColor="#facc15"
              scanOpacity={0.5}
              gridScale={0.12}
              lineThickness={0.8}
              className="absolute inset-0 w-full h-full"
            />
          </div>
          <div className="relative z-10 container mx-auto max-w-4xl px-4 text-center text-white space-y-6 py-24">
            <h1 className="space-y-2">
              <span
                className="block text-8xl md:text-9xl font-display font-black uppercase leading-none text-white/95 tracking-tighter"
                aria-hidden
              >
                404
              </span>
              <span className="block text-2xl md:text-3xl lg:text-4xl font-display font-bold uppercase tracking-wide text-white/90">
                page not found
              </span>
            </h1>
              <p className="text-sm md:text-base text-white/90 max-w-xl mx-auto">
                This page doesn’t exist or has been moved. Head back to the homepage to find what you need.
              </p>
              <Button size="sm" className="bg-yellow-400 hover:bg-yellow-500 text-black rounded-full w-fit" asChild>
                <Link to="/" className="flex items-center gap-1.5 justify-center mx-auto">
                  Back to home
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
        </section>
      </main>
    </div>
  );
};

export default NotFound;
