type StudioOverviewProps = {
  title?: string;
  intro?: string;
  description?: string;
  highlights?: string[];
};

const StudioOverview = ({
  title = "Studio Overview",
  intro,
  description,
  highlights = [],
}: StudioOverviewProps) => {
  const paragraphs = (description ?? "")
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <section
      style={{ backgroundColor: "hsl(0 0% 0%)" }}
      className="text-white py-16 md:py-24"
    >
      <div className="container mx-auto px-4 max-w-7xl">
        <h2 className="text-4xl md:text-6xl lg:text-7xl font-display font-black mb-8 uppercase">
          {title}
        </h2>
        
        <div className="space-y-6 text-sm md:text-lg leading-relaxed">
          {intro && <p className="font-semibold text-base md:text-xl">{intro}</p>}

          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}

          {highlights.length > 0 && (
            <ul className="space-y-3 text-base md:text-lg">
              {highlights.map((highlight, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="mt-1 text-primary">•</span>
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};

export default StudioOverview;
