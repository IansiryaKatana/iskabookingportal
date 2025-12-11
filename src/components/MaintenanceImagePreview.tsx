import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

type MaintenanceImagePreviewProps = {
  images: string[];
  initialIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const MaintenanceImagePreview = ({
  images,
  initialIndex = 0,
  open,
  onOpenChange,
}: MaintenanceImagePreviewProps) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [imageUrls, setImageUrls] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && images.length > 0) {
      setCurrentIndex(initialIndex);
      fetchAllImages();
    }
  }, [open, images, initialIndex]);

  const fetchAllImages = async () => {
    setLoading(true);
    const urls = await Promise.all(
      images.map(async (imagePath) => {
        try {
          const { data, error } = await supabase.storage
            .from("maintenance-images")
            .createSignedUrl(imagePath, 3600);

          if (error) throw error;
          return data?.signedUrl || null;
        } catch (error) {
          console.error("Error fetching signed URL:", error);
          const { data } = supabase.storage
            .from("maintenance-images")
            .getPublicUrl(imagePath);
          return data.publicUrl;
        }
      })
    );
    setImageUrls(urls);
    setLoading(false);
  };

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") goToPrevious();
    if (e.key === "ArrowRight") goToNext();
    if (e.key === "Escape") onOpenChange(false);
  };

  if (!open || images.length === 0) return null;

  const currentImageUrl = imageUrls[currentIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-7xl w-full h-[90vh] p-0 gap-0 rounded-3xl overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <div className="relative w-full h-full flex flex-col">
          {/* Close Button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-50 rounded-full bg-black/50 hover:bg-black/70 text-white"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </Button>

          {/* Main Image */}
          <div className="flex-1 relative flex items-center justify-center bg-black/90 p-4">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            ) : currentImageUrl ? (
              <>
                {/* Navigation Arrows */}
                {images.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute left-4 z-50 rounded-full bg-black/50 hover:bg-black/70 text-white"
                      onClick={goToPrevious}
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-4 z-50 rounded-full bg-black/50 hover:bg-black/70 text-white"
                      onClick={goToNext}
                    >
                      <ChevronRight className="h-6 w-6" />
                    </Button>
                  </>
                )}

                <img
                  src={currentImageUrl}
                  alt={`Maintenance image ${currentIndex + 1}`}
                  className="max-w-full max-h-full object-contain"
                />

                {/* Image Counter */}
                {images.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-full text-sm">
                    {currentIndex + 1} / {images.length}
                  </div>
                )}
              </>
            ) : (
              <div className="text-white">Failed to load image</div>
            )}
          </div>

          {/* Thumbnail Strip */}
          {images.length > 1 && (
            <div className="h-24 bg-black/50 p-2 overflow-x-auto">
              <div className="flex gap-2 h-full justify-center">
                {images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    className={`flex-shrink-0 h-full rounded-lg overflow-hidden border-2 transition-all ${
                      idx === currentIndex
                        ? "border-primary scale-105"
                        : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    {imageUrls[idx] ? (
                      <img
                        src={imageUrls[idx]}
                        alt={`Thumbnail ${idx + 1}`}
                        className="h-full w-auto object-cover"
                      />
                    ) : (
                      <div className="h-full w-20 bg-muted flex items-center justify-center">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

