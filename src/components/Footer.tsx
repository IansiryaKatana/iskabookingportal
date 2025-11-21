import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { FaInstagram, FaTiktok, FaLinkedin, FaFacebook, FaWhatsapp } from "react-icons/fa";
import logo from "@/assets/urban-hub-logo.webp";

const platformConfig: Record<string, { icon: React.ReactNode }> = {
  instagram: { icon: <FaInstagram className="h-5 w-5" /> },
  tiktok: { icon: <FaTiktok className="h-5 w-5" /> },
  linkedin: { icon: <FaLinkedin className="h-5 w-5" /> },
  facebook: { icon: <FaFacebook className="h-5 w-5" /> },
  whatsapp: { icon: <FaWhatsapp className="h-5 w-5" /> },
};

const Footer = () => {
  const [socials, setSocials] = useState<Array<{ name: string; url: string; icon: React.ReactNode }>>([]);

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
            url: item.url || "#",
            icon: config.icon,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      setSocials(enabledSocials);
    };

    fetchSocials();
  }, []);

  return (
    <footer style={{ backgroundColor: 'hsl(0 0% 0%)' }} className="text-white py-12 md:py-16">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
          <div>
            <div className="mb-4">
              <img src={logo} alt="Urban Hub" className="h-12" />
            </div>
            <p className="text-white/80 mb-4">
              Premium student accommodation designed for modern living and academic success.
            </p>
            <div className="flex gap-3">
              {socials.map((social) => (
                <Button
                  key={social.name}
                  size="icon"
                  variant="outline"
                  className="bg-white/10 border-white/20 hover:bg-primary hover:border-primary"
                  asChild
                >
                  <a href={social.url} target="_blank" rel="noopener noreferrer" aria-label={social.name}>
                    {social.icon}
                  </a>
                </Button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-lg font-display font-black mb-4 uppercase">QUICK LINKS</h4>
            <ul className="space-y-2">
              <li>
                <a href="#" className="text-white/80 hover:text-white transition-colors">
                  Home
                </a>
              </li>
              <li>
                <a href="#" className="text-white/80 hover:text-white transition-colors">
                  About Us
                </a>
              </li>
              <li>
                <a href="#" className="text-white/80 hover:text-white transition-colors">
                  FAQ
                </a>
              </li>
              <li>
                <a href="#" className="text-white/80 hover:text-white transition-colors">
                  Blog
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-lg font-display font-black mb-4 uppercase">CONTACT</h4>
            <ul className="space-y-2 text-white/80">
              <li>
                <a href="tel:+441234567890" className="hover:text-white transition-colors">
                  +44 123 456 7890
                </a>
              </li>
              <li>
                <a href="mailto:info@urbanhub.uk" className="hover:text-white transition-colors">
                  info@urbanhub.uk
                </a>
              </li>
              <li className="pt-2">
                123 Student Street<br />
                City Centre<br />
                Preston, PR1 1AA
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-lg font-display font-black mb-4 uppercase">OPENING HOURS</h4>
            <ul className="space-y-2 text-white/80">
              <li>Monday - Friday: 9am - 6pm</li>
              <li>Saturday: 10am - 4pm</li>
              <li>Sunday: Closed</li>
              <li className="pt-2 text-sm">
                Emergency contact available 24/7
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/20 mt-12 pt-8 text-center text-white/60 text-sm">
          <p>© {new Date().getFullYear()} Urban Hub. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
