import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WebsiteWhyUsCard = {
  id: string;
  icon: string | null;
  icon_url: string | null;
  title: string;
  description: string;
  display_order: number;
};

export function useWhyUsCards() {
  return useQuery({
    queryKey: ["website-why-us-cards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_why_us_cards")
        .select("id, icon, icon_url, title, description, display_order")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      // Table may not exist until website migration 002 is run – return [] so UI fallback is used
      if (error) {
        const msg = String(error.message || "");
        if ((error as { status?: number }).status === 404 || msg.includes("404") || msg.toLowerCase().includes("not found")) {
          return [] as WebsiteWhyUsCard[];
        }
        throw error;
      }
      return (data || []) as WebsiteWhyUsCard[];
    },
    staleTime: 5 * 60 * 1000,
    retry: (_, error) => {
      const msg = String((error as Error)?.message || "");
      return !msg.includes("404") && !msg.toLowerCase().includes("not found");
    },
  });
}
