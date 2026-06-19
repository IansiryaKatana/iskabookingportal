import { useRef, useEffect, useState } from "react";

type Amenity = {
  id: string;
  name: string;
  description?: string | null;
  icon_url?: string | null;
};

type AmenitiesSectionProps = {
  amenities?: Amenity[];
  videoUrl?: string | null;
  /** If the primary video fails to load, we try this URL (e.g. known-good Supabase storage URL). */
  fallbackVideoUrl?: string | null;
};

const AmenitiesSection = ({ amenities, videoUrl, fallbackVideoUrl }: AmenitiesSectionProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentSrc, setCurrentSrc] = useState<string | null>(() => {
    const u = typeof videoUrl === "string" ? videoUrl.trim() || null : videoUrl || null;
    return u || null;
  });
  const hasAmenities = amenities && amenities.length > 0;
  const normalizedVideoUrl = typeof videoUrl === "string" ? videoUrl.trim() || null : videoUrl || null;
  const fallback = typeof fallbackVideoUrl === "string" ? fallbackVideoUrl.trim() || null : fallbackVideoUrl || null;

  // Sync currentSrc when videoUrl prop changes (e.g. after branding loads)
  useEffect(() => {
    if (normalizedVideoUrl) setCurrentSrc(normalizedVideoUrl);
    else if (fallback) setCurrentSrc(fallback);
    else setCurrentSrc(null);
  }, [normalizedVideoUrl, fallback]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !currentSrc) return;
    const p = el.play();
    if (p?.catch) p.catch(() => {});
  }, [currentSrc]);

  const handleVideoError = () => {
    if (!fallback || currentSrc === fallback) return;
    setCurrentSrc(fallback);
  };

  return (
    <section
      style={{ backgroundColor: "#171515" }}
      className="text-white py-16 md:py-24"
    >
      <div className="container mx-auto px-4 max-w-7xl">
        <h2 className="text-4xl md:text-6xl lg:text-7xl font-display font-black mb-12 uppercase">
          OUR AMENITIES
        </h2>
        
        {hasAmenities && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {amenities!.map((amenity) => (
              <div
                key={amenity.id}
                className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 space-y-3"
              >
                <div className="flex items-center gap-3">
                  {amenity.icon_url ? (
                    <img
                      src={amenity.icon_url}
                      alt={`${amenity.name} icon`}
                      className="h-10 w-10 object-contain"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-md bg-white/10 flex items-center justify-center text-lg font-bold text-primary">
                      {amenity.name.charAt(0)}
                    </div>
                  )}
                  <h3 className="text-xl font-semibold uppercase tracking-wide">
                    {amenity.name}
                  </h3>
                </div>
                {amenity.description && (
                  <p className="text-sm text-white/70 leading-relaxed">
                    {amenity.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {currentSrc && (
        <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden p-1">
          <video
            ref={videoRef}
            key={currentSrc}
            src={currentSrc}
            className="w-full h-full object-cover rounded"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            onError={handleVideoError}
          />
        </div>
        )}
      </div>
    </section>
  );
};

export default AmenitiesSection;
