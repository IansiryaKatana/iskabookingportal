import { useEffect, useState } from "react";
import { useBrandingSettings } from "@/hooks/useBranding";

type StaffAuthShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  panelTitle?: string;
  panelBody?: string;
};

export function StaffAuthShell({
  title,
  subtitle,
  children,
  panelTitle = "SECURE ACCESS",
  panelBody = "Staff accounts require an authenticator app. A password alone is not enough to use the admin portal or destructive tools.",
}: StaffAuthShellProps) {
  const { data: brandingSettings } = useBrandingSettings();
  const faviconUrl = brandingSettings?.favicon_path || "/favicon.png";
  const [faviconLoaded, setFaviconLoaded] = useState(false);

  useEffect(() => {
    setFaviconLoaded(false);
    const img = new Image();
    img.onload = () => setFaviconLoaded(true);
    img.onerror = () => setFaviconLoaded(true);
    img.src = faviconUrl;
  }, [faviconUrl]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ backgroundColor: "#fbb37c" }}>
      <div className="w-full max-w-6xl flex rounded-2xl overflow-hidden shadow-2xl">
        <div className="w-full lg:w-[35%] bg-white p-6 md:p-8 lg:p-12 flex flex-col">
          <div className="mb-6 md:mb-8">
            <div
              className="h-12 w-12 md:h-14 md:w-14 rounded-lg flex items-center justify-center shadow-md relative"
              style={{ backgroundColor: "hsl(350 85% 95%)" }}
            >
              {faviconLoaded ? (
                <img src={faviconUrl} alt="Urban Hub" className="h-8 w-8 md:h-10 md:w-10" />
              ) : (
                <span className="text-white font-display font-black text-lg md:text-xl">UH</span>
              )}
            </div>
          </div>
          <div className="mb-6 md:mb-8">
            <h2 className="text-2xl md:text-3xl font-display font-black uppercase tracking-wide text-foreground mb-2">
              {title}
            </h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex-1 flex flex-col">{children}</div>
        </div>
        <div className="hidden lg:flex lg:w-[65%] relative overflow-hidden min-h-[600px]">
          <div
            className="absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse 80% 50% at 20% 30%, hsl(48 96% 53%) 0%, transparent 50%),
                radial-gradient(ellipse 60% 80% at 80% 20%, hsl(25 95% 65%) 0%, transparent 50%),
                radial-gradient(ellipse 70% 60% at 50% 70%, hsl(0 85% 55%) 0%, transparent 50%),
                hsl(0 85% 55%)
              `,
            }}
          />
          <div className="relative z-10 w-full h-full">
            <div className="absolute bottom-0 right-0 text-right" style={{ paddingBottom: "50px", paddingRight: "50px" }}>
              <p className="text-4xl md:text-5xl lg:text-6xl font-display font-black uppercase tracking-wide text-white mb-4">
                {panelTitle}
              </p>
              <p className="max-w-lg ml-auto text-[10px] md:text-[11px] leading-relaxed text-white/95">
                {panelBody}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
