import { Badge } from "@/components/ui/badge";
import clsx from "clsx";

type HeroSectionProps = {
  title: string;
  badgeText?: string;
  description?: string;
  backgroundImage?: string | null;
};

const fallbackGradient =
  "linear-gradient(135deg, rgba(0, 0, 0, 0.75), rgba(0, 0, 0, 0.5))";

const HeroSection = ({
  title,
  badgeText,
  description,
  backgroundImage,
}: HeroSectionProps) => {
  const heroBackground = backgroundImage
    ? `url(${backgroundImage})`
    : fallbackGradient;

  return (
    <section className="relative h-[70vh] min-h-[500px] w-full overflow-hidden">
      <div 
        className="absolute inset-0 bg-cover bg-center transition-all duration-500"
        style={{ backgroundImage: heroBackground }}
      />
      <div
        className={clsx(
          "absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70",
          !backgroundImage && "bg-black/70",
        )}
      />
      
      <div className="relative h-full flex flex-col items-center justify-center text-center px-4 space-y-4">
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-black text-white tracking-tight uppercase">
          {title}
        </h1>
        {badgeText && (
          <Badge className="bg-accent-yellow text-black hover:bg-accent-yellow/90 text-sm md:text-base font-bold px-6 py-2 uppercase tracking-wide">
            {badgeText}
        </Badge>
        )}
        {description && (
          <p className="max-w-3xl text-base md:text-lg text-white/80">
            {description}
          </p>
        )}
      </div>
    </section>
  );
};

export default HeroSection;
