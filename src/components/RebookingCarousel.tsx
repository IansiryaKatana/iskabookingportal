import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { RotateCcw } from "lucide-react";
import Autoplay from "embla-carousel-autoplay";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatContractDuration, getEffectiveWeeks } from "@/utils/contractDuration";

type RebookingContract = {
  contract: {
    id: string;
    slug: string;
    name: string;
    weeks: number;
    studio_grade: {
      id: string;
      name: string;
      slug: string;
      studio_grade_media?: Array<{
        url: string;
        is_hero?: boolean;
        media_type: string;
      }>;
    } | null;
    academic_year: {
      name: string;
    } | null;
  };
  message: string;
  previousAcademicYear?: string;
};

type RebookingCarouselProps = {
  contracts: RebookingContract[];
  onNavigate?: (slug: string) => void;
};

const RebookingCarousel = ({ contracts, onNavigate }: RebookingCarouselProps) => {
  const navigate = useNavigate();

  // Sort contracts: Studio Grade > Weeks > Academic Year
  const sortedContracts = useMemo(() => {
    return [...contracts].sort((a, b) => {
      const gradeA = a.contract.studio_grade?.name || "";
      const gradeB = b.contract.studio_grade?.name || "";
      
      // First sort by studio grade name
      if (gradeA !== gradeB) {
        return gradeA.localeCompare(gradeB);
      }
      
      // Then by effective weeks (weeks + extra_days/7)
      const effA = getEffectiveWeeks(a.contract);
      const effB = getEffectiveWeeks(b.contract);
      if (effA !== effB) return effA - effB;
      
      // Finally by academic year
      const yearA = a.contract.academic_year?.name || "";
      const yearB = b.contract.academic_year?.name || "";
      return yearA.localeCompare(yearB);
    });
  }, [contracts]);

  // Get hero image for each contract
  const getHeroImage = (contract: RebookingContract["contract"]) => {
    if (!contract.studio_grade?.studio_grade_media) return null;
    
    // Try to find hero image
    const heroMedia = contract.studio_grade.studio_grade_media.find(
      (media) => media.media_type === "image" && media.is_hero === true
    );
    
    if (heroMedia) return heroMedia.url;
    
    // Fallback to first image
    const firstImage = contract.studio_grade.studio_grade_media.find(
      (media) => media.media_type === "image"
    );
    
    return firstImage?.url || null;
  };

  const handleCardClick = (slug: string) => {
    if (onNavigate) {
      onNavigate(slug);
    } else {
      navigate(`/contracts/${encodeURIComponent(slug)}`);
    }
  };

  if (sortedContracts.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
      <Carousel
        opts={{
          align: "start",
          loop: true,
          slidesToScroll: 1,
        }}
        plugins={[
          Autoplay({
            delay: 3000, // 3 seconds per slide
            stopOnInteraction: false,
            stopOnMouseEnter: true,
            stopOnFocusIn: true,
          }),
        ]}
        className="w-full"
      >
        <CarouselContent className="-ml-2 md:-ml-4">
          {sortedContracts.map(({ contract, message, previousAcademicYear }) => {
            const heroImage = getHeroImage(contract);
            const gradeName = contract.studio_grade?.name || "Studio Grade";
            const academicYear = contract.academic_year?.name || "";
            const previousYear = previousAcademicYear || "";

            return (
              <CarouselItem
                key={contract.id}
                className="pl-2 md:pl-4 basis-full sm:basis-1/2 lg:basis-1/4"
              >
                <Card
                  className={cn(
                    "group relative overflow-hidden rounded-3xl border-2 border-border/60 shadow-xl cursor-pointer transition-all duration-300",
                    "hover:scale-[1.02] hover:shadow-2xl hover:border-primary/50",
                    "aspect-square" // Square container
                  )}
                  onClick={() => handleCardClick(contract.slug)}
                >
                  {/* Background Image */}
                  {heroImage && (
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-110"
                      style={{
                        backgroundImage: `url(${heroImage})`,
                      }}
                    />
                  )}
                  
                  {/* Dark Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />
                  
                  {/* Content */}
                  <div className="relative h-full flex flex-col justify-between p-6 text-white">
                    {/* Top Section - Academic Year */}
                    <div className="text-center">
                      <p className="text-xs sm:text-sm font-medium text-white/90 mb-1">
                        {academicYear}
                      </p>
                      <div className="w-12 h-0.5 bg-primary mx-auto mb-2" />
                    </div>
                    
                    {/* Middle Section - Studio Grade & Weeks */}
                    <div className="text-center flex-1 flex flex-col justify-center">
                      <h3 className="text-base sm:text-lg font-display font-bold uppercase tracking-wide mb-1">
                        {gradeName}
                      </h3>
                      <p className="text-sm sm:text-base text-white/90 font-semibold mb-3">
                        {formatContractDuration(contract)}
                      </p>
                      {previousYear ? (
                        <p className="text-[10px] sm:text-xs text-white/80 leading-tight max-w-[90%] mx-auto">
                          You can rebook for {academicYear}. Your previous application from {previousYear} will be used to pre-fill this form.
                        </p>
                      ) : (
                        <p className="text-[10px] sm:text-xs text-white/80 leading-tight max-w-[90%] mx-auto">
                          You can rebook for {academicYear}. Your previous application data will be used to pre-fill this form.
                        </p>
                      )}
                    </div>
                    
                    {/* Bottom Section - Button */}
                    <Button
                      className="w-full rounded-full uppercase tracking-wide bg-primary hover:bg-primary/90 text-white shadow-lg font-semibold text-xs sm:text-sm"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCardClick(contract.slug);
                      }}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Rebook Now
                    </Button>
                  </div>
                </Card>
              </CarouselItem>
            );
          })}
        </CarouselContent>
        
        {/* Navigation Arrows - Hidden on mobile, visible on larger screens */}
        <CarouselPrevious className="hidden md:flex -left-4 lg:-left-12 h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm border-2 hover:bg-background" />
        <CarouselNext className="hidden md:flex -right-4 lg:-right-12 h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm border-2 hover:bg-background" />
      </Carousel>
    </div>
  );
};

export default RebookingCarousel;

