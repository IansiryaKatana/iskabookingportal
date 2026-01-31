import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useBrandingSettings } from "@/hooks/useBranding";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselDots,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import { Volume2, VolumeX, MapPin, ArrowUpRight } from "lucide-react";
import { useAllStudioAvailability, getAvailabilityTag, isFullyBooked } from "@/hooks/useStudioAvailability";
import { useOTAStudios } from "@/hooks/useOTAStudios";
import type { Database } from "@/integrations/supabase/types";
import Noise from "@/components/Noise";
import { portalStudiosUrl } from "@/config";
import { useWebsiteAmenities } from "@/hooks/useWebsiteAmenities";
import { AnimatedHeading, AnimatedText, AnimatedParagraph, AnimatedCard } from "@/components/animations/AnimatedText";
import TypingTitle from "@/components/TypingTitle";

// Import facilities images for About page
import snugAreasImg from "@/About/Facilities/Snug Areas.webp";
import gameRoomImg from "@/About/Facilities/Game Room.webp";
import cafeRetailImg from "@/About/Facilities/Cafe & Retail Units.webp";
import tescoImg from "@/About/Facilities/Tesco.webp";
import rooftopImg from "@/About/Facilities/Roof top.webp";
import cinemaRoomImg from "@/About/Facilities/Cinema Room.webp";
import equippedGymImg from "@/About/Facilities/Equipped Gym.webp";

type AcademicYearRow = Database["public"]["Tables"]["academic_years"]["Row"];

type StudioGradeSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  gallery: Array<{ url: string }>;
  weeklyPrice: number | null;
};

interface StudioCardProps {
  studio: StudioGradeSummary;
  isBooked: boolean;
  availabilityTag: ReturnType<typeof getAvailabilityTag> | null;
  yearForPortal: string;
}

