import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FaInstagram, FaTiktok, FaLinkedin, FaFacebook } from "react-icons/fa";

const platformConfig: Record<string, { icon: React.ReactNode; bg: string }> = {
  instagram: { icon: <FaInstagram className="h-5 w-5" />, bg: "bg-[#E4405F]" },
  tiktok: { icon: <FaTiktok className="h-5 w-5" />, bg: "bg-[#010101]" },
  linkedin: { icon: <FaLinkedin className="h-5 w-5" />, bg: "bg-[#0A66C2]" },
  facebook: { icon: <FaFacebook className="h-5 w-5" />, bg: "bg-[#1877F2]" },
};

const FloatingContactRail = () => {
  const [socials, setSocials] = useState<Array<{ name: string; href: string; bg: string; icon: React.ReactNode }>>([]);

  useEffect(() => {
    const fetchSocials = async () => {
      const { data, error } = await supabase
        .from("social_media_settings")
        .select("platform, url, is_enabled")
        .eq("is_enabled", true)
        .order("display_order", { ascending: true });

      if (error) {
        console.error("Error fetching social media settings:", error);
        return;
      }

      const enabledSocials = (data || [])
        .filter((item) => item.url)
        .map((item) => {
          const config = platformConfig[item.platform];
          if (!config) return null;
          return {
            name: item.platform.charAt(0).toUpperCase() + item.platform.slice(1),
            href: item.url || "#",
            bg: config.bg,
            icon: config.icon,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      setSocials(enabledSocials);
    };

    fetchSocials();
  }, []);

  if (socials.length === 0) return null;

  return (
    <div className="fixed right-4 top-1/2 z-30 -translate-y-1/2 hidden flex-col items-center gap-2 xl:flex">
      <div className="flex flex-col items-center gap-2 rounded-full border border-border/60 bg-background/90 px-3 py-4 shadow-lg backdrop-blur">
        {socials.map((social) => (
          <a
            key={social.name}
            href={social.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={social.name}
            className={`flex h-10 w-10 items-center justify-center rounded-full text-white transition-transform duration-200 hover:scale-110 ${social.bg}`}
          >
            {social.icon}
          </a>
        ))}
      </div>
    </div>
  );
};

export default FloatingContactRail;
