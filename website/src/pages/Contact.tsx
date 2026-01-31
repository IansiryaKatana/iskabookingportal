import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { ContactForm } from "@/components/contact/ContactForm";
import { useBrandingSettings } from "@/hooks/useBranding";
import { useSlotUrl } from "@/hooks/useWebsiteImageSlots";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { FaWhatsapp } from "react-icons/fa";
import { AnimatedText, AnimatedParagraph } from "@/components/animations/AnimatedText";
import TypingTitle from "@/components/TypingTitle";

const Contact = () => {
  const { data: brandingSettings } = useBrandingSettings();
  const companyName = brandingSettings?.company_name || "StudentStaySolutions";
  const contactPhone = brandingSettings?.contact_phone || "+44 793 574 1262";
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const heroSlotUrl = useSlotUrl("hero_contact", brandingSettings?.studio_catalog_hero_image);
  const heroImagePath = heroSlotUrl || "https://urbanhub.uk/wp-content/uploads/2025/05/URBAN-HUB-OUTSIDE-A-3-of-1-scaled-1.webp";

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

  // SEO meta tags are now handled by MetaTagsUpdater using seo_pages table

  const handlePhoneClick = () => {
    window.location.href = `tel:${contactPhone.replace(/\s/g, "")}`;
  };

  const handleWhatsAppClick = () => {
    if (whatsappUrl) {
      window.open(whatsappUrl, "_blank");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      {/* Hero Section */}
      <div className="w-full p-[5px] bg-red-50">
        <section
          aria-label="Urban Hub Preston student accommodation building - Contact page hero"
          className="relative flex items-center justify-center rounded-3xl overflow-hidden"
          style={{
            minHeight: "60vh",
            backgroundImage: heroImagePath
              ? `linear-gradient(180deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.5) 50%, rgba(0, 0, 0, 0.7) 100%), url('${heroImagePath}')`
              : "linear-gradient(180deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.5) 50%, rgba(0, 0, 0, 0.7) 100%), url('https://urbanhub.uk/wp-content/uploads/2025/05/URBAN-HUB-OUTSIDE-A-3-of-1-scaled-1.webp')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="container mx-auto max-w-4xl px-4 text-center text-white space-y-6 py-24">
            <TypingTitle
              as="h1"
              text="CONTACT"
              className="text-5xl md:text-6xl lg:text-7xl font-display font-black uppercase leading-tight"
              typingSpeed={32}
            />
            <AnimatedParagraph delay={0.2} className="text-sm md:text-base text-white/90 max-w-2xl mx-auto">
              Fill out the form below and we&apos;ll get back to you as soon as possible. <br />
              Our team is here to help with any questions. Need to{" "}
              <Link to="/studios" className="underline hover:text-accent-yellow transition-colors">book a viewing</Link>
              {" "}or have{" "}
              <Link to="/faq" className="underline hover:text-accent-yellow transition-colors">FAQ</Link>
              {" "}queries? We&apos;ve got you covered.
            </AnimatedParagraph>
            <AnimatedText delay={0.3}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  onClick={handlePhoneClick}
                  className="bg-accent-yellow hover:bg-accent-yellow/90 text-black rounded-md px-6 py-3 font-semibold text-sm uppercase tracking-wide"
                  data-analytics="contact-phone"
                >
                  {contactPhone}
                </Button>
                {whatsappUrl && (
                  <Button
                    onClick={handleWhatsAppClick}
                    className="bg-[#25D366] hover:bg-[#128C7E] text-white rounded-md px-6 py-3 font-semibold text-sm uppercase tracking-wide flex items-center gap-2"
                    data-analytics="contact-whatsapp"
                  >
                    SEND A MESSAGE
                    <FaWhatsapp className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </AnimatedText>
          </div>
        </section>
      </div>

      {/* Contact Form Section */}
      <main className="bg-red-50 py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-6xl">
          <ContactForm />
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Contact;
