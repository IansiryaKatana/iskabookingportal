import Navigation from "@/components/Navigation";
import HeroSection from "@/components/HeroSection";
import ImageGallery from "@/components/ImageGallery";
import PaymentBanner from "@/components/PaymentBanner";
import StudioOverview from "@/components/StudioOverview";
import AmenitiesSection from "@/components/AmenitiesSection";
import Footer from "@/components/Footer";
import FloatingContactRail from "@/components/FloatingContactRail";
import WhatsAppButton from "@/components/WhatsAppButton";
import ContractShowcase from "@/components/ContractShowcase";
import { useBrandingSettings } from "@/hooks/useBranding";

const galleryImages = [
  {
    src: "https://urbanhub.uk/wp-content/uploads/2025/07/how-to-secure-preston-student-accommodation-before-its-snapped-up.png?auto=format&fit=crop&w=1800&q=80",
    alt: "Studio lounge with natural light",
  },
  {
    src: "https://urbanhub.uk/wp-content/uploads/2025/06/Where-to-Stay-for-UCLan-Open-Day-scaled.webp?auto=format&fit=crop&w=1800&q=80",
    alt: "Modern kitchen area",
  },
  {
    src: "https://urbanhub.uk/wp-content/uploads/2025/02/Platinum-Studio-Urban-Hub-Student-Accommodation-2-scaled.webp?auto=format&fit=crop&w=1800&q=80",
    alt: "Cozy living space",
  },
  {
    src: "https://urbanhub.uk/wp-content/uploads/2025/06/Top-Features-to-Expect-in-Modern-Student-Flats-Near-UCLan-scaled.webp?auto=format&fit=crop&w=1800&q=80",
    alt: "Cozy living space",
  },
  {
    src: "https://urbanhub.uk/wp-content/uploads/2025/02/Silver-Studio-Urban-Hub-Student-Accommodation-5-scaled.webp?auto=format&fit=crop&w=1800&q=80",
    alt: "Cozy living space",
  },
  {
    src: "https://urbanhub.uk/wp-content/uploads/2025/02/Silver-Studio-Urban-Hub-Student-Accommodation-3-scaled.webp?auto=format&fit=crop&w=1800&q=80",
    alt: "Cozy living space",
  },
];

type StaticContract = {
  id: string;
  title: string;
  weeks: number;
  weeklyPrice: number;
  deposit: number;
  startDate: string;
  endDate: string;
};

const contracts: StaticContract[] = [
  {
    id: "contract-45",
    title: "25/26 • Ground Floor Ensuite (13th Start Date)",
    weeks: 38,
    weeklyPrice: 121,
    deposit: 0,
    startDate: "2025-11-10",
    endDate: "2026-08-01",
  },
  {
    id: "contract-39",
    title: "25/26 • Ground Floor Ensuite (20th Start Date)",
    weeks: 39,
    weeklyPrice: 121,
    deposit: 0,
    startDate: "2025-11-10",
    endDate: "2026-08-08",
  },
] ;

const amenities = [
  {
    id: "amenity-1",
    name: "Private Ensuite",
    description: "Contemporary bathroom with rainfall shower and LED vanity lighting.",
  },
  {
    id: "amenity-2",
    name: "Smart Storage",
    description: "Built-in wardrobe system with integrated lighting and under-bed drawers.",
  },
  {
    id: "amenity-3",
    name: "Study Suite",
    description: "Executive desk with ergonomic chair, pinboard, and USB-C power.",
  },
];

const AMENITIES_VIDEO_FALLBACK = "https://pzptocwdaqpczexlbajr.supabase.co/storage/v1/object/public/branding/amenities-video.mp4";

function AmenitiesSectionWithBrandingVideo() {
  const { data: brandingSettings } = useBrandingSettings();
  const url = brandingSettings?.amenities_video_url?.trim();
  const videoUrl = url && url.startsWith("http") ? url : AMENITIES_VIDEO_FALLBACK;
  return (
    <AmenitiesSection
      amenities={amenities}
      videoUrl={videoUrl}
      fallbackVideoUrl={AMENITIES_VIDEO_FALLBACK}
    />
  );
}

const StudioGradeStatic = () => (
  <div className="min-h-screen bg-background">
    <Navigation />
    <HeroSection
      title="Silver"
      badgeText="FROM £165 PP/PW"
      description="Compact 19–20m² studio with custom joinery, full ensuite, and designer finishes crafted for focused urban living."
      backgroundImage={galleryImages[0]?.src}
    />
    <main>
      <section className="container mx-auto px-4 py-12 md:py-16 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3">
            <ImageGallery images={galleryImages} />
          </div>
            <div className="lg:col-span-2 flex flex-col">
              <ContractShowcase
                contracts={contracts}
                getWeeks={(contract) => contract.weeks}
                getWeeklyPrice={(contract) => contract.weeklyPrice}
                getDeposit={(contract) => contract.deposit}
                getStartDate={(contract) => contract.startDate}
                getEndDate={(contract) => contract.endDate}
                onSelect={() => undefined}
              />
            </div>
        </div>
      </section>

      <PaymentBanner />

      <StudioOverview
        title="Silver Overview"
        intro="Designed for students who prioritise efficiency and high-spec finishes."
        description={`The Silver studio delivers a boutique residential experience with full height windows, integrated blackout blinds, and a feature headboard with ambient lighting. Each unit includes a compact yet fully equipped kitchen—induction hob, combi oven, under-counter fridge/freezer—and bespoke storage to maximise every centimetre of space.\n\nWork from home in style at the full-width desk with pinboard, USB-C charging, and superfast Wi-Fi, then unwind in the lounge nook or descend to the communal cinema, fitness studio, and coworking lounge.`}
      />

      <AmenitiesSectionWithBrandingVideo />
    </main>

    <Footer />
    <FloatingContactRail />
    <WhatsAppButton />
  </div>
);

export default StudioGradeStatic;


