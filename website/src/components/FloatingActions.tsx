import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowUp, Eye } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { supabase } from "@/integrations/supabase/client";

const VR_URL = "https://vr.urbanhub.uk/";

export default function FloatingActions() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const fetchWhatsApp = async () => {
      const { data, error } = await supabase
        .from("social_media_settings")
        .select("url, is_enabled")
        .eq("platform", "whatsapp")
        .eq("is_enabled", true)
        .single();
      if (error || !data?.url) return;
      setWhatsappUrl(data.url);
    };
    fetchWhatsApp();
  }, []);

  useEffect(() => {
    const handleScroll = () => setShowBackToTop(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (isAdmin) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-3" aria-label="Quick actions">
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all duration-300 hover:scale-110 flex items-center justify-center"
          aria-label="Back to top"
          data-analytics="back-to-top"
        >
          <ArrowUp className="h-6 w-6" />
        </button>
      )}
      <a
        href={VR_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="h-14 w-14 rounded-full bg-zinc-800 text-white shadow-lg hover:bg-zinc-700 transition-all duration-300 hover:scale-110 flex items-center justify-center animate-blink"
        aria-label="Explore building in VR"
      >
        <Eye className="h-6 w-6" />
      </a>
      {whatsappUrl && (
        <button
          onClick={() => window.open(whatsappUrl, "_blank")}
          className="h-14 w-14 rounded-full bg-[#25D366] text-white shadow-lg hover:bg-[#128C7E] transition-all duration-300 hover:scale-110 flex items-center justify-center"
          aria-label="Contact us on WhatsApp"
          data-analytics="whatsapp"
        >
          <FaWhatsapp className="h-7 w-7" />
        </button>
      )}
    </div>
  );
}
