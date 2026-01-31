import React, { useEffect, useState, useMemo, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useBrandingSetting, useBrandingSettings } from "@/hooks/useBranding";
import { useWebsiteImageSlots, getSlotUrl } from "@/hooks/useWebsiteImageSlots";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselDots,
  CarouselPrevious,
  CarouselNext,
  useCarousel,
} from "@/components/ui/carousel";
import AutoScroll from "embla-carousel-auto-scroll";
import {
  Building2,
  Home,
  ShoppingBag,
  LayoutGrid,
  Sun,
  Users,
  Sparkles,
  Dumbbell,
  ArrowRight,
  ArrowUpRight,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Check,
  CircleCheck,
  X,
} from "lucide-react";
import { useAllStudioAvailability, getAvailabilityTag, isFullyBooked } from "@/hooks/useStudioAvailability";
import { useWebsiteAmenities } from "@/hooks/useWebsiteAmenities";
import { useWhyUsCards } from "@/hooks/useWhyUsCards";
import { AnimatedHeading, AnimatedText, AnimatedParagraph, AnimatedCard } from "@/components/animations/AnimatedText";
import Noise from "@/components/Noise";
import TypingTitle from "@/components/TypingTitle";
import { LeadForm } from "@/components/leads/LeadForm";

const HeroDots = ({ className = "" }: { className?: string }) => {
  const { api } = useCarousel();
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [scrollSnaps, setScrollSnaps] = React.useState<number[]>([]);

  React.useEffect(() => {
    if (!api) return;

    const updateScrollSnaps = () => setScrollSnaps(api.scrollSnapList());
    const updateSelectedIndex = () => setSelectedIndex(api.selectedScrollSnap());

    updateScrollSnaps();
    updateSelectedIndex();

    api.on("reInit", updateScrollSnaps);
    api.on("reInit", updateSelectedIndex);
    api.on("select", updateSelectedIndex);

    return () => {
      api.off("reInit", updateScrollSnaps);
      api.off("reInit", updateSelectedIndex);
      api.off("select", updateSelectedIndex);
    };
  }, [api]);

  if (scrollSnaps.length <= 1) return null;

  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      {scrollSnaps.map((_, index) => (
        <button
          key={index}
          type="button"
          onClick={() => api?.scrollTo(index)}
          className={`h-1.5 rounded-full transition-all ${
            selectedIndex === index
              ? "w-10 bg-[#ff2020]"
              : "w-3 bg-white/35 hover:bg-white/60"
          }`}
          aria-label={`Go to hero slide ${index + 1}`}
        />
      ))}
    </div>
  );
};
import type { Database } from "@/integrations/supabase/types";
import { BookViewingDialog } from "@/components/leads/BookViewingDialog";
import { portalStudiosUrl } from "@/config";

// Import amenity images
import amenityCinema from "@/assets/amenity-cinema.jpg";
import amenityGym from "@/assets/amenity-gym.jpg";
import amenityGames from "@/assets/amenity-game-room.jpg";
import amenityStudy from "@/assets/amenity-study.jpg";
import amenitySocial from "@/assets/hero-city-view.jpg";
import amenityKitchen from "@/assets/studio-5.jpg";
import amenityOutdoor from "@/assets/studio-6.jpg";

// Import lifestyle built-in images
import lifestyleChillSpot from "@/Homepage/lifestyle built in/Chill Spot.webp";
import lifestyleChillZone from "@/Homepage/lifestyle built in/Chill Zone.webp";
import lifestyleEquippedGym from "@/Homepage/lifestyle built in/Equipped Gym.webp";
import lifestyleGameRoom2 from "@/Homepage/lifestyle built in/Game Room 2.webp";
import lifestyleGameRoom from "@/Homepage/lifestyle built in/Game Room.webp";
import lifestyleStudentLounge from "@/Homepage/lifestyle built in/Student Lounge.webp";
import lifestyleExteriorSide from "@/Homepage/lifestyle built in/Urbah Hub Exterior Side Shot.webp";
import lifestyleAerial from "@/Homepage/lifestyle built in/Urban Hub Aerial Shot.webp";

type AcademicYearRow = Database["public"]["Tables"]["academic_years"]["Row"];

type StudioGradeSummary = {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  gallery: { url: string }[];
  weeklyPrice: number | null;
};

const AmenitiesDots = () => {
  const { api } = useCarousel();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);

  useEffect(() => {
    if (!api) return;

    const updateScrollSnaps = () => {
      setScrollSnaps(api.scrollSnapList());
    };

    const updateSelectedIndex = () => {
      setSelectedIndex(api.selectedScrollSnap());
    };

    updateScrollSnaps();
    updateSelectedIndex();

    api.on("reInit", updateScrollSnaps);
    api.on("reInit", updateSelectedIndex);
    api.on("select", updateSelectedIndex);

    return () => {
      api.off("reInit", updateScrollSnaps);
      api.off("reInit", updateSelectedIndex);
      api.off("select", updateSelectedIndex);
    };
  }, [api]);

  if (scrollSnaps.length <= 1) return null;

  // Limit to 4 dots maximum, but allow navigation to all items
  const maxDots = 4;
  const totalItems = scrollSnaps.length;
  const dotsToShow = Math.min(maxDots, totalItems);
  
  // Calculate which items to show dots for (evenly distributed)
  const getDotIndex = (dotPosition: number) => {
    if (totalItems <= maxDots) {
      return dotPosition;
    }
    // Distribute dots evenly across all items
    return Math.floor((dotPosition / (dotsToShow - 1)) * (totalItems - 1));
  };

  // Determine which dot should be active based on current index
  const getActiveDot = () => {
    if (totalItems <= maxDots) {
      return selectedIndex;
    }
    // Find which section the current index falls into
    for (let i = 0; i < dotsToShow; i++) {
      const sectionStart = getDotIndex(i);
      const sectionEnd = i === dotsToShow - 1 ? totalItems - 1 : getDotIndex(i + 1);
      if (selectedIndex >= sectionStart && selectedIndex <= sectionEnd) {
        return i;
      }
    }
    return dotsToShow - 1;
  };

  const activeDot = getActiveDot();

  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: dotsToShow }).map((_, dotPosition) => {
        const targetIndex = getDotIndex(dotPosition);
        
        return (
          <button
            key={dotPosition}
            type="button"
            onClick={() => api?.scrollTo(targetIndex)}
            className={`h-1.5 rounded-full transition-all ${
              activeDot === dotPosition
                ? "w-10 bg-[#ff2020]"
                : "w-3 bg-black/20 hover:bg-black/40"
            }`}
            aria-label={`Go to slide ${targetIndex + 1}`}
          />
        );
      })}
    </div>
  );
};

