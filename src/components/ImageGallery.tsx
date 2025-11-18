import { useEffect, useMemo, useState } from "react";

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

  useEffect(() => {
    const interval = setInterval(() => {
      setSelectedImage((prev) => (prev + 1) % galleryImages.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [galleryImages.length]);

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

      {/* Thumbnail Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 md:gap-4">
        {galleryImages.map((image, index) => (
          <button
            key={index}
            onClick={() => setSelectedImage(index)}
            className={`relative aspect-video overflow-hidden rounded-lg transition-all ${
              selectedImage === index
                ? "ring-4 ring-primary scale-105"
                : "hover:scale-105 opacity-70 hover:opacity-100"
            }`}
          >
            <img
              src={image.src}
              alt={image.alt ?? "Studio preview"}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
};

export default ImageGallery;
