import { useEffect, useMemo, useState, useRef } from "react";

type GalleryImage = {
  src: string;
  alt?: string | null;
};

type ImageGalleryProps = {
  images?: GalleryImage[];
};

const fallbackImages: GalleryImage[] = [
  {
    src: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1800&q=80",
    alt: "Premium studio interior with natural light",
  },
  {
    src: "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?auto=format&fit=crop&w=1800&q=80",
    alt: "Modern kitchen with wooden accents",
  },
  {
    src: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1800&q=80",
    alt: "Cozy lounge area for students",
  },
  {
    src: "https://images.unsplash.com/photo-1484100356142-db6ab6244067?auto=format&fit=crop&w=1800&q=80",
    alt: "Spacious ensuite bathroom",
  },
  {
    src: "https://images.unsplash.com/photo-1505692794403-55b39e08fb5e?auto=format&fit=crop&w=1800&q=80",
    alt: "Study area with desk and storage",
  },
  {
    src: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1800&q=80",
    alt: "Urban view from the studio",
  },
];

const ImageGallery = ({ images }: ImageGalleryProps) => {
  const galleryImages = useMemo(() => {
    if (images && images.length > 0) {
      return images;
    }
    return fallbackImages;
  }, [images]);

  const [selectedImage, setSelectedImage] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSelectedImage((prev) => (prev + 1) % galleryImages.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [galleryImages.length]);

  // Drag to scroll functionality for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 2; // Scroll speed multiplier
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  return (
    <div className="space-y-4">
      {/* Main Image */}
      <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
        <img
          src={galleryImages[selectedImage].src}
          alt={galleryImages[selectedImage].alt ?? "Studio preview"}
          className="w-full h-full object-cover transition-opacity duration-500"
          key={selectedImage}
        />
      </div>

      {/* Thumbnail Grid - Horizontal Scrollable (6 visible, scroll for more) */}
      <div className="relative w-full">
        <div 
          ref={scrollContainerRef}
          className={`overflow-x-auto scrollbar-hide snap-x snap-mandatory scroll-smooth ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{
            scrollbarWidth: 'none', // Firefox
            msOverflowStyle: 'none', // IE/Edge
            WebkitOverflowScrolling: 'touch', // Smooth scrolling on iOS
            userSelect: 'none', // Prevent text selection while dragging
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onWheel={(e) => {
            // Enable horizontal scrolling with shift+wheel or trackpad horizontal scroll
            const container = e.currentTarget;
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
              // Horizontal trackpad scroll
              container.scrollLeft += e.deltaX;
              e.preventDefault();
            } else if (e.shiftKey) {
              // Shift+wheel for horizontal scroll
              container.scrollLeft += e.deltaY;
              e.preventDefault();
            }
          }}
        >
          <div 
            className="flex gap-2 md:gap-4"
            style={{ 
              width: 'max-content',
              paddingRight: '1rem' // Add padding to allow last item to scroll into view
            }}
          >
            {galleryImages.map((image, index) => {
              // Calculate width to show 6 thumbnails visible, with scrolling for more
              // Use a responsive width that works on all screen sizes
              return (
                <button
                  key={index}
                  onClick={() => setSelectedImage(index)}
                  className={`relative aspect-video overflow-hidden rounded-lg transition-all flex-shrink-0 snap-start ${
                    selectedImage === index
                      ? "ring-4 ring-primary scale-105 z-10"
                      : "hover:scale-105 opacity-70 hover:opacity-100"
                  }`}
                  style={{ 
                    // Show 6 thumbnails: use calc to account for gaps
                    // On mobile: smaller, on desktop: up to 120px
                    width: 'clamp(60px, calc((100vw - 2rem - 1.25rem) / 6), 120px)',
                    minWidth: '60px'
                  }}
                >
                  <img
                    src={image.src}
                    alt={image.alt ?? "Studio preview"}
                    className="w-full h-full object-cover pointer-events-none"
                    draggable={false}
                  />
                </button>
              );
            })}
          </div>
        </div>
        {/* Scroll indicator */}
        {galleryImages.length > 6 && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            Scroll horizontally (Shift+Scroll or drag) to see all {galleryImages.length} images
          </p>
        )}
      </div>
    </div>
  );
};

export default ImageGallery;
