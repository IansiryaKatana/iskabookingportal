import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ImageSlot = {
  id: string;
  slot_key: string;
  display_name: string;
  file_url: string | null;
  alt_text: string | null;
  fallback_url: string | null;
};

/**
 * Get effective URL for a slot (file_url or fallback_url).
 */
export function getSlotUrl(slot: ImageSlot | null | undefined): string | null {
  if (!slot) return null;
  if (slot.file_url) return slot.file_url;
  return slot.fallback_url || null;
}

/**
 * Fetch all website image slots.
 */
export function useWebsiteImageSlots() {
  return useQuery({
    queryKey: ["website-image-slots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_image_slots")
        .select("id, slot_key, display_name, file_url, alt_text, fallback_url")
        .order("slot_key");
      if (error) throw error;
      return (data || []) as ImageSlot[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get URL for a specific slot by key.
 */
export function useSlotUrl(slotKey: string, fallback?: string | null): string {
  const { data: slots } = useWebsiteImageSlots();
  const slot = slots?.find((s) => s.slot_key === slotKey);
  const url = getSlotUrl(slot);
  return url || fallback || "";
}