const TestimonialCard = ({ testimonial }: { testimonial: any }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isMobile = useIsMobile();

  // Check if video is YouTube or Vimeo
  const isYouTube = testimonial.videoUrl?.includes('youtube.com') || testimonial.videoUrl?.includes('youtu.be');
  const isVimeo = testimonial.videoUrl?.includes('vimeo.com');

  // Extract video IDs and create embed URLs
  const getEmbedUrl = () => {
    if (isYouTube) {
      const youtubeId = testimonial.videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
      if (youtubeId) {
        return `https://www.youtube.com/embed/${youtubeId}?autoplay=${isPlaying ? 1 : 0}&mute=${isMuted ? 1 : 0}&loop=1&playlist=${youtubeId}&controls=0&modestbranding=1&rel=0`;
      }
    }
    if (isVimeo) {
      const vimeoId = testimonial.videoUrl.match(/vimeo\.com\/(\d+)/)?.[1];
      if (vimeoId) {
        return `https://player.vimeo.com/video/${vimeoId}?autoplay=${isPlaying ? 1 : 0}&muted=${isMuted ? 1 : 0}&loop=1&controls=0&background=1`;
      }
    }
    return null;
  };

  const embedUrl = getEmbedUrl();

  const handlePlay = () => {
    if (embedUrl) {
      setIsPlaying(true);
    } else if (videoRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handlePause = () => {
    if (embedUrl) {
      setIsPlaying(false);
    } else if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) handlePause();
    else handlePlay();
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (embedUrl) {
      setIsMuted(!isMuted);
      // Force iframe reload with new mute parameter
      setIsPlaying(false);
      setTimeout(() => setIsPlaying(true), 100);
    } else if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  return (
    <div 
      className="relative overflow-hidden rounded-[32px] h-[550px] group bg-black shadow-2xl"
      onMouseEnter={() => !isMobile && handlePlay()}
      onMouseLeave={() => !isMobile && handlePause()}
      onClick={() => isMobile && togglePlay({ stopPropagation: () => {} } as any)}
    >
      {embedUrl ? (
        <div className="absolute inset-0 w-full h-full overflow-hidden">
          <iframe
            src={embedUrl}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            allow="autoplay; encrypted-media"
            allowFullScreen
            style={{ 
              pointerEvents: 'none',
              width: '177.77777778vh',
              height: '56.25vw',
              minWidth: '100%',
              minHeight: '100%',
              border: 'none'
            }}
          />
        </div>
      ) : (
        <video
          ref={videoRef}
          src={testimonial.videoUrl}
          poster={testimonial.thumbnail}
          loop
          muted={isMuted}
          playsInline
          className={`h-full w-full object-cover transition-all duration-700 ${isPlaying ? 'grayscale-0' : 'grayscale'}`}
        />
      )}
      
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10" />

      {/* Play Button Icon in Center */}
      <div className={`absolute inset-0 flex items-center justify-center z-20 transition-opacity duration-300 ${isPlaying ? 'opacity-0' : 'opacity-100'}`}>
        <div className="h-16 w-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
          <Play className="h-6 w-6 text-white fill-white" />
        </div>
      </div>

      {/* Mute/Unmute Toggle */}
      {isPlaying && (
        <button
          onClick={toggleMute}
          className="absolute top-6 right-6 z-30 h-10 w-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10 hover:bg-black/60 transition-all"
        >
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      )}

      {/* Text Info */}
      <div className="absolute bottom-10 left-10 right-10 z-20 space-y-1">
        <p className="text-white font-display text-2xl font-black uppercase tracking-wide">
          {testimonial.name}
        </p>
        <p className="text-white/70 text-sm font-medium">
          {testimonial.result}
        </p>
      </div>
    </div>
  );
};

type PlanAvailability = { available_count: number; total_capacity: number } | null;

/** Gradient background for the total-value bubble by room grade (each visibly distinct) */
function getBubbleGradient(gradeSlug: string): { background: string } {
  const slug = (gradeSlug || "").toLowerCase();
  const rhodiumGradient = "linear-gradient(135deg, #5c5f66 0%, #3a3d44 100%)"; // gunmetal – shared rhodium & rhodium-plus
  const gradients: Record<string, string> = {
    silver: "linear-gradient(135deg, #9ca0a8 0%, #6b6f76 100%)", // neutral silver grey
    gold: "linear-gradient(135deg, #d4a84b 0%, #b8860b 100%)",
    platinum: "linear-gradient(135deg, #6e8fa8 0%, #4d6d86 100%)", // steel blue-grey – clearly platinum
    rhodium: rhodiumGradient,
    "rhodium-plus": rhodiumGradient,
  };
  const background = gradients[slug] ?? "linear-gradient(135deg, #ff2020 0%, #cc1919 100%)";
  return { background };
}

const PricingCard = ({ plan, contractLength, availability }: { plan: any; contractLength: "45" | "51"; availability?: PlanAvailability }) => {
  const [showMore, setShowMore] = useState(false);
  const sortedFeatures = [...plan.features].sort((a: any, b: any) => {
    if (a.included === b.included) return 0;
    return a.included ? 1 : -1; // false comes first
  });
  
  const displayedFeatures = showMore ? sortedFeatures : sortedFeatures.slice(0, 8);

  const total = availability?.total_capacity ?? 0;
  const available = availability?.available_count ?? 0;
  const remainingPercent = total > 0 ? Math.round((available / total) * 100) : 0;

  const price45 = typeof plan.price45 === "number" ? plan.price45 : 0;
  const price51 = typeof plan.price51 === "number" ? plan.price51 : 0;
  const totalAmount = contractLength === "45" ? price45 * 45 : price51 * 51;

  const bubbleGradient = getBubbleGradient(plan.id ?? "");

  return (
    <div className="bg-[#111] rounded-[40px] p-10 shadow-2xl flex flex-col relative border border-white/5 group hover:bg-[#161616] transition-all duration-500 min-h-[600px]">
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-[10px] font-bold px-6 py-2.5 rounded-full shadow-xl z-30 whitespace-nowrap border-2 border-black"
        style={bubbleGradient}
      >
        £{totalAmount.toLocaleString("en-GB")} total
      </div>
      
      <div className="flex justify-between items-start mb-6">
        <div className="space-y-1">
          <h3 className="text-3xl font-display font-black uppercase text-white tracking-wide leading-[1.1]">
            {plan.name.split(' ').map((word: string, i: number) => (
              <React.Fragment key={i}>
                {word}
                {i === 0 && <br/>}
              </React.Fragment>
            ))}
          </h3>
        </div>
        <div className="text-right">
          <span className="text-2xl font-black text-white">
            £{Number(contractLength === "45" ? plan.price45 : plan.price51).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
          <span className="text-[10px] text-white/40 block uppercase font-bold tracking-widest mt-[-2px]">
            per week
          </span>
        </div>
      </div>

      <p className="text-white/60 text-[13px] font-medium leading-relaxed mb-8 h-12 overflow-hidden line-clamp-2">
        {plan.description}
      </p>

      <Button 
        disabled={!plan.isBookable}
        className="relative w-full rounded-2xl py-6 font-black uppercase tracking-[0.2em] text-sm mb-10 transition-all duration-500 transform hover:scale-[1.05] active:scale-[0.95] overflow-hidden border-none text-white shadow-[0_15px_35px_rgba(255,32,32,0.35)] hover:shadow-[0_20px_45px_rgba(255,32,32,0.45)] disabled:shadow-none disabled:grayscale disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-white/20"
        style={{
          backgroundColor: plan.isBookable && total > 0 ? "transparent" : plan.isBookable ? "#ff2020" : undefined,
          color: plan.isBookable ? undefined : "rgba(255,255,255,0.2)",
        }}
      >
        {plan.isBookable && total > 0 ? (
          <>
            <span
              className="absolute inset-0 rounded-2xl transition-all"
              style={{
                background: `linear-gradient(to right, #ff2020 ${remainingPercent}%, rgba(255,255,255,0.08) ${remainingPercent}%)`,
              }}
              aria-hidden
            />
            <span className="relative z-10">{plan.isBookable ? "Book Now" : "Fully Booked"}</span>
          </>
        ) : (
          <span className="relative z-10">{plan.isBookable ? "Book Now" : "Fully Booked"}</span>
        )}
      </Button>

      <div className="space-y-2.5 mb-6">
        {displayedFeatures.map((feature: any, fIdx: number) => (
          <div key={fIdx} className={`flex items-start gap-3 transition-opacity duration-300 ${feature.included ? 'opacity-100' : 'opacity-100'}`}>
            <div className={`mt-0.5 h-4 w-4 rounded-full flex items-center justify-center flex-shrink-0 ${feature.included ? 'bg-emerald-500' : 'bg-red-500'}`}>
              {feature.included ? (
                <Check className="h-2.5 w-2.5 text-white" />
              ) : (
                <X className="h-2.5 w-2.5 text-white" />
              )}
            </div>
            <span className={`text-[12px] font-medium leading-tight ${feature.included ? 'text-white/80' : 'text-white/40 line-through'}`}>
              {feature.text}
            </span>
          </div>
        ))}
      </div>

      {sortedFeatures.length > 8 && (
        <button 
          onClick={() => setShowMore(!showMore)}
          className="text-[#ff2020] text-xs font-bold uppercase tracking-widest mt-auto hover:underline flex items-center gap-2 transition-all"
        >
          {showMore ? 'See Less' : `+ ${sortedFeatures.length - 8} More Features`}
        </button>
      )}
    </div>
  );
};

type GradePricesBySlug = Record<string, { price45: number; price51: number }>;

const StudiosHome = () => {
  const { year } = useParams<{ year?: string }>();
  const navigate = useNavigate();
  const [grades, setGrades] = useState<StudioGradeSummary[]>([]);
  const [gradePricesBySlug, setGradePricesBySlug] = useState<GradePricesBySlug>({});
  const [academicYears, setAcademicYears] = useState<AcademicYearRow[]>([]);
  const [selectedYear, setSelectedYear] = useState<AcademicYearRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingDialogOpen, setViewingDialogOpen] = useState(false);
  const [showAllFeatures, setShowAllFeatures] = useState(false);
  const [contractLength, setContractLength] = useState<"45" | "51">("45");
  const brandingHero = useBrandingSetting("studio_catalog_hero_image");
  const { data: imageSlots } = useWebsiteImageSlots();
  const hero1 = getSlotUrl(imageSlots?.find((s) => s.slot_key === "hero_studios_1")) || brandingHero || "https://urbanhub.uk/wp-content/uploads/2025/05/URBAN-HUB-OUTSIDE-A-3-of-1-scaled-1.webp";
  const hero2 = getSlotUrl(imageSlots?.find((s) => s.slot_key === "hero_studios_2")) || amenitySocial;
  const hero3 = getSlotUrl(imageSlots?.find((s) => s.slot_key === "hero_studios_3")) || amenityStudy;
  const { data: brandingSettings } = useBrandingSettings();
  const companyName = brandingSettings?.company_name || "StudentStaySolutions";
  const { data: dbAmenities } = useWebsiteAmenities();
  const { data: dbWhyUsCards } = useWhyUsCards();

  const amenitiesFallback = [
    { title: "Chill Spot", image: lifestyleChillSpot },
    { title: "Chill Zone", image: lifestyleChillZone },
    { title: "Equipped Gym", image: lifestyleEquippedGym },
    { title: "Game Room", image: lifestyleGameRoom },
    { title: "Game Room 2", image: lifestyleGameRoom2 },
    { title: "Student Lounge", image: lifestyleStudentLounge },
    { title: "Exterior Side Shot", image: lifestyleExteriorSide },
    { title: "Aerial Shot", image: lifestyleAerial },
  ];

  const amenities = (dbAmenities?.length
    ? dbAmenities.map((a) => ({
        title: a.title,
        image: a.vertical_image_url || "/placeholder.svg",
      }))
    : amenitiesFallback) as { title: string; image: string }[];

  const featuresFallback = [
    {
      title: "Preston's Most Advanced Student Hub",
      description: "The biggest, boldest upgrade to student life in the city.",
      icon: <Building2 className="h-10 w-10" />,
    },
    {
      title: "Your Own City Apartment",
      description: "Live independently while surrounded by like-minded people and lifestyle-driven spaces.",
      icon: <Home className="h-10 w-10" />,
    },
    {
      title: "Tesco Express Right Downstairs",
      description: "Everyday essentials just seconds away convenience at your doorstep.",
      icon: <ShoppingBag className="h-10 w-10" />,
    },
    {
      title: "All-in-one Living with 10+ Lifestyle Zones",
      description: "Gym, cinema, rooftop terrace, chill lounges, study zones all under one roof.",
      icon: <LayoutGrid className="h-10 w-10" />,
    },
    {
      title: "Exclusive Rooftop Terrace For Residents Only",
      description: "The only student property in Preston with private rooftop access and skyline views.",
      icon: <Sun className="h-10 w-10" />,
    },
    {
      title: "Trusted by 400+ Students Every Year",
      description: "The go-to choice for students who want more than just a place to sleep.",
      icon: <Users className="h-10 w-10" />,
    },
    {
      title: "Designed with a Modern Touch",
      description: "Every space features sleek, high-quality furnishings and contemporary design.",
      icon: <Sparkles className="h-10 w-10" />,
    },
    {
      title: "Fitness-Focused Living",
      description: "Train just steps from your room wellness and motivation built in.",
      icon: <Dumbbell className="h-10 w-10" />,
    },
  ];

  const features = (dbWhyUsCards?.length
    ? dbWhyUsCards.map((c) => ({
        title: c.title,
        description: c.description,
        icon: c.icon_url ? (
          <img src={c.icon_url} alt={`${c.title} icon`} className="h-10 w-10 object-contain" />
        ) : (
          <Sparkles className="h-10 w-10" />
        ),
      }))
    : featuresFallback) as { title: string; description: string; icon: React.ReactNode }[];

  const testimonials = [
    {
      id: "t1",
      name: "Student Testimonial",
      result: "Real Experience at Urban Hub",
      videoUrl: "https://youtu.be/iUbbllhqE2I",
      thumbnail: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=800",
    },
    {
      id: "t2",
      name: "Student Testimonial",
      result: "Life at Urban Hub",
      videoUrl: "https://youtu.be/iUbbllhqE2I",
      thumbnail: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=800",
    },
    {
      id: "t3",
      name: "Student Testimonial",
      result: "Student Living Experience",
      videoUrl: "https://youtu.be/iUbbllhqE2I",
      thumbnail: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=800",
    },
  ];

  const pricingPlans = [
    {
      id: "silver",
      name: "Silver Studio",
      price45: 165,
      price51: 159,
      size: "20",
      description: "All Utility Bills Included, No Hidden Charges",
      features: [
        { text: <><span className="font-bold text-white">20 Sqm.</span></>, included: true },
        { text: "Private Apartment", included: true },
        { text: "3/4 Double Bed", included: true },
        { text: "Kitchenette (Microwave Oven & Stove)", included: true },
        { text: "Ensuite Bathroom with walk-in Shower", included: true },
        { text: "Bed Storage", included: true },
        { text: "Wardrobe", included: true },
        { text: "Study Desk & Chair", included: true },
        { text: "Unlimited Amenities Access", included: true },
        { text: "Extra Wardrobe Space", included: false },
        { text: "Extra Storage Space", included: false },
        { text: "Extra Living Space", included: false },
        { text: "Dining Table for 4", included: false }
      ],
      isBookable: true
    },
    {
      id: "gold",
      name: "Gold Studio",
      price45: 179,
      price51: 172,
      size: "23",
      description: "All Utility Bills Included, No Hidden Charges",
      features: [
        { text: <><span className="font-bold text-white">23 Sqm.</span></>, included: true },
        { text: "Private Apartment", included: true },
        { text: "3/4 Double Bed", included: true },
        { text: "Kitchenette (Microwave Oven & Stove)", included: true },
        { text: "Ensuite Bathroom with walk-in Shower", included: true },
        { text: "Bed Storage", included: true },
        { text: "Wardrobe", included: true },
        { text: "Study Desk & Chair", included: true },
        { text: "Unlimited Amenities Access", included: true },
        { text: "Extra Storage Space", included: false },
        { text: "Extra Wardrobe Space", included: false },
        { text: "Extra Living Space", included: false },
        { text: "Dining Table for 4", included: false }
      ],
      isBookable: true
    },
    {
      id: "platinum",
      name: "Platinum Studio",
      price45: 205,
      price51: 198,
      size: "26",
      description: "All Utility Bills Included, No Hidden Charges",
      features: [
        { text: <><span className="font-bold text-white">26 Sqm.</span></>, included: true },
        { text: "Private Apartment", included: true },
        { text: "3/4 Double Bed", included: true },
        { text: "Kitchenette (Microwave Oven & Stove)", included: true },
        { text: "Ensuite Bathroom with walk-in Shower", included: true },
        { text: "Bed Storage", included: true },
        { text: "Wardrobe", included: true },
        { text: "Study Desk & Chair", included: true },
        { text: "Unlimited Amenities Access", included: true },
        { text: "Extra Storage Space", included: false },
        { text: "Extra Wardrobe Space", included: false },
        { text: "Extra Living Space", included: false },
        { text: "Dining Table for 4", included: false }
      ],
      isBookable: false
    },
    {
      id: "rhodium",
      name: "Rhodium Studio",
      price45: 231,
      price51: 224,
      size: "30",
      description: "All Utility Bills Included, No Hidden Charges",
      features: [
        { text: <><span className="font-bold text-white">30 Sqm.</span></>, included: true },
        { text: "Private Apartment", included: true },
        { text: "Double Bed", included: true },
        { text: "Kitchenette (Microwave Oven & Stove)", included: true },
        { text: "Ensuite Bathroom with walk-in Shower", included: true },
        { text: "Bed Storage", included: true },
        { text: "Extra Storage Space", included: true },
        { text: "Wardrobe", included: true },
        { text: "Extra Wardrobe Space", included: true },
        { text: "Unlimited Amenities Access", included: true },
        { text: "Study Desk & Chair", included: true },
        { text: "Extra Living Space", included: false },
        { text: "Dining Table for 4", included: false }
      ],
      isBookable: false
    },
    {
      id: "rhodium-plus",
      name: "Rhodium Plus Studio",
      price45: 247,
      price51: 239,
      size: "42",
      description: "All Utility Bills Included, No Hidden Charges",
      features: [
        { text: <><span className="font-bold text-white">42 Sqm.</span></>, included: true },
        { text: "Private Apartment", included: true },
        { text: "Double Bed", included: true },
        { text: "Kitchenette (Microwave Oven & Stove)", included: true },
        { text: "Ensuite Bathroom with walk-in Shower", included: true },
        { text: "Bed Storage", included: true },
        { text: "Bed Storage", included: true }, // As per image reference duplication or specific point
        { text: "Extra Storage Space", included: true },
        { text: "Extra Wardrobe Space", included: true },
        { text: "Extra Living Space", included: true },
        { text: "Dining Table for 4", included: true },
        { text: "Study Desk & Chair", included: true },
        { text: "Unlimited Amenities Access", included: true }
      ],
      isBookable: false
    }
  ];

  // Get availability for selected academic year (from portal – same as room grade section)
  const { data: availabilityData, isLoading: availabilityLoading } = useAllStudioAvailability(
    selectedYear?.id || undefined
  );

  // Merge static pricing plans with portal availability + default academic year prices
  const pricingPlansWithAvailability = useMemo(() => {
    return pricingPlans.map((plan) => {
      const avail = availabilityData?.find((a) => a.studio_grade_slug === plan.id) ?? null;
      const isBookable = avail ? avail.available_count > 0 : plan.isBookable;
      const prices = gradePricesBySlug[plan.id];
      return {
        ...plan,
        price45: prices ? prices.price45 : plan.price45,
        price51: prices ? prices.price51 : plan.price51,
        isBookable,
        availability: avail
          ? { available_count: avail.available_count, total_capacity: avail.total_capacity }
          : null,
      };
    });
  }, [pricingPlans, availabilityData, gradePricesBySlug]);

  // Load academic years and determine selected year
  useEffect(() => {
    let mounted = true;

    const loadAcademicYears = async () => {
      const { data, error: fetchError } = await supabase
        .from("academic_years")
        .select("*")
        .eq("is_active", true)
        .order("start_date", { ascending: false });

      if (!mounted) return;

      if (fetchError) {
        console.error("Unable to load academic years:", fetchError);
        return;
      }

      const years = data || [];
      setAcademicYears(years);

      // Determine selected year
      let selected: AcademicYearRow | null = null;

      if (year) {
        // Try to find by name (format: "2025-2026" or "2025/2026")
        const normalizedYear = year.replace(/-/g, "/");
        selected = years.find(
          (y) => y.name === normalizedYear || y.name === year
        ) || null;
      }

      // If no year in URL or year not found, default to most recent future year
      if (!selected) {
        const now = new Date();
        selected =
          years.find((y) => new Date(y.start_date) > now) || years[0] || null;
      }

      setSelectedYear(selected);

      // If year param doesn't match selected, update URL
      if (selected && year !== selected.name.replace(/\//g, "-")) {
        const urlYear = selected.name.replace(/\//g, "-");
        navigate(`/studios/${urlYear}`, { replace: true });
      } else if (!selected && year) {
        // Invalid year, redirect to default
        navigate("/studios", { replace: true });
      }
    };

    loadAcademicYears();

    return () => {
      mounted = false;
    };
  }, [year, navigate]);

  // Load studio grades filtered by selected academic year
  useEffect(() => {
    if (!selectedYear) return;

    let mounted = true;

    const loadGrades = async () => {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from("studio_grades")
        .select(
          `
            id,
            name,
            slug,
            short_description,
            studio_grade_media (
              url,
              is_hero,
              position
            ),
            studio_grade_prices!inner (
              weekly_price,
              academic_year:academic_years!inner (
                id,
                name
              )
            )
          `,
        )
        .eq("is_active", true)
        .eq("studio_grade_prices.academic_year_id", selectedYear.id)
        .eq("studio_grade_prices.is_active", true)
        .order("display_order", { ascending: true });

      if (!mounted) return;

      if (fetchError) {
        console.error("Unable to load studio grades:", fetchError);
        setError("We couldn't load the studio catalogue just now. Please try again shortly.");
        setGrades([]);
        setLoading(false);
        return;
      }

      const priceMap: GradePricesBySlug = {};
      const summaries =
        data?.map((grade) => {
          const gallery =
            grade.studio_grade_media
              ?.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
              .map((item) => ({ url: item.url }))
              .filter((item) => Boolean(item.url)) ?? [];

          const sortedPrices =
            grade.studio_grade_prices
              ?.filter((price) => typeof price.weekly_price === "number")
              .sort(
                (a, b) =>
                  (a.weekly_price ?? Number.POSITIVE_INFINITY) -
                  (b.weekly_price ?? Number.POSITIVE_INFINITY),
              ) ?? [];
          const primaryPrice = sortedPrices[0];
          const price51 = primaryPrice?.weekly_price ?? 0;
          const price45 = sortedPrices[1]?.weekly_price ?? price51;
          if (grade.slug && (price45 > 0 || price51 > 0)) {
            priceMap[grade.slug] = { price45, price51 };
          }

          return {
            id: grade.id,
            name: grade.name,
            slug: grade.slug,
            short_description: grade.short_description,
            gallery,
            weeklyPrice: primaryPrice?.weekly_price ?? null,
          };
        }) ?? [];

      setGrades(summaries);
      setGradePricesBySlug(priceMap);
      setError(null);
      setLoading(false);
    };

    loadGrades();

    return () => {
      mounted = false;
    };
  }, [selectedYear]);

  const handleYearChange = (yearName: string) => {
    const urlYear = yearName.replace(/\//g, "-");
    navigate(`/studios/${urlYear}`);
  };

  const formatYearForDisplay = (yearName: string) => {
    // Keep full year format "2025/2026" for display
    return yearName;
  };

  const formatYearForHero = (yearName: string) => {
    // Convert "2025/2026" to "25/26" for hero text
    // Extract last 2 digits of first year, then last 2 digits of second year
    return yearName.replace(/\d{2}(\d{2})\/\d{2}(\d{2})/, "$1/$2");
  };

  if (loading || !selectedYear) {
    return null; // Preloader handles loading state
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <section aria-label="Urban Hub Preston student accommodation hero carousel" className="relative">
        <Carousel opts={{ loop: true }} className="w-full">
          <CarouselContent className="-ml-0">
            {[hero1, hero2, hero3].map((bg, idx) => (
              <CarouselItem key={`hero-${idx}`} className="pl-0">
                <div
                  className={`relative flex items-center ${idx === 1 ? "justify-start" : "justify-center"}`}
                  style={{
                    minHeight: "100vh",
                    backgroundImage: `linear-gradient(180deg, rgba(5, 6, 9, 0.7) 0%, rgba(5, 6, 9, 0.35) 65%, rgba(5, 6, 9, 0.7) 100%), url('${bg}')`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                >
                  {idx === 1 ? (
                    <div className="container mx-auto px-4 text-white py-20 md:py-24">
                      <div className="px-4 md:px-6 space-y-6 text-left">
                        <AnimatedText delay={0.1}>
                          <p className="text-[11px] uppercase tracking-[0.5em] text-white/70 font-normal">
                            THE MOST EQUIPPED, MOST CONNECTED,
                          </p>
                        </AnimatedText>
                        <AnimatedHeading
                          delay={0.2}
                          className="text-4xl md:text-5xl lg:text-6xl font-display font-black uppercase leading-tight text-left"
                        >
                          Most Community-Driven
                          <br />
                          Student accommodation
                          <br />
                          in preston, Lancashire
                        </AnimatedHeading>

                        {/* Inline booking form (same LeadForm as dialog) */}
                        <div className="mt-8 w-full max-w-[760px] rounded-[28px] bg-black/35 backdrop-blur-md border border-white/10 shadow-2xl p-6 md:p-8">
                          <LeadForm
                            formType="booking"
                            onSuccess={() => {}}
                            onCancel={() => {}}
                            showCancel={false}
                            compact
                            submitLabel="BOOK YOUR VIEWING"
                            className="[&_*]:text-white [&_input]:bg-white/0 [&_input]:text-white [&_input]:placeholder:text-white/55 [&_input]:border-white/35 [&_textarea]:bg-white/0 [&_textarea]:text-white [&_textarea]:placeholder:text-white/55 [&_textarea]:border-white/35 [&_[data-slot=select-trigger]]:bg-white/0 [&_[data-slot=select-trigger]]:text-white [&_[data-slot=select-trigger]]:border-white/35 [&_[data-slot=select-trigger]]:placeholder:text-white [&_[data-slot=select-trigger]>span]:!text-white [&_input[type=tel]]:bg-white/0 [&_input[type=tel]]:text-white [&_input[type=tel]]:placeholder:text-white/55 [&_input[type=tel]]:border-white/35"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="container mx-auto max-w-4xl px-4 text-center text-white space-y-6 py-24">
                      <AnimatedText delay={0.1}>
                        <p className="text-[11px] uppercase tracking-[0.5em] text-white/70">
                          Book {formatYearForHero(selectedYear.name)} Academic Year
                        </p>
                      </AnimatedText>
                      <TypingTitle
                        as="h1"
                        text={`Secure your Student Accommodation at ${companyName} for £99`}
                        className="text-4xl md:text-5xl lg:text-6xl font-display font-black uppercase leading-tight"
                        typingSpeed={30}
                      />
                      <AnimatedText delay={0.4}>
                        <Button
                          onClick={() => setViewingDialogOpen(true)}
                          className="rounded-full bg-[#ff2020] hover:bg-[#ff4040] px-8 py-3 text-sm font-semibold uppercase tracking-[0.35em]"
                          data-analytics="studios-hero-viewing"
                        >
                          Book a Viewing
                        </Button>
                      </AnimatedText>
                    </div>
                  )}

                  {/* Flat nav dots inset */}
                  <div className="absolute inset-x-0 bottom-6 z-10 flex justify-center px-4">
                    <div className="pointer-events-auto rounded-full bg-black/35 backdrop-blur-md px-4 py-2">
                      <HeroDots />
                    </div>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </section>
      <main className="container mx-auto px-4 pt-16 pb-20 max-w-6xl space-y-12">
        {/* Academic Year Tabs */}
        {academicYears.length > 0 && (
          <div className="flex justify-center mb-8">
            <Tabs
              value={selectedYear?.name || ""}
              onValueChange={handleYearChange}
              className="w-auto"
            >
              <TabsList className="inline-flex h-12 items-center justify-center rounded-full bg-primary/60 p-1.5 gap-1.5 md:gap-2 shadow-sm">
                {academicYears.map((ay) => (
                  <TabsTrigger
                    key={ay.id}
                    value={ay.name}
                    className="rounded-full uppercase tracking-wide text-xs md:text-sm font-semibold px-4 md:px-6 py-2 md:py-2.5 flex-shrink-0 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md transition-all data-[state=inactive]:bg-transparent data-[state=inactive]:text-white/90 hover:data-[state=inactive]:bg-primary/40"
                  >
                    {formatYearForDisplay(ay.name)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        )}

        <header className="space-y-4 text-center">
          <AnimatedText delay={0.1}>
            <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
              Discover {companyName}
            </p>
          </AnimatedText>
          <TypingTitle
            as="h2"
            text="5 Room Grades to Choose From"
            className="text-4xl md:text-5xl font-display font-black uppercase tracking-wide"
            typingSpeed={32}
          />
          <AnimatedParagraph delay={0.3} className="max-w-3xl mx-auto text-muted-foreground text-sm md:text-base">
            Explore our available studio grades and jump straight into the space that suits you.
            Each option links to a detailed overview with galleries, contracts, and amenities.{" "}
            <Link to="/short-term" className="text-primary hover:underline font-medium">Short-term stays</Link>{" "}
            available too—see our{" "}
            <Link to="/about" className="text-primary hover:underline font-medium">about</Link>{" "}
            and{" "}
            <Link to="/contact" className="text-primary hover:underline font-medium">contact</Link>{" "}
            pages.
          </AnimatedParagraph>
        </header>

        {error ? (
          <div className="rounded-3xl border border-destructive/40 bg-destructive/10 px-6 py-8 text-center text-destructive">
            <p className="text-lg font-semibold uppercase tracking-wide">Studio catalogue unavailable</p>
            <p className="mt-3">{error}</p>
          </div>
        ) : grades.length === 0 ? (
          <div className="rounded-3xl border border-dashed px-6 py-8 text-center">
            <p className="text-lg font-semibold uppercase tracking-wide">Studios coming soon</p>
            <p className="mt-3 text-muted-foreground">
              We're preparing the new catalogue for {selectedYear.name}. Check back shortly for the latest availability.
            </p>
          </div>
        ) : (
          <section className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            {grades.map((grade) => {
              // Get availability for this grade for the selected academic year
              const gradeAvailability = availabilityLoading
                ? null
                : availabilityData?.find((avail) => avail.studio_grade_id === grade.id) || null;

              const availabilityTag = availabilityLoading ? null : getAvailabilityTag(gradeAvailability);
              const fullyBooked = availabilityLoading ? false : isFullyBooked(gradeAvailability);

              return (
                <AnimatedCard key={grade.id} delay={0.1} index={grades.findIndex(g => g.id === grade.id)}>
                  <article
                    className="group flex h-full flex-col overflow-hidden rounded-[28px] border border-border/40 bg-background shadow-[0_18px_40px_rgba(0,0,0,0.08)] transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(0,0,0,0.12)]"
                  >
                  <div className="relative h-48 w-full overflow-hidden bg-muted/30 group/carousel">
                    {grade.gallery.length ? (
                      <Carousel
                        className="h-full w-full"
                        opts={{ loop: true }}
                      >
                        <CarouselContent className="-ml-0">
                          {grade.gallery.map((image, idx) => (
                            <CarouselItem key={`${grade.id}-${idx}`} className="pl-0">
                              <img
                                src={image.url}
                                alt={`${grade.name} ${idx + 1}`}
                                className="h-48 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                loading="lazy"
                              />
                            </CarouselItem>
                          ))}
                        </CarouselContent>
                        {grade.gallery.length > 1 && (
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover/carousel:opacity-100 transition-opacity">
                            <CarouselDots className="bg-black/50 backdrop-blur-sm rounded-full px-2 py-1" />
                          </div>
                        )}
                      </Carousel>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.4em] text-muted-foreground">
                        {companyName}
                      </div>
                    )}
                    {availabilityTag && (
                      <span className={`absolute right-4 top-4 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] ${availabilityTag.className}`}>
                        {availabilityTag.label}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-4 px-5 pb-5 pt-6">
                    <div>
                      <h2 className="text-2xl md:text-3xl font-display font-black uppercase tracking-wide text-foreground underline decoration-[6px] decoration-accent-yellow underline-offset-4">
                        {grade.name} STUDIO
                      </h2>
                      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                        {grade.short_description ?? "Discover this studio grade, explore availability, and compare contract options tailored for you."}
                      </p>
                      {gradeAvailability && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {gradeAvailability.available_count} of {gradeAvailability.total_capacity} studios available for {formatYearForDisplay(selectedYear.name)}
                        </p>
                      )}
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-4">
                      {fullyBooked ? (
                        <Button
                          disabled
                          className="rounded-full bg-gray-400 px-6 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-white cursor-not-allowed"
                        >
                          Fully Booked
                        </Button>
                      ) : (
                        <Button
                          asChild
                          className="rounded-[16px] bg-accent-yellow px-6 py-2 text-sm font-bold uppercase tracking-normal text-black shadow-[0_12px_24px_rgba(255,204,0,0.35)] hover:bg-[#ff2020] hover:text-white transition-colors"
                        >
                          <a
                            href={portalStudiosUrl(year || selectedYear.name.replace(/\//g, "-"), grade.slug)}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-analytics="grade-book-now"
                          >
                            Book Now
                          </a>
                        </Button>
                      )}
                      <div className="text-right">
                        <p className="text-xl font-black uppercase tracking-wide text-foreground">
                          {typeof grade.weeklyPrice === "number" ? `£${grade.weeklyPrice.toLocaleString("en-GB")}` : "£—"}
                        </p>
                        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">
                          Per wk
                        </p>
                      </div>
                    </div>
                  </div>
                  </article>
                </AnimatedCard>
              );
            })}
          </section>
        )}
      </main>

      {/* Amenities Carousel Section */}
      <section className="bg-[#f8f9fa] py-24 overflow-hidden relative">
        <div className="container mx-auto px-4 mb-16">
          <div className="flex justify-center">
            <TypingTitle
              as="h2"
              text={"MORE COMFORT, MORE COMMUNITY\nAND MORE LIFESTYLE BUILT IN"}
              className="text-3xl md:text-5xl font-display font-black uppercase leading-[1.1] tracking-tight text-black whitespace-pre-line text-center"
              typingSpeed={22}
            />
          </div>
        </div>
        
        {/* Edge Fade / Gradient Mask + wide side padding */}
        <div className="relative w-full px-6 md:px-10 lg:px-[100px]">
          {/* Stronger gradient mask on the carousel edges - positioned to fade the images */}
          <div 
            className="absolute inset-y-0 left-0 w-24 md:w-40 lg:w-[100px] z-30 pointer-events-none" 
            style={{ 
              background: 'linear-gradient(to right, #f8f9fa 0%, #f8f9fa 60%, rgba(248, 249, 250, 0.8) 80%, rgba(248, 249, 250, 0) 100%)' 
            }} 
          />
          <div 
            className="absolute inset-y-0 right-0 w-24 md:w-40 lg:w-[100px] z-30 pointer-events-none" 
            style={{ 
              background: 'linear-gradient(to left, #f8f9fa 0%, #f8f9fa 60%, rgba(248, 249, 250, 0.8) 80%, rgba(248, 249, 250, 0) 100%)' 
            }} 
          />
          
          <div className="relative overflow-hidden">
            <Carousel
              opts={{
                align: "start",
                loop: true,
                dragFree: true,
              }}
              plugins={[
                AutoScroll({
                  speed: 1.2,
                  stopOnInteraction: false,
                  stopOnMouseEnter: true,
                })
              ]}
              className="w-full relative z-10"
            >
            <CarouselContent className="-ml-4 px-0">
              {/* Duplicate amenities to ensure a perfect continuous loop */}
              {[...amenities, ...amenities].map((amenity, index) => (
                <CarouselItem
                  key={index}
                  className="pl-4 basis-1/2 md:basis-1/3 lg:basis-1/4"
                >
                  <div className="relative overflow-hidden rounded-2xl aspect-[3/4] group transition-all duration-500 shadow-xl bg-muted">
                    <img
                      src={amenity.image}
                      alt={amenity.title}
                      className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-110"
                      loading="lazy"
                    />
                    {/* Gradient overlay and title only show on hover */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent flex flex-col justify-end p-10 opacity-0 group-hover:opacity-100 transition-all duration-700 ease-in-out">
                      <h3 className="text-white text-3xl md:text-4xl font-display font-black uppercase tracking-wide leading-none transform translate-y-8 group-hover:translate-y-0 transition-all duration-700 delay-75">
                        {amenity.title}
                      </h3>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            
            <div className="flex justify-center mt-12 relative z-30">
              <AmenitiesDots />
            </div>
          </Carousel>
          </div>
        </div>
      </section>

      {/* Why Choose Us Section - Features Grid */}
      <section className="bg-black py-24 md:py-32">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
            {/* Left Content */}
            <div className="lg:col-span-5 space-y-8">
              <div className="space-y-4">
                <h2 className="text-4xl md:text-6xl font-display font-black uppercase text-white leading-none tracking-tight">
                  <TypingTitle
                    as="span"
                    text="Why Choose"
                    className="text-4xl md:text-6xl font-display font-black uppercase text-white leading-none tracking-tight"
                    typingSpeed={30}
                  />
                  <br />
                  <span className="text-[#ff2020]">{companyName}?</span>
                </h2>
                <AnimatedParagraph delay={0.2} className="text-white/60 text-base md:text-lg max-w-md leading-relaxed">
                  More than just a place to stay. Discover the unique features and premium amenities that make Urban Hub the ultimate student living experience in Preston.
                </AnimatedParagraph>
              </div>
              
              <div className="hidden lg:block">
                <Button 
                  onClick={() => setShowAllFeatures(!showAllFeatures)}
                  className="rounded-full bg-white/10 hover:bg-white/20 text-white px-10 py-6 text-sm font-semibold uppercase tracking-normal border-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 transition-all"
                >
                  {showAllFeatures ? "See Less" : "Load More"} <ArrowUpRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Right Grid / Carousel */}
            <div className="lg:col-span-7">
              {/* Mobile Carousel */}
              <div className="lg:hidden">
                <Carousel className="w-full">
                  <CarouselContent className="-ml-4">
                    {features.map((feature, idx) => (
                      <CarouselItem key={idx} className="pl-4 basis-full sm:basis-1/2">
                        <div className="bg-[#111] border border-white/5 p-8 rounded-[32px] space-y-6 h-full">
                          <div className="text-white">
                            {feature.icon}
                          </div>
                          <div className="space-y-3">
                            <h3 className="text-xl md:text-2xl font-display font-black uppercase text-white leading-tight">
                              {feature.title}
                            </h3>
                            <p className="text-white/50 text-sm leading-relaxed">
                              {feature.description}
                            </p>
                          </div>
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <div className="flex items-center justify-center gap-4 mt-8">
                    <CarouselPrevious className="static translate-y-0 border-white/10 text-white hover:bg-white/5 bg-transparent" />
                    <CarouselNext className="static translate-y-0 border-white/10 text-white hover:bg-white/5 bg-transparent" />
                  </div>
                </Carousel>
              </div>

              {/* Desktop Grid */}
              <div className="hidden lg:grid grid-cols-2 gap-6">
                {(showAllFeatures ? features : features.slice(0, 4)).map((feature, idx) => (
                  <AnimatedCard 
                    key={idx}
                    delay={0.3 + idx * 0.1}
                    index={idx}
                    className="bg-[#111] border border-white/5 p-8 rounded-[32px] space-y-6 group hover:bg-[#1a1a1a] transition-all duration-300"
                  >
                    <div className="text-white group-hover:scale-110 group-hover:text-[#ff2020] transition-all duration-300">
                      {feature.icon}
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-xl md:text-2xl font-display font-black uppercase text-white leading-tight">
                        {feature.title}
                      </h3>
                      <p className="text-white/50 text-sm leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </AnimatedCard>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="bg-white py-24 md:py-32">
        <div className="container mx-auto px-4">
          <header className="text-center max-w-3xl mx-auto mb-20 space-y-6">
            <h2 className="text-4xl md:text-6xl font-display font-black uppercase tracking-tight leading-none text-black">
              <TypingTitle
                as="span"
                text="Real People,"
                className="text-4xl md:text-6xl font-display font-black uppercase tracking-tight leading-none text-black"
                typingSpeed={30}
              />{" "}
              <span className="font-display font-normal text-[#ff2020]">Real Results.</span>
            </h2>
            <AnimatedParagraph delay={0.2} className="text-black/60 text-base md:text-lg leading-relaxed">
              Join thousands of students who have upgraded their lifestyle <br />and found their perfect home at {companyName}.
            </AnimatedParagraph>
          </header>

          <div className="md:hidden">
            <Carousel className="w-full max-w-sm mx-auto">
              <CarouselContent>
                {testimonials.map((t) => (
                  <CarouselItem key={t.id}>
                    <TestimonialCard testimonial={t} />
                  </CarouselItem>
                ))}
              </CarouselContent>
              <div className="flex items-center justify-center gap-4 mt-8">
                <CarouselPrevious className="static translate-y-0 border-black/10 text-black hover:bg-black/5" />
                <CarouselNext className="static translate-y-0 border-black/10 text-black hover:bg-black/5" />
              </div>
            </Carousel>
          </div>

          <div className="hidden md:grid grid-cols-3 gap-8">
            {testimonials.map((t, index) => (
              <AnimatedCard key={t.id} delay={0.3} index={index}>
                <TestimonialCard testimonial={t} />
              </AnimatedCard>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Comparison Section */}
      <section className="bg-black py-24 md:py-32 relative overflow-hidden">
        <Noise patternAlpha={15} />
        {/* Soft Decorative Clouds/Circles */}
        <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-white/5 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[40%] bg-white/5 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="container mx-auto px-4 relative z-10 text-white">
          <Carousel
            opts={{
              align: "start",
              loop: false,
            }}
            className="w-full"
          >
            <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-16">
              <AnimatedHeading delay={0.1} className="text-4xl md:text-6xl font-display font-black uppercase tracking-tight text-white leading-tight max-w-2xl">
                Choose the plan that <br />works for you
              </AnimatedHeading>
              
              <div className="flex items-center gap-6">
                {/* Carousel Arrows - Desktop only, positioned to the LEFT of the tabs */}
                <div className="hidden lg:flex items-center gap-3">
                  <CarouselPrevious className="static translate-y-0 h-12 w-12 border-white/10 bg-white/5 backdrop-blur-sm text-white hover:bg-[#ff2020] hover:border-[#ff2020] hover:scale-110 transition-all shadow-sm" />
                  <CarouselNext className="static translate-y-0 h-12 w-12 border-white/10 bg-white/5 backdrop-blur-sm text-white hover:bg-[#ff2020] hover:border-[#ff2020] hover:scale-110 transition-all shadow-sm" />
                </div>

                {/* Contract Toggle (Tabs) */}
                <div className="bg-white/5 backdrop-blur-sm p-1.5 rounded-2xl flex items-center shadow-sm">
                  <button 
                    onClick={() => setContractLength("45")}
                    className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${contractLength === "45" ? 'bg-[#ff2020] text-white shadow-md' : 'text-white/60 hover:text-white'}`}
                  >
                    45 Weeks
                  </button>
                  <button 
                    onClick={() => setContractLength("51")}
                    className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${contractLength === "51" ? 'bg-[#ff2020] text-white shadow-md' : 'text-white/60 hover:text-white'}`}
                  >
                    51 Weeks
                    <span className="bg-white text-[#ff2020] text-[10px] px-2 py-0.5 rounded-full font-bold">SAVE</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="relative">
              <CarouselContent className="-ml-6 pt-12 pb-4 items-start">
                {pricingPlansWithAvailability.map((plan, idx) => (
                  <CarouselItem key={idx} className="pl-6 basis-full sm:basis-1/2 lg:basis-1/3 xl:basis-1/4 h-auto">
                    <PricingCard plan={plan} contractLength={contractLength} availability={plan.availability} />
                  </CarouselItem>
                ))}
              </CarouselContent>
              
              {/* Mobile Arrows only */}
              <div className="flex lg:hidden items-center justify-center gap-6 mt-16">
                <CarouselPrevious className="static translate-y-0 h-14 w-14 border-white/10 bg-white/5 backdrop-blur-sm text-white hover:bg-[#ff2020] hover:border-[#ff2020] hover:scale-110 transition-all shadow-md" />
                <CarouselNext className="static translate-y-0 h-14 w-14 border-white/10 bg-white/5 backdrop-blur-sm text-white hover:bg-[#ff2020] hover:border-[#ff2020] hover:scale-110 transition-all shadow-md" />
              </div>
            </div>
          </Carousel>
        </div>
      </section>

      <Footer />
      <BookViewingDialog open={viewingDialogOpen} onOpenChange={setViewingDialogOpen} />
    </div>
  );
};

export default StudiosHome;