const StudioCard = ({ studio, isBooked, availabilityTag, yearForPortal }: StudioCardProps) => {
  const featuredImage = studio.gallery?.[0]?.url || "/placeholder.svg";

  return (
    <div className="relative overflow-hidden rounded-3xl bg-white shadow-lg group">
      {/* Image Section */}
      <div className="relative h-64 overflow-hidden">
        <img
          src={featuredImage}
          alt={studio.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        
        {/* Arrow Button - Top Right (always shown) */}
        {!isBooked ? (
          <a
            href={portalStudiosUrl(yearForPortal, studio.slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-green-500/90 backdrop-blur-sm flex items-center justify-center text-white border border-white/20 hover:bg-green-500 hover:scale-110 transition-all shadow-md z-20"
            onClick={(e) => e.stopPropagation()}
          >
            <ArrowUpRight className="h-5 w-5" />
          </a>
        ) : (
          <div className="absolute top-4 right-4 h-10 w-10 rounded-full bg-gray-200/80 flex items-center justify-center text-gray-500 border border-gray-300 cursor-not-allowed shadow-md z-20">
            <ArrowUpRight className="h-5 w-5" />
          </div>
        )}

        {/* Booked Stamp - Overlay on image */}
        {isBooked && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-10">
            <div className="bg-red-500 text-white px-6 py-3 rounded-full text-sm font-bold uppercase tracking-wide shadow-xl">
              Booked
            </div>
          </div>
        )}
        
        {/* Frosted Glass Overlay - Bottom */}
        <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md p-6">
          {/* Title */}
          <h3 className="text-2xl font-bold text-gray-900 mb-2">
            Silver studio
          </h3>
          
          {/* Subtitle with Location */}
          <div className="flex items-center gap-2 text-gray-600 mb-4">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Urban Hub Preston</span>
          </div>

          {/* Badge */}
          <div>
            {isBooked ? (
              <span className="inline-block px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-full">
                Booked
              </span>
            ) : availabilityTag ? (
              <span className={`inline-block px-4 py-2 text-sm font-semibold rounded-full ${availabilityTag.className}`}>
                {availabilityTag.label === "Going Fast" ? "Available now Going Fast" : `Available now ${availabilityTag.label}`}
              </span>
            ) : (
              <span className="inline-block px-4 py-2 bg-green-500 text-white text-sm font-semibold rounded-full">
                Available now
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const About = () => {
  const { data: brandingSettings } = useBrandingSettings();
  const isMobile = useIsMobile();
  const companyName = brandingSettings?.company_name || "Urban Hub";

  const formatYearForDisplay = (yearName: string) => {
    // Keep full year format "2025/2026" for display
    return yearName;
  };

  // Video hero state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Auto-play video on mount
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      const handleCanPlay = () => {
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
            })
            .catch((error) => {
              console.log("Autoplay prevented:", error);
              // Autoplay was prevented, user interaction required
            });
        }
      };

      video.addEventListener("loadeddata", handleCanPlay);
      video.addEventListener("canplay", handleCanPlay);

      // Also try to play immediately if video is already loaded
      if (video.readyState >= 2) {
        handleCanPlay();
      }

      return () => {
        video.removeEventListener("loadeddata", handleCanPlay);
        video.removeEventListener("canplay", handleCanPlay);
      };
    }
  }, []);

  // Studio data – same loading pattern as StudiosHome (website homepage): academic year first, then grades with prices for that year
  const [studioGrades, setStudioGrades] = useState<StudioGradeSummary[]>([]);
  const [selectedYear, setSelectedYear] = useState<AcademicYearRow | null>(null);
  const [loading, setLoading] = useState(true);
  const { data: otaStudios, isLoading: otaLoading } = useOTAStudios();

  // 1. Load academic years and set default (most recent active) – same as homepage
  useEffect(() => {
    let mounted = true;
    const loadAcademicYears = async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("*")
        .eq("is_active", true)
        .order("start_date", { ascending: false });

      if (!mounted) return;
      if (error) {
        console.error("Unable to load academic years:", error);
        setLoading(false);
        return;
      }
      const years = (data || []) as AcademicYearRow[];
      const now = new Date();
      const defaultYear = years.find((y) => new Date(y.start_date) > now) ?? years[0] ?? null;
      setSelectedYear(defaultYear);
    };
    loadAcademicYears();
    return () => { mounted = false; };
  }, []);

  // 2. Load studio grades for selected year – same query as StudiosHome (only grades with prices for this year)
  useEffect(() => {
    if (!selectedYear) {
      setLoading(false);
      setStudioGrades([]);
      return;
    }
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
          `
        )
        .eq("is_active", true)
        .eq("studio_grade_prices.academic_year_id", selectedYear.id)
        .eq("studio_grade_prices.is_active", true)
        .order("display_order", { ascending: true });

      if (!mounted) return;
      if (fetchError) {
        console.error("Unable to load studio grades:", fetchError);
        setStudioGrades([]);
        setLoading(false);
        return;
      }
      const summaries: StudioGradeSummary[] = (data || []).map((grade: any) => {
        const gallery =
          (grade.studio_grade_media || [])
            .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
            .map((img: any) => ({ url: img.url }))
            .filter((item: { url: string }) => Boolean(item.url));
        const sortedPrices =
          (grade.studio_grade_prices || [])
            .filter((p: any) => typeof p.weekly_price === "number")
            .sort((a: any, b: any) => (a.weekly_price ?? Infinity) - (b.weekly_price ?? Infinity));
        const primaryPrice = sortedPrices[0];
        return {
          id: grade.id,
          name: grade.name,
          slug: grade.slug,
          description: grade.short_description ?? null,
          short_description: grade.short_description,
          gallery,
          weeklyPrice: primaryPrice?.weekly_price ?? null,
        };
      });
      setStudioGrades(summaries);
      setLoading(false);
    };
    loadGrades();
    return () => { mounted = false; };
  }, [selectedYear]);

  // Get availability data
  const { data: availabilityData, isLoading: availabilityLoading } = useAllStudioAvailability(
    selectedYear?.id
  );

  // Video controls
  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handlePause = () => {
    if (videoRef.current) {
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
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  // SEO meta tags are now handled by MetaTagsUpdater using seo_pages table
  // JSON-LD can be configured via admin SEO management

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Video Hero Section */}
      <section
        aria-label="Urban Hub Preston student accommodation video hero"
        className="relative flex items-center justify-center overflow-hidden"
        style={{ minHeight: "100vh" }}
      >
        <video
          ref={videoRef}
          src="https://urbanhub.uk/wp-content/uploads/2025/04/URBAN-HUB-home-trial.mp4"
          autoPlay
          loop
          muted={isMuted}
          playsInline
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          className="h-full w-full object-cover"
        />

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10" />

        {/* Mute/Unmute Toggle */}
        <button
          onClick={toggleMute}
          className="absolute bottom-6 left-6 md:top-6 md:right-6 md:bottom-auto md:left-auto z-30 h-12 w-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10 hover:bg-black/60 transition-all"
        >
          {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      </section>

      <main>
      {/* Dark Stats Section */}
      <section className="relative bg-black py-16 md:py-24 overflow-hidden">
        <Noise patternAlpha={15} />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
          {/* Top Section: Title and Subtitle */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-12">
            <AnimatedHeading delay={0.1} className="text-4xl md:text-6xl lg:text-7xl font-display font-black uppercase text-white mb-4 md:mb-0 text-left">
              URBAN HUB
            </AnimatedHeading>
            <AnimatedText delay={0.2} className="text-lg md:text-2xl lg:text-3xl font-display font-normal uppercase text-white text-left md:text-left">
              SHORT-TERM &<br />ACADEMIC YEAR STUDENT RENTALS IN PRESTON
            </AnimatedText>
          </div>

          {/* Statistics Row */}
          <div className="flex flex-row items-center justify-between gap-2 md:gap-0 mb-12 pb-8 border-b border-white/20 w-full">
            {/* 425 STUDIOS */}
            <div className="flex flex-row items-center gap-1 md:gap-2 flex-1">
              <span className="text-lg md:text-5xl font-display font-black text-blue-500">425</span>
              <span className="text-lg md:text-5xl font-display font-black text-blue-500 uppercase">STUDIOS</span>
            </div>

            {/* Vertical Separator */}
            <div className="hidden md:block w-px h-16 bg-white/20" />
            <div className="md:hidden w-px h-8 bg-white/20" />

            {/* 6 STOREY */}
            <div className="flex flex-row items-center gap-1 md:gap-2 flex-1 justify-center">
              <span className="text-lg md:text-5xl font-display font-black text-green-500">6</span>
              <span className="text-lg md:text-5xl font-display font-black text-green-500 uppercase">STOREY</span>
            </div>

            {/* Vertical Separator */}
            <div className="hidden md:block w-px h-16 bg-white/20" />
            <div className="md:hidden w-px h-8 bg-white/20" />

            {/* 22,000+ SQ.FT */}
            <div className="flex flex-row items-center gap-1 md:gap-2 flex-1 justify-end">
              <span className="text-lg md:text-5xl font-display font-black text-yellow-500">
                22,000+
              </span>
              <span className="text-lg md:text-5xl font-display font-black text-yellow-500 uppercase">SQ.FT</span>
            </div>
          </div>

          {/* Descriptive Text */}
          <div className="space-y-6 text-white text-sm md:text-lg leading-relaxed">
            <AnimatedParagraph delay={0.3}>
              <strong>The most ideal student accommodation in Preston!</strong>
            </AnimatedParagraph>
            <AnimatedParagraph delay={0.4}>
              Welcome to Urban Hub, your premier destination for{" "}
              <Link to="/studios" className="underline hover:text-accent-yellow transition-colors">
                <strong>studio accommodation preston!</strong>
              </Link>{" "}
              Located in the heart of Preston, we offer modern, fully-furnished studio apartments designed specifically for
              students. Our accommodation provides the perfect blend of comfort, convenience,
              and community, making it the ideal place to call home during your academic journey.
            </AnimatedParagraph>
            <AnimatedParagraph delay={0.5}>
              <strong>Urban Hub isn't just student accommodation in Preston</strong>—it's a
              vibrant community where students can thrive. With state-of-the-art facilities,
              including high-speed internet, modern kitchens, and comfortable living spaces, we
              ensure that every aspect of your stay is designed to support your academic
              success and personal well-being.
            </AnimatedParagraph>
            <AnimatedParagraph delay={0.6}>
              Our prime location puts you within walking distance of the University of Central
              Lancashire (UCLan) and Preston city centre, giving you easy access to everything
              you need. Whether you&apos;re looking for{" "}
              <Link to="/short-term" className="underline hover:text-accent-yellow transition-colors">
                short-term rentals
              </Link>{" "}
              or{" "}
              <Link to="/studios" className="underline hover:text-accent-yellow transition-colors">
                academic year accommodation
              </Link>
              , Urban Hub offers flexible options to suit your needs. Have questions? Check our{" "}
              <Link to="/faq" className="underline hover:text-accent-yellow transition-colors">
                FAQ
              </Link>{" "}
              or{" "}
              <Link to="/contact" className="underline hover:text-accent-yellow transition-colors">
                contact us
              </Link>
              .
            </AnimatedParagraph>
          </div>
        </div>
      </section>

      {/* 5 Room Grades Section – same width as Urban Hub Facilities */}
      <section className="bg-red-50 py-16 md:py-24">
        <div className="container mx-auto px-4 pt-16 pb-20 space-y-12">
          <header className="space-y-4 text-center">
            {/* Mobile: two lines "5 room grades" / "to choose from" */}
            <h2 className="text-4xl md:text-5xl font-display font-black uppercase tracking-wide block md:hidden">
              5 room grades
              <br />
              to choose from
            </h2>
            {/* Desktop: typing title */}
            <div className="hidden md:block">
              <TypingTitle
                as="h2"
                text="5 Room Grades to Choose From"
                className="text-4xl md:text-5xl font-display font-black uppercase tracking-wide"
                typingSpeed={32}
              />
            </div>
            <AnimatedParagraph delay={0.2} className="max-w-3xl mx-auto text-muted-foreground text-sm md:text-base">
              Explore our available studio grades and jump straight into the space that suits you.
            </AnimatedParagraph>
          </header>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-gray-600">Loading studio grades...</p>
            </div>
          ) : studioGrades.length === 0 ? (
            <div className="rounded-3xl border border-dashed px-6 py-8 text-center">
              <p className="text-lg font-semibold uppercase tracking-wide">Studios coming soon</p>
              <p className="mt-3 text-muted-foreground">
                We're preparing the new catalogue. Check back shortly for the latest availability.
              </p>
            </div>
          ) : (
            <Carousel
              className="w-full overflow-hidden"
              opts={{ loop: true, align: "start", containScroll: "trimSnaps", dragFree: false }}
            >
              <CarouselContent className="-ml-4">
                {studioGrades.map((grade) => {
                  const gradeAvailability = availabilityLoading
                    ? null
                    : availabilityData?.find((avail) => avail.studio_grade_id === grade.id) || null;
                  const availabilityTag = availabilityLoading ? null : getAvailabilityTag(gradeAvailability);
                  const fullyBooked = availabilityLoading ? false : isFullyBooked(gradeAvailability);

                  return (
                    <CarouselItem
                      key={grade.id}
                      className="pl-4 basis-full sm:basis-[50%] lg:basis-[calc((100%-3rem)/4)] min-w-0 shrink-0 grow-0"
                    >
                      <article className="group flex h-full flex-col overflow-hidden rounded-[28px] border border-border/40 bg-background shadow-[0_4px_14px_rgba(0,0,0,0.06)] transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                        <div className="relative h-48 w-full overflow-hidden bg-muted/30">
                          {grade.gallery.length ? (
                            <img
                              src={grade.gallery[0].url}
                              alt={grade.name}
                              className="h-48 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                              loading="lazy"
                            />
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
                            <h3 className="text-2xl md:text-3xl font-display font-black uppercase tracking-wide text-foreground underline decoration-[6px] decoration-accent-yellow underline-offset-4">
                              {grade.name} STUDIO
                            </h3>
                            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                              {grade.short_description ?? "Discover this studio grade, explore availability, and compare contract options tailored for you."}
                            </p>
                            {gradeAvailability && selectedYear && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                {gradeAvailability.available_count} of {gradeAvailability.total_capacity} studios available for {formatYearForDisplay(selectedYear.name)}
                              </p>
                            )}
                          </div>
                          <div className="mt-auto flex flex-wrap items-center justify-between gap-4">
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
                                  href={portalStudiosUrl(selectedYear?.name.replace(/\//g, "-") || "", grade.slug)}
                                  target="_blank"
                                  rel="noopener noreferrer"
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
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
              <div className="flex justify-center mt-6">
                <CarouselDots className="bg-black/10 backdrop-blur-sm rounded-full px-3 py-2" />
              </div>
            </Carousel>
          )}
        </div>
      </section>

      {/* Urban Hub Facilities – primary red with noise */}
      <section className="relative bg-primary py-24 md:py-32 overflow-hidden">
        <Noise patternAlpha={12} />
        <div className="container relative z-10 mx-auto px-4">
          <FacilitiesSection />
        </div>
      </section>
      </main>

      <Footer />
    </div>
  );
};

const FacilitiesSection = () => {
  const [activeFacility, setActiveFacility] = useState(0);
  const { data: dbAmenities } = useWebsiteAmenities();

  const facilitiesFallback = [
    {
      id: 1,
      number: "01",
      title: "SNUG AREAS",
      description: "At Urban Hub, we know student life isn't all lectures and deadlines. That's why our snug areas offer the perfect retreat – cozy, comfy, and designed for students to unwind or catch up with mates. Whether you're living with us short-term or for the full academic year, these snug zones make Urban Hub's student accommodation in Preston feel like home.",
      image: snugAreasImg,
    },
    {
      id: 2,
      number: "02",
      title: "GAME ROOM",
      description: "Our Game Room brings the fun to your UCLan student accommodation. Whether you're into table tennis, video games, or a bit of friendly competition, this space is the ultimate student hangout. It's all part of what makes Urban Hub one of the best student apartments in Preston – where study and play go hand-in-hand.",
      image: gameRoomImg,
    },
    {
      id: 3,
      number: "03",
      title: "CAFE & RETAIL UNITS",
      description: "On-Site Café & Retail Units – Preston Student Housing Made Easy. Living at Urban Hub means you don't need to travel far for your essentials or your caffeine fix. With on-site cafés and retail spaces, we bring convenience to student living in Preston – whether you're on a study break or doing a late-night snack run. Another reason why our accommodation near UCLan stands out.",
      image: cafeRetailImg,
    },
    {
      id: 4,
      number: "04",
      title: "TESCO RETAIL STORE",
      description: "Tesco Onsite – UCLan Accommodation with Built-In Convenience. Forget the food shop struggles. At Urban Hub, you've got a Tesco grocery store right on your doorstep. Stock up on fresh food, snacks, or last-minute uni supplies – all without leaving your building. That's premium student accommodation in Preston, done right.",
      image: tescoImg,
    },
    {
      id: 5,
      number: "05",
      title: "ROOFTOP TERRACE",
      description: "Rooftop Terrace with City Views – A Vibe Like No Other in Preston. Kick back on our rooftop terrace with panoramic views of Preston and beyond. It's the perfect spot to relax after lectures or watch the sunset with friends. Few student houses in Preston can match this vibe – whether you're staying short-term or for the year, this space will be your go-to.",
      image: rooftopImg,
    },
    {
      id: 6,
      number: "06",
      title: "CINEMA ROOM",
      description: "Private Cinema Room – Movie Nights at Your Student Accommodation. Why go out when you've got a cinema room in your building? Whether it's movie night with your flatmates or a solo binge-watch, this is what modern student housing in Preston looks like. Comfortable seating, surround sound, and total control of the remote – yes please.",
      image: cinemaRoomImg,
    },
    {
      id: 7,
      number: "07",
      title: "EQUIPPED GYM",
      description: "Fully Equipped Gym – Fitness Built into Your Student Life in Preston. No more excuses. Our on-site gym means staying fit is easy, even during deadline season. From cardio to weights, everything you need is here – and it's all part of your UCLan student accommodation at Urban Hub. Healthier lifestyle, zero travel time.",
      image: equippedGymImg,
    },
  ];

  const facilities = (dbAmenities?.length
    ? dbAmenities.map((a, i) => ({
        id: a.id,
        number: String(i + 1).padStart(2, "0"),
        title: a.title.toUpperCase(),
        description: a.short_description || "",
        image: a.horizontal_image_url || "/placeholder.svg",
      }))
    : facilitiesFallback) as { id: string | number; number: string; title: string; description: string; image: string }[];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
      {/* Left Column - Text Content */}
      <div className="space-y-6 md:space-y-8 order-2 lg:order-1">
        <div className="space-y-3 md:space-y-4">
          <AnimatedHeading delay={0.2} className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-display font-black uppercase text-white leading-tight">
            URBAN HUB FACILITIES
          </AnimatedHeading>
          <AnimatedParagraph delay={0.3} className="text-white/80 text-sm md:text-base lg:text-lg leading-relaxed max-w-lg">
            Discover the premium amenities that make Urban Hub the ultimate student living experience in Preston.
          </AnimatedParagraph>
        </div>

        {/* Facilities List */}
        <div className="space-y-0">
          {facilities.map((facility, index) => {
            const isActive = activeFacility === index;
            return (
              <div
                key={facility.id}
                onClick={() => setActiveFacility(index)}
                className={`cursor-pointer transition-all duration-300 ${
                  isActive
                    ? "bg-[#DDE1F1] p-4 md:p-6 rounded-lg"
                    : "p-4 md:p-6 hover:bg-white/5 rounded-lg"
                } ${index < facilities.length - 1 ? "border-b border-white/10" : ""}`}
              >
                <div className="flex items-start gap-3 md:gap-4">
                  <span
                    className={`text-xl md:text-2xl font-bold font-display flex-shrink-0 ${
                      isActive ? "text-gray-400" : "text-white/50"
                    }`}
                  >
                    {facility.number}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3
                      className={`text-lg md:text-xl lg:text-2xl font-display font-black uppercase mb-2 ${
                        isActive ? "text-gray-800" : "text-white"
                      }`}
                    >
                      {facility.title}
                    </h3>
                    {isActive && (
                      <p className="text-gray-700 text-xs md:text-sm lg:text-base leading-relaxed mt-2">
                        {facility.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Column - Image */}
      <div className="lg:sticky lg:top-24 h-full order-1 lg:order-2">
        <div className="relative aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl">
          <img
            src={facilities[activeFacility].image}
            alt={facilities[activeFacility].title}
            className="w-full h-full object-cover transition-opacity duration-500"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  );
};

export default About;
