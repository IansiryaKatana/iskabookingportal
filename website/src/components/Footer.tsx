import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { FaInstagram, FaTiktok, FaLinkedin, FaFacebook, FaWhatsapp } from "react-icons/fa";
import { useBrandingSettings, useNavigationItems, useOpeningHours } from "@/hooks/useBranding";
import logo from "@/assets/urban-hub-logo.webp";
import Noise from "@/components/Noise";

const platformConfig: Record<string, { icon: React.ReactNode }> = {
  instagram: { icon: <FaInstagram className="h-5 w-5" /> },
  tiktok: { icon: <FaTiktok className="h-5 w-5" /> },
  linkedin: { icon: <FaLinkedin className="h-5 w-5" /> },
  facebook: { icon: <FaFacebook className="h-5 w-5" /> },
  whatsapp: { icon: <FaWhatsapp className="h-5 w-5" /> },
};

const Footer = () => {
  const [socials, setSocials] = useState<Array<{ name: string; url: string; icon: React.ReactNode }>>([]);
  const { data: settings } = useBrandingSettings();
  const { data: footerNavItems } = useNavigationItems("footer");
  const { data: openingHours } = useOpeningHours();
  
  const logoPath = settings?.logo_path;
  const logoUrl = logoPath || logo;
  const footerDescription = settings?.footer_description || "Premium student accommodation designed for modern living and academic success.";
  const footerCopyright = settings?.footer_copyright_text || `${settings?.company_name || "StudentStaySolutions"}. All rights reserved.`;
  const contactPhone = settings?.contact_phone || "+44 123 456 7890";
  const contactEmail = settings?.contact_email || "info@urbanhub.uk";
  const contactAddress1 = settings?.contact_address_line1 || "123 Student Street";
  const contactAddress2 = settings?.contact_address_line2 || "City Centre";
  const contactAddress3 = settings?.contact_address_line3 || "Preston, PR1 1AA";
  const emergencyContact = settings?.emergency_contact_text || "Emergency contact available 24/7";

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
    <footer style={{ backgroundColor: 'hsl(0 0% 0%)' }} className="relative text-white py-12 md:py-16 overflow-hidden">
      <Noise patternAlpha={15} />
      <div className="container mx-auto px-4 max-w-7xl relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
          <div>
            <div className="mb-4">
              <img src={logoUrl} alt={settings?.company_name || "StudentStaySolutions"} className="h-12" />
            </div>
            <p className="text-white/80 mb-4">
              {footerDescription}
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
              {footerNavItems?.map((item) => (
                <li key={item.id}>
                  <a
                    href={item.url}
                    target={item.opens_in_new_tab ? "_blank" : undefined}
                    rel={item.opens_in_new_tab ? "noopener noreferrer" : undefined}
                    className="text-white/80 hover:text-white transition-colors"
                  >
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-lg font-display font-black mb-4 uppercase">CONTACT</h4>
            <ul className="space-y-2 text-white/80">
              <li>
                <a href={`tel:${contactPhone.replace(/\s/g, "")}`} className="hover:text-white transition-colors">
                  {contactPhone}
                </a>
              </li>
              <li>
                <a href={`mailto:${contactEmail}`} className="hover:text-white transition-colors">
                  {contactEmail}
                </a>
              </li>
              <li className="pt-2">
                {contactAddress1}<br />
                {contactAddress2}<br />
                {contactAddress3}
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-lg font-display font-black mb-4 uppercase">OPENING HOURS</h4>
            <ul className="space-y-2 text-white/80">
              {(() => {
                if (!openingHours || openingHours.length === 0) return null;

                const formatTime = (timeStr: string | null) => {
                  if (!timeStr) return "";
                  const [hours, minutes] = timeStr.split(":");
                  const hourNum = parseInt(hours, 10);
                  const ampm = hourNum >= 12 ? "pm" : "am";
                  const displayHour = hourNum % 12 || 12;
                  return `${displayHour}:${minutes}${ampm}`;
                };

                // Group consecutive days with the same hours
                const grouped: Array<{
                  days: string[];
                  isClosed: boolean;
                  openTime: string | null;
                  closeTime: string | null;
                  specialNote: string | null;
                }> = [];

                openingHours.forEach((hour, index) => {
                  const prev = grouped[grouped.length - 1];
                  const timeKey = hour.is_closed 
                    ? 'closed' 
                    : `${hour.open_time || ''}-${hour.close_time || ''}`;
                  const prevTimeKey = prev && (prev.isClosed 
                    ? 'closed' 
                    : `${prev.openTime || ''}-${prev.closeTime || ''}`);

                  // Check if we can group with previous (same hours and same special note)
                  if (prev && 
                      timeKey === prevTimeKey && 
                      hour.special_note === prev.specialNote &&
                      index > 0 &&
                      openingHours[index - 1].day_order === hour.day_order - 1) {
                    // Add to existing group
                    prev.days.push(hour.day_name);
                  } else {
                    // Create new group
                    grouped.push({
                      days: [hour.day_name],
                      isClosed: hour.is_closed,
                      openTime: hour.open_time,
                      closeTime: hour.close_time,
                      specialNote: hour.special_note,
                    });
                  }
                });

                return grouped.map((group, idx) => {
                  const dayRange = group.days.length > 1
                    ? `${group.days[0]} to ${group.days[group.days.length - 1]}`
                    : group.days[0];

                  if (group.isClosed) {
                    return (
                      <li key={`group-${idx}`}>
                        {dayRange}: Closed
                        {group.specialNote && (
                          <span className="block text-sm pt-1">{group.specialNote}</span>
                        )}
                      </li>
                    );
                  }

                  const openTime = formatTime(group.openTime);
                  const closeTime = formatTime(group.closeTime);
                  const timeStr = openTime && closeTime ? `${openTime} - ${closeTime}` : "";

                  return (
                    <li key={`group-${idx}`}>
                      {dayRange}: {timeStr || "Closed"}
                      {group.specialNote && (
                        <span className="block text-sm pt-1">{group.specialNote}</span>
                      )}
                    </li>
                  );
                });
              })()}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/20 mt-12 pt-8 text-center text-white/60 text-sm">
          <p>
            © {new Date().getFullYear()} Urban Hub Student Accommodation Preston. All rights reserved.
            <span className="mx-2">|</span>
            <Link to="/privacy" className="text-white/80 hover:text-white transition-colors">Privacy Policy</Link>
            <span className="mx-2">|</span>
            <Link to="/terms" className="text-white/80 hover:text-white transition-colors">Terms & Conditions</Link>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
