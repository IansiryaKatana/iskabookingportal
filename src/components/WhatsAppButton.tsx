import { useEffect, useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { supabase } from "@/integrations/supabase/client";
import { useBrandingSettings } from "@/hooks/useBranding";

const WhatsAppButton = () => {
  const { data: brandingSettings } = useBrandingSettings();
  const companyName = brandingSettings?.company_name || "StudentStaySolutions";
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const whatsappMessage = `Hi! I'd like to inquire about booking a studio at ${companyName}.`;

  useEffect(() => {
    const fetchWhatsApp = async () => {
      const { data, error } = await supabase
        .from("social_media_settings")
        .select("url, is_enabled")
        .eq("platform", "whatsapp")
        .eq("is_enabled", true)
        .single();

      if (error || !data?.url) {
        return;
      }

      setWhatsappUrl(data.url);
    };

    fetchWhatsApp();
  }, []);

  if (!whatsappUrl) return null;

  const handleClick = () => {
    window.open(whatsappUrl, "_blank");
  };

  return (
    <button
      onClick={handleClick}
      className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-[#25D366] text-white shadow-lg hover:bg-[#128C7E] transition-all duration-300 hover:scale-110 flex items-center justify-center"
      aria-label="Contact us on WhatsApp"
    >
      <FaWhatsapp className="h-7 w-7" />
    </button>
  );
};

export default WhatsAppButton;
