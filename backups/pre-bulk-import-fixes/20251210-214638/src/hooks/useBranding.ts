import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BrandingSetting = {
  setting_key: string;
  setting_value: string | null;
  setting_type: string;
};

export type NavigationItem = {
  id: string;
  title: string;
  url: string;
  display_order: number;
  is_active: boolean;
  location: "header" | "footer";
  opens_in_new_tab: boolean;
};

export type OpeningHour = {
  id: string;
  day_name: string;
  day_order: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  special_note: string | null;
};

/**
 * Get all branding settings
 */
export const useBrandingSettings = () => {
  return useQuery<Record<string, string>>({
    queryKey: ["branding-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branding_settings")
        .select("setting_key, setting_value")
        .order("setting_key");

      if (error) throw error;

      const settings: Record<string, string> = {};
      (data || []).forEach((item) => {
        settings[item.setting_key] = item.setting_value || "";
      });

      return settings;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
};

/**
 * Get navigation items by location
 */
export const useNavigationItems = (location: "header" | "footer") => {
  return useQuery<NavigationItem[]>({
    queryKey: ["navigation-items", location],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("navigation_items")
        .select("*")
        .eq("location", location)
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return (data || []) as NavigationItem[];
    },
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * Get all opening hours
 */
export const useOpeningHours = () => {
  return useQuery<OpeningHour[]>({
    queryKey: ["opening-hours"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opening_hours")
        .select("*")
        .order("day_order", { ascending: true });

      if (error) throw error;
      return (data || []) as OpeningHour[];
    },
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * Get a specific branding setting value
 */
export const useBrandingSetting = (key: string) => {
  const { data: settings } = useBrandingSettings();
  return settings?.[key] || null;
};

