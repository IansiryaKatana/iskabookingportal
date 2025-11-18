type Amenity = {
  id: string;
  name: string;
  description?: string | null;
  icon_url?: string | null;
};

type AmenitiesSectionProps = {
  amenities?: Amenity[];
  videoUrl?: string | null;
};

const AmenitiesSection = ({ amenities, videoUrl }: AmenitiesSectionProps) => {
  const hasAmenities = amenities && amenities.length > 0;

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
                    <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-lg font-bold text-primary">
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

        {videoUrl && (
        <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden p-1">
          <video
            className="w-full h-full object-cover rounded"
            autoPlay
            loop
            muted
            playsInline
              controls={false}
          >
              <source src={videoUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
        )}
      </div>
    </section>
  );
};

export default AmenitiesSection;
