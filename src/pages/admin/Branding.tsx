import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { logActivity } from "@/utils/auditLog";
import { Loader2, Upload, Save, Plus, Trash2, GripVertical, CheckSquare, Square } from "lucide-react";
import { useBrandingSettings, useNavigationItems, useOpeningHours, type NavigationItem, type OpeningHour } from "@/hooks/useBranding";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const Branding = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [uploadingHeroImage, setUploadingHeroImage] = useState(false);
  const [uploadingAmenitiesVideo, setUploadingAmenitiesVideo] = useState(false);
  const [deleteNavItemId, setDeleteNavItemId] = useState<string | null>(null);

  const { data: settings, isLoading: settingsLoading } = useBrandingSettings();
  // For admin, we need all items (active and inactive), so we'll fetch directly
  const { data: headerNavItems, isLoading: headerNavLoading } = useQuery({
    queryKey: ["navigation-items", "header", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("navigation_items")
        .select("*")
        .eq("location", "header")
        .order("display_order", { ascending: true });

      if (error) throw error;
      return (data || []) as NavigationItem[];
    },
  });
  const { data: footerNavItems, isLoading: footerNavLoading } = useQuery({
    queryKey: ["navigation-items", "footer", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("navigation_items")
        .select("*")
        .eq("location", "footer")
        .order("display_order", { ascending: true });

      if (error) throw error;
      return (data || []) as NavigationItem[];
    },
  });
  const { data: openingHours, isLoading: hoursLoading } = useOpeningHours();

  // Form states
  const [companyName, setCompanyName] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [logoPath, setLogoPath] = useState("");
  const [faviconPath, setFaviconPath] = useState("");
  const [heroImagePath, setHeroImagePath] = useState("");
  const [amenitiesVideoPath, setAmenitiesVideoPath] = useState("");
  const [footerDescription, setFooterDescription] = useState("");
  const [footerCopyright, setFooterCopyright] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactAddress1, setContactAddress1] = useState("");
  const [contactAddress2, setContactAddress2] = useState("");
  const [contactAddress3, setContactAddress3] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [headerNavItemsState, setHeaderNavItemsState] = useState<NavigationItem[]>([]);
  const [footerNavItemsState, setFooterNavItemsState] = useState<NavigationItem[]>([]);
  const [openingHoursState, setOpeningHoursState] = useState<OpeningHour[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [bulkOpenTime, setBulkOpenTime] = useState("");
  const [bulkCloseTime, setBulkCloseTime] = useState("");
  const [bulkIsClosed, setBulkIsClosed] = useState(false);
  const [bulkSpecialNote, setBulkSpecialNote] = useState("");

  // Color and font states
  const [colors, setColors] = useState<Record<string, string>>({});
  const [fonts, setFonts] = useState<Record<string, string>>({});

  // Initialize form states when data loads
  useEffect(() => {
    if (settings) {
      setCompanyName(settings.company_name || "");
      setMetaDescription(settings.meta_description || "");
      setTwitterHandle(settings.twitter_handle || "");
      setLogoPath(settings.logo_path || "");
      setFaviconPath(settings.favicon_path || "");
      setHeroImagePath(settings.studio_catalog_hero_image || "");
      setAmenitiesVideoPath(settings.amenities_video_url || "");
      setFooterDescription(settings.footer_description || "");
      setFooterCopyright(settings.footer_copyright_text || "");
      setContactPhone(settings.contact_phone || "");
      setContactEmail(settings.contact_email || "");
      setContactAddress1(settings.contact_address_line1 || "");
      setContactAddress2(settings.contact_address_line2 || "");
      setContactAddress3(settings.contact_address_line3 || "");
      setEmergencyContact(settings.emergency_contact_text || "");

      // Initialize colors
      const colorKeys = [
        "color_primary", "color_primary_foreground", "color_secondary", "color_secondary_foreground",
        "color_accent", "color_accent_foreground", "color_destructive", "color_destructive_foreground",
        "color_muted", "color_muted_foreground", "color_success", "color_success_foreground",
        "color_background", "color_foreground", "color_border", "color_card", "color_card_foreground"
      ];
      const colorValues: Record<string, string> = {};
      colorKeys.forEach(key => {
        colorValues[key] = settings[key] || "";
      });
      setColors(colorValues);

      // Initialize fonts
      setFonts({
        font_family_body: settings.font_family_body || "Inter Tight",
        font_family_display: settings.font_family_display || "Big Shoulders Display",
        font_family_body_fallback: settings.font_family_body_fallback || "sans-serif",
        font_family_display_fallback: settings.font_family_display_fallback || "sans-serif",
      });
    }
  }, [settings]);

  useEffect(() => {
    if (headerNavItems) setHeaderNavItemsState(headerNavItems);
  }, [headerNavItems]);

  useEffect(() => {
    if (footerNavItems) setFooterNavItemsState(footerNavItems);
  }, [footerNavItems]);

  useEffect(() => {
    if (openingHours) setOpeningHoursState(openingHours);
  }, [openingHours]);

  // Upload logo
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Please upload an image file.",
      });
      return;
    }

    setUploadingLogo(true);
    try {
      const extension = file.name.split(".").pop() ?? "webp";
      const path = `logo.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("branding")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("branding")
        .getPublicUrl(path);

      const publicUrl = publicUrlData.publicUrl;

      // Update branding_settings
      const { error: updateError } = await supabase
        .from("branding_settings")
        .upsert({
          setting_key: "logo_path",
          setting_value: publicUrl,
          setting_type: "url",
        }, {
          onConflict: "setting_key",
        });

      if (updateError) throw updateError;

      await queryClient.invalidateQueries({ queryKey: ["branding-settings"] });
      setLogoPath(publicUrl);

      toast({
        title: "Logo uploaded",
        description: "Logo has been successfully uploaded.",
      });

      await logActivity({ action: "branding_updated", payload: { type: "logo_upload" } });
    } catch (error: any) {
      console.error("Logo upload error:", error);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message || "Failed to upload logo. Please try again.",
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  // Upload hero image
  const handleHeroImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Please upload an image file.",
      });
      return;
    }

    setUploadingHeroImage(true);
    try {
      const extension = file.name.split(".").pop() ?? "webp";
      const path = `studio-catalog-hero.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("branding")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("branding")
        .getPublicUrl(path);

      const publicUrl = publicUrlData.publicUrl;

      // Update branding_settings
      const { error: updateError } = await supabase
        .from("branding_settings")
        .upsert({
          setting_key: "studio_catalog_hero_image",
          setting_value: publicUrl,
          setting_type: "url",
        }, {
          onConflict: "setting_key",
        });

      if (updateError) throw updateError;

      await queryClient.invalidateQueries({ queryKey: ["branding-settings"] });
      setHeroImagePath(publicUrl);

      toast({
        title: "Hero image uploaded",
        description: "Studio catalog hero image has been successfully uploaded.",
      });

      await logActivity({ action: "branding_updated", payload: { type: "hero_image_upload" } });
    } catch (error: any) {
      console.error("Hero image upload error:", error);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message || "Failed to upload hero image. Please try again.",
      });
    } finally {
      setUploadingHeroImage(false);
    }
  };

  // Upload amenities video (used in Amenities section; avoids CSP block from external URLs)
  const AMENITIES_VIDEO_MAX_BYTES = 100 * 1024 * 1024; // 100MB

  const handleAmenitiesVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["video/mp4", "video/webm", "video/ogg"];
    if (!validTypes.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Please upload an MP4, WebM, or OGG video file.",
      });
      return;
    }

    if (file.size > AMENITIES_VIDEO_MAX_BYTES) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: `Video must be 100MB or smaller. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`,
      });
      return;
    }

    setUploadingAmenitiesVideo(true);
    try {
      const extension = file.name.split(".").pop() ?? "mp4";
      const path = `amenities-video.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("branding")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("branding")
        .getPublicUrl(path);

      const publicUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from("branding_settings")
        .upsert({
          setting_key: "amenities_video_url",
          setting_value: publicUrl,
          setting_type: "url",
        }, {
          onConflict: "setting_key",
        });

      if (updateError) throw updateError;

      await queryClient.invalidateQueries({ queryKey: ["branding-settings"] });
      setAmenitiesVideoPath(publicUrl);

      toast({
        title: "Amenities video uploaded",
        description: "Refresh the studio page if the video does not appear. If it still fails, in Supabase Dashboard go to Storage → branding → set bucket to Public.",
      });

      await logActivity({ action: "branding_updated", payload: { type: "amenities_video_upload" } });
    } catch (error: any) {
      console.error("Amenities video upload error:", error);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message || "Failed to upload video. Please try again.",
      });
    } finally {
      setUploadingAmenitiesVideo(false);
    }
  };

  // Upload favicon
  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Please upload an image file.",
      });
      return;
    }

    setUploadingFavicon(true);
    try {
      const extension = file.name.split(".").pop() ?? "png";
      const path = `favicon.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("branding")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("branding")
        .getPublicUrl(path);

      const publicUrl = publicUrlData.publicUrl;

      // Update branding_settings
      const { error: updateError } = await supabase
        .from("branding_settings")
        .upsert({
          setting_key: "favicon_path",
          setting_value: publicUrl,
          setting_type: "url",
        }, {
          onConflict: "setting_key",
        });

      if (updateError) throw updateError;

      await queryClient.invalidateQueries({ queryKey: ["branding-settings"] });
      setFaviconPath(publicUrl);

      toast({
        title: "Favicon uploaded",
        description: "Favicon has been successfully uploaded.",
      });

      await logActivity({ action: "branding_updated", payload: { type: "favicon_upload" } });
    } catch (error: any) {
      console.error("Favicon upload error:", error);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message || "Failed to upload favicon. Please try again.",
      });
    } finally {
      setUploadingFavicon(false);
    }
  };

  // Save branding settings
  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      const updates = [
        { setting_key: "company_name", setting_value: companyName, setting_type: "text" },
        { setting_key: "meta_description", setting_value: metaDescription, setting_type: "text" },
        { setting_key: "twitter_handle", setting_value: twitterHandle, setting_type: "text" },
        { setting_key: "logo_path", setting_value: logoPath, setting_type: "url" },
        { setting_key: "favicon_path", setting_value: faviconPath, setting_type: "url" },
        { setting_key: "studio_catalog_hero_image", setting_value: heroImagePath, setting_type: "url" },
        { setting_key: "amenities_video_url", setting_value: amenitiesVideoPath, setting_type: "url" },
        { setting_key: "footer_description", setting_value: footerDescription, setting_type: "text" },
        { setting_key: "footer_copyright_text", setting_value: footerCopyright, setting_type: "text" },
        { setting_key: "contact_phone", setting_value: contactPhone, setting_type: "text" },
        { setting_key: "contact_email", setting_value: contactEmail, setting_type: "text" },
        { setting_key: "contact_address_line1", setting_value: contactAddress1, setting_type: "text" },
        { setting_key: "contact_address_line2", setting_value: contactAddress2, setting_type: "text" },
        { setting_key: "contact_address_line3", setting_value: contactAddress3, setting_type: "text" },
        { setting_key: "emergency_contact_text", setting_value: emergencyContact, setting_type: "text" },
        // Colors
        ...Object.entries(colors).map(([key, value]) => ({
          setting_key: key,
          setting_value: value,
          setting_type: "color" as const,
        })),
        // Fonts
        ...Object.entries(fonts).map(([key, value]) => ({
          setting_key: key,
          setting_value: value,
          setting_type: "text" as const,
        })),
      ];

      const { error } = await supabase
        .from("branding_settings")
        .upsert(updates, { onConflict: "setting_key" });

      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["branding-settings"] });
      toast({
        title: "Settings saved",
        description: "Branding settings have been updated.",
      });
      await logActivity({ action: "branding_updated", payload: { type: "settings" } });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: error.message || "Failed to save settings. Please try again.",
      });
    },
  });

  // Save navigation items
  const saveNavItemsMutation = useMutation({
    mutationFn: async (payload: [NavigationItem[], "header" | "footer"]) => {
      const [items, location] = payload;
      // Get the original items from the database to determine which are new vs existing
      const originalItems = location === "header" ? headerNavItems : footerNavItems;
      const originalItemIds = new Set((originalItems || []).map(item => item.id));

      // Filter out completely empty items (new items that haven't been filled) and validate
      const incompleteItems: string[] = [];
      const validItems: NavigationItem[] = [];

      for (const item of items) {
        const title = (item.title || "").trim();
        const url = (item.url || "").trim();

        if (import.meta.env.DEV) console.log("Processing item:", { 
          id: item.id, 
          title: `"${title}"`, 
          titleLength: title.length,
          url: `"${url}"`, 
          urlLength: url.length,
          isActive: item.is_active 
        });

        // Skip completely empty items (new items that haven't been filled in yet)
        // An item is considered empty if both title and URL are empty or just "#"
        const isEmpty = title.length === 0 && (url.length === 0 || url === "#");
        if (isEmpty) {
          if (import.meta.env.DEV) console.log("Skipping empty item:", item.id);
          continue;
        }

        // Validate that items with data have a title (URL can be "#" as placeholder)
        if (title.length === 0) {
          incompleteItems.push(`Item with URL "${url || 'empty'}" is missing a title`);
          if (import.meta.env.DEV) console.log("Item missing title:", item.id);
          continue;
        }

        // URL can be "#" as a placeholder, so we only require title
        // Item is valid - include it regardless of active status
        if (import.meta.env.DEV) console.log("Adding valid item:", item.id, title);
        validItems.push(item);
      }

      // If there are incomplete items, show a helpful error
      if (incompleteItems.length > 0) {
        throw new Error(
          `Please complete all navigation items:\n${incompleteItems.join('\n')}`
        );
      }

      // If no valid items to save, inform the user
      if (validItems.length === 0) {
        console.error("No valid items to save. Input items:", JSON.stringify(items, null, 2));
        console.error("Incomplete items:", incompleteItems);
        console.error("Valid items count:", validItems.length);
        throw new Error("No valid navigation items to save. Please add at least one item with a title.");
      }

      // Separate items into updates (existing) and inserts (new)
      const itemsToUpdate: any[] = [];
      const itemsToInsert: any[] = [];

      for (const item of validItems) {
        const payload: any = {
          title: item.title.trim(),
          url: item.url.trim(),
          display_order: item.display_order,
          is_active: item.is_active,
          location,
          opens_in_new_tab: item.opens_in_new_tab,
        };

        // If item exists in original data, it's an update (include id)
        if (originalItemIds.has(item.id)) {
          payload.id = item.id;
          itemsToUpdate.push(payload);
        } else {
          // New item - don't include id, let database generate it
          itemsToInsert.push(payload);
        }
      }

      // Perform updates and inserts
      const errors: any[] = [];

      if (itemsToUpdate.length > 0) {
        const { error: updateError } = await supabase
          .from("navigation_items")
          .upsert(itemsToUpdate, { onConflict: "id" });
        if (updateError) errors.push(updateError);
      }

      if (itemsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("navigation_items")
          .insert(itemsToInsert);
        if (insertError) errors.push(insertError);
      }

      if (errors.length > 0) {
        console.error("Navigation items save errors:", errors);
        throw errors[0];
      }
    },
    onSuccess: async (_, variables) => {
      const location = variables[1];
      // Invalidate both public and admin queries
      await queryClient.invalidateQueries({ queryKey: ["navigation-items", location] });
      await queryClient.invalidateQueries({ queryKey: ["navigation-items", location, "admin"] });
      toast({
        title: "Navigation updated",
        description: `${location} navigation items have been saved.`,
      });
      await logActivity({ action: "branding_updated", payload: { type: `navigation_${location}` } });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: error.message || "Failed to save navigation items. Please try again.",
      });
    },
  });

  // Save opening hours
  const saveHoursMutation = useMutation({
    mutationFn: async (hours: OpeningHour[]) => {
      const { error } = await supabase
        .from("opening_hours")
        .upsert(
          hours.map((hour) => ({
            id: hour.id,
            day_name: hour.day_name,
            day_order: hour.day_order,
            open_time: hour.open_time,
            close_time: hour.close_time,
            is_closed: hour.is_closed,
            special_note: hour.special_note,
          })),
          { onConflict: "id" }
        );

      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["opening-hours"] });
      toast({
        title: "Opening hours saved",
        description: "Opening hours have been updated.",
      });
      await logActivity({ action: "branding_updated", payload: { type: "opening_hours" } });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: error.message || "Failed to save opening hours. Please try again.",
      });
    },
  });

  // Add new nav item
  const addNavItem = (location: "header" | "footer") => {
    const newItem: NavigationItem = {
      id: crypto.randomUUID(),
      title: "",
      url: "#",
      display_order: location === "header" ? headerNavItemsState.length + 1 : footerNavItemsState.length + 1,
      is_active: true,
      location,
      opens_in_new_tab: false,
    };

    if (location === "header") {
      setHeaderNavItemsState([...headerNavItemsState, newItem]);
    } else {
      setFooterNavItemsState([...footerNavItemsState, newItem]);
    }
  };

  // Delete nav item
  const deleteNavItem = async () => {
    if (!deleteNavItemId) return;

    const { error } = await supabase
      .from("navigation_items")
      .delete()
      .eq("id", deleteNavItemId);

    if (error) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: error.message || "Failed to delete navigation item.",
      });
      return;
    }

    setHeaderNavItemsState(headerNavItemsState.filter((item) => item.id !== deleteNavItemId));
    setFooterNavItemsState(footerNavItemsState.filter((item) => item.id !== deleteNavItemId));
    setDeleteNavItemId(null);

    // Invalidate both public and admin queries for both locations
    await queryClient.invalidateQueries({ queryKey: ["navigation-items", "header"] });
    await queryClient.invalidateQueries({ queryKey: ["navigation-items", "header", "admin"] });
    await queryClient.invalidateQueries({ queryKey: ["navigation-items", "footer"] });
    await queryClient.invalidateQueries({ queryKey: ["navigation-items", "footer", "admin"] });
    toast({
      title: "Item deleted",
      description: "Navigation item has been removed.",
    });
    await logActivity({ action: "branding_updated", payload: { type: "navigation_delete" } });
  };

  if (settingsLoading || headerNavLoading || footerNavLoading || hoursLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-black uppercase tracking-wide">Branding & Content</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-2">
            Manage your logo, favicon, navigation, contact information, and footer content.
          </p>
        </div>

        {/* Company Name */}
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
              Company Name
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Your company name used throughout the system (emails, invoices, UI). Default: Urban Hub
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Input
                id="company_name"
                type="text"
                placeholder="Urban Hub"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="text-sm md:text-base"
              />
              <p className="text-xs text-muted-foreground">
                This name will appear in all emails, invoices, and throughout the portal.
              </p>
            </div>
            <Button
              onClick={() => saveSettingsMutation.mutate()}
              disabled={saveSettingsMutation.isPending}
              className="rounded-md uppercase tracking-wide text-xs md:text-sm h-9 md:h-10 px-4 md:px-6 gap-2"
            >
              {saveSettingsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span className="hidden sm:inline">Save Company Name</span>
                  <span className="sm:hidden">Save</span>
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* SEO & Social Media */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
              SEO & Social Media
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Meta tags for search engines and social media sharing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="meta_description" className="text-sm font-medium">
                Meta Description
              </Label>
              <Textarea
                id="meta_description"
                placeholder="Modern student accommodation. Book your studio apartment for the academic year. Premium amenities and convenient location."
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                className="text-sm md:text-base min-h-[80px]"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                This description appears in search engine results and when sharing on social media. Keep it under 160 characters for best results.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="twitter_handle" className="text-sm font-medium">
                Twitter Handle
              </Label>
              <Input
                id="twitter_handle"
                type="text"
                placeholder="@UrbanHubBooking"
                value={twitterHandle}
                onChange={(e) => setTwitterHandle(e.target.value)}
                className="text-sm md:text-base"
              />
              <p className="text-xs text-muted-foreground">
                Your Twitter/X handle (e.g., @YourCompany). Used in Twitter Card meta tags.
              </p>
            </div>
            <Button
              onClick={() => saveSettingsMutation.mutate()}
              disabled={saveSettingsMutation.isPending}
              className="rounded-md uppercase tracking-wide text-xs md:text-sm h-9 md:h-10 px-4 md:px-6 gap-2"
            >
              {saveSettingsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span className="hidden sm:inline">Save SEO Settings</span>
                  <span className="sm:hidden">Save</span>
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Logo & Favicon */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">Brand Assets</CardTitle>
            <CardDescription className="text-xs md:text-sm">Upload your logo and favicon</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Logo</Label>
                <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4">
                  {logoPath && (
                    <img
                      src={logoPath}
                      alt="Logo"
                      className="h-12 md:h-16 w-auto object-contain border rounded-lg p-2 flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 w-full">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      disabled={uploadingLogo}
                      className="cursor-pointer rounded-xl text-xs md:text-sm"
                    />
                  </div>
                  {uploadingLogo && <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground">
                  Recommended: WebP or PNG, transparent background, max 2MB
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Favicon</Label>
                <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4">
                  {faviconPath && (
                    <img
                      src={faviconPath}
                      alt="Favicon"
                      className="h-12 md:h-16 w-12 md:w-16 object-contain border rounded-lg p-2 flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 w-full">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleFaviconUpload}
                      disabled={uploadingFavicon}
                      className="cursor-pointer rounded-xl text-xs md:text-sm"
                    />
                  </div>
                  {uploadingFavicon && <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground">
                  Recommended: PNG or ICO, 32x32 or 64x64 pixels, max 500KB
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Studio Catalog Hero Image</Label>
              <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4">
                {heroImagePath && (
                  <div className="relative h-32 md:h-48 w-full md:w-auto md:min-w-[200px] border rounded-lg overflow-hidden flex-shrink-0">
                    <img
                      src={heroImagePath}
                      alt="Hero Image"
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 w-full">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleHeroImageUpload}
                    disabled={uploadingHeroImage}
                    className="cursor-pointer rounded-xl text-xs md:text-sm"
                  />
                </div>
                {uploadingHeroImage && <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground">
                Recommended: WebP or JPG, landscape orientation, 1920x1080 or higher, max 5MB
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Amenities video</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Video shown in the Amenities section on studio pages. Upload here to avoid loading from external URLs (fixes Content Security Policy errors).
              </p>
              <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4">
                {amenitiesVideoPath && (
                  <div className="relative w-full md:w-64 aspect-video bg-muted rounded-lg overflow-hidden flex-shrink-0">
                    <video
                      src={amenitiesVideoPath}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  </div>
                )}
                <div className="flex-1 w-full space-y-2">
                  <Input
                    type="url"
                    placeholder="Or paste video URL (e.g. https://...mp4)"
                    value={amenitiesVideoPath}
                    onChange={(e) => setAmenitiesVideoPath(e.target.value)}
                    className="rounded-xl text-xs md:text-sm"
                  />
                  <Input
                    type="file"
                    accept="video/mp4,video/webm,video/ogg"
                    onChange={handleAmenitiesVideoUpload}
                    disabled={uploadingAmenitiesVideo}
                    className="cursor-pointer rounded-xl text-xs md:text-sm"
                  />
                </div>
                {uploadingAmenitiesVideo && <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground">
                Paste a URL and click Save, or upload a file (MP4/WebM/OGG, max 100MB). Uploaded files are served from your storage to avoid CSP issues.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Colors & Fonts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
              Colors & Fonts
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Customize your brand colors and typography. Changes will apply to PDFs, emails, and UI.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Primary Colors */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide">Primary Colors</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Primary Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={colors.color_primary || "#E63946"}
                      onChange={(e) => setColors({ ...colors, color_primary: e.target.value })}
                      className="w-20 h-10 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={colors.color_primary || "#E63946"}
                      onChange={(e) => setColors({ ...colors, color_primary: e.target.value })}
                      placeholder="#E63946"
                      className="flex-1 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Primary Text Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={colors.color_primary_foreground || "#FFFFFF"}
                      onChange={(e) => setColors({ ...colors, color_primary_foreground: e.target.value })}
                      className="w-20 h-10 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={colors.color_primary_foreground || "#FFFFFF"}
                      onChange={(e) => setColors({ ...colors, color_primary_foreground: e.target.value })}
                      placeholder="#FFFFFF"
                      className="flex-1 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Secondary Colors */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide">Secondary Colors</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Secondary Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={colors.color_secondary || "#FAFAFA"}
                      onChange={(e) => setColors({ ...colors, color_secondary: e.target.value })}
                      className="w-20 h-10 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={colors.color_secondary || "#FAFAFA"}
                      onChange={(e) => setColors({ ...colors, color_secondary: e.target.value })}
                      placeholder="#FAFAFA"
                      className="flex-1 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Secondary Text Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={colors.color_secondary_foreground || "#000000"}
                      onChange={(e) => setColors({ ...colors, color_secondary_foreground: e.target.value })}
                      className="w-20 h-10 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={colors.color_secondary_foreground || "#000000"}
                      onChange={(e) => setColors({ ...colors, color_secondary_foreground: e.target.value })}
                      placeholder="#000000"
                      className="flex-1 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Accent Colors */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide">Accent Colors</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Accent Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={colors.color_accent || "#FFD60A"}
                      onChange={(e) => setColors({ ...colors, color_accent: e.target.value })}
                      className="w-20 h-10 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={colors.color_accent || "#FFD60A"}
                      onChange={(e) => setColors({ ...colors, color_accent: e.target.value })}
                      placeholder="#FFD60A"
                      className="flex-1 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Accent Text Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={colors.color_accent_foreground || "#000000"}
                      onChange={(e) => setColors({ ...colors, color_accent_foreground: e.target.value })}
                      className="w-20 h-10 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={colors.color_accent_foreground || "#000000"}
                      onChange={(e) => setColors({ ...colors, color_accent_foreground: e.target.value })}
                      placeholder="#000000"
                      className="flex-1 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Success Color (for Fully Paid stamp) */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide">Success Color</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Success Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={colors.color_success || "#10B981"}
                      onChange={(e) => setColors({ ...colors, color_success: e.target.value })}
                      className="w-20 h-10 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={colors.color_success || "#10B981"}
                      onChange={(e) => setColors({ ...colors, color_success: e.target.value })}
                      placeholder="#10B981"
                      className="flex-1 rounded-xl text-sm font-mono"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Used for "Fully Paid" stamp and success badges</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Success Text Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={colors.color_success_foreground || "#FFFFFF"}
                      onChange={(e) => setColors({ ...colors, color_success_foreground: e.target.value })}
                      className="w-20 h-10 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={colors.color_success_foreground || "#FFFFFF"}
                      onChange={(e) => setColors({ ...colors, color_success_foreground: e.target.value })}
                      placeholder="#FFFFFF"
                      className="flex-1 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Destructive Colors */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide">Destructive/Error Colors</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Destructive Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={colors.color_destructive || "#EF4444"}
                      onChange={(e) => setColors({ ...colors, color_destructive: e.target.value })}
                      className="w-20 h-10 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={colors.color_destructive || "#EF4444"}
                      onChange={(e) => setColors({ ...colors, color_destructive: e.target.value })}
                      placeholder="#EF4444"
                      className="flex-1 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Destructive Text Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={colors.color_destructive_foreground || "#F8FAFC"}
                      onChange={(e) => setColors({ ...colors, color_destructive_foreground: e.target.value })}
                      className="w-20 h-10 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={colors.color_destructive_foreground || "#F8FAFC"}
                      onChange={(e) => setColors({ ...colors, color_destructive_foreground: e.target.value })}
                      placeholder="#F8FAFC"
                      className="flex-1 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Muted Colors */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide">Muted Colors</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Muted Background</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={colors.color_muted || "#F1F5F9"}
                      onChange={(e) => setColors({ ...colors, color_muted: e.target.value })}
                      className="w-20 h-10 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={colors.color_muted || "#F1F5F9"}
                      onChange={(e) => setColors({ ...colors, color_muted: e.target.value })}
                      placeholder="#F1F5F9"
                      className="flex-1 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Muted Text Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={colors.color_muted_foreground || "#64748B"}
                      onChange={(e) => setColors({ ...colors, color_muted_foreground: e.target.value })}
                      className="w-20 h-10 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={colors.color_muted_foreground || "#64748B"}
                      onChange={(e) => setColors({ ...colors, color_muted_foreground: e.target.value })}
                      placeholder="#64748B"
                      className="flex-1 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Background & Foreground */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide">Background & Foreground</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Background Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={colors.color_background || "#FFFFFF"}
                      onChange={(e) => setColors({ ...colors, color_background: e.target.value })}
                      className="w-20 h-10 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={colors.color_background || "#FFFFFF"}
                      onChange={(e) => setColors({ ...colors, color_background: e.target.value })}
                      placeholder="#FFFFFF"
                      className="flex-1 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Foreground (Text) Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={colors.color_foreground || "#000000"}
                      onChange={(e) => setColors({ ...colors, color_foreground: e.target.value })}
                      className="w-20 h-10 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={colors.color_foreground || "#000000"}
                      onChange={(e) => setColors({ ...colors, color_foreground: e.target.value })}
                      placeholder="#000000"
                      className="flex-1 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Border & Card Colors */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide">Border & Card Colors</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Border Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={colors.color_border || "#E2E8F0"}
                      onChange={(e) => setColors({ ...colors, color_border: e.target.value })}
                      className="w-20 h-10 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={colors.color_border || "#E2E8F0"}
                      onChange={(e) => setColors({ ...colors, color_border: e.target.value })}
                      placeholder="#E2E8F0"
                      className="flex-1 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Card Background</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={colors.color_card || "#FFFFFF"}
                      onChange={(e) => setColors({ ...colors, color_card: e.target.value })}
                      className="w-20 h-10 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={colors.color_card || "#FFFFFF"}
                      onChange={(e) => setColors({ ...colors, color_card: e.target.value })}
                      placeholder="#FFFFFF"
                      className="flex-1 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Card Text Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={colors.color_card_foreground || "#000000"}
                      onChange={(e) => setColors({ ...colors, color_card_foreground: e.target.value })}
                      className="w-20 h-10 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={colors.color_card_foreground || "#000000"}
                      onChange={(e) => setColors({ ...colors, color_card_foreground: e.target.value })}
                      placeholder="#000000"
                      className="flex-1 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Fonts */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide">Typography</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Body Font</Label>
                  <Input
                    type="text"
                    value={fonts.font_family_body || "Inter Tight"}
                    onChange={(e) => setFonts({ ...fonts, font_family_body: e.target.value })}
                    placeholder="Inter Tight"
                    className="rounded-xl text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Used for main content</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Display Font</Label>
                  <Input
                    type="text"
                    value={fonts.font_family_display || "Big Shoulders Display"}
                    onChange={(e) => setFonts({ ...fonts, font_family_display: e.target.value })}
                    placeholder="Big Shoulders Display"
                    className="rounded-xl text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Used for headings and titles</p>
                </div>
              </div>
            </div>

            <Button
              onClick={() => saveSettingsMutation.mutate()}
              disabled={saveSettingsMutation.isPending}
              className="rounded-md uppercase tracking-wide text-xs md:text-sm h-9 md:h-10 px-4 md:px-6 gap-2"
            >
              {saveSettingsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span className="hidden sm:inline">Save Colors & Fonts</span>
                  <span className="sm:hidden">Save</span>
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">Contact Information</CardTitle>
            <CardDescription className="text-xs md:text-sm">Update contact details displayed in the footer</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium">Phone Number</Label>
                <Input
                  id="phone"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+44 123 456 7890"
                  className="rounded-xl text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="info@urbanhub.uk"
                  className="rounded-xl text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address1" className="text-sm font-medium">Address Line 1</Label>
              <Input
                id="address1"
                value={contactAddress1}
                onChange={(e) => setContactAddress1(e.target.value)}
                placeholder="123 Student Street"
                className="rounded-xl text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address2" className="text-sm font-medium">Address Line 2</Label>
              <Input
                id="address2"
                value={contactAddress2}
                onChange={(e) => setContactAddress2(e.target.value)}
                placeholder="City Centre"
                className="rounded-xl text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address3" className="text-sm font-medium">Address Line 3 & Postcode</Label>
              <Input
                id="address3"
                value={contactAddress3}
                onChange={(e) => setContactAddress3(e.target.value)}
                placeholder="Preston, PR1 1AA"
                className="rounded-xl text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emergency" className="text-sm font-medium">Emergency Contact Note</Label>
              <Input
                id="emergency"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="Emergency contact available 24/7"
                className="rounded-xl text-sm"
              />
            </div>
            <Button
              onClick={() => saveSettingsMutation.mutate()}
              disabled={saveSettingsMutation.isPending}
              className="rounded-md uppercase tracking-wide text-xs md:text-sm h-9 md:h-10 px-4 md:px-6 gap-2"
            >
              {saveSettingsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span className="hidden sm:inline">Save Contact Info</span>
                  <span className="sm:hidden">Save</span>
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Header Navigation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">Header Navigation</CardTitle>
            <CardDescription className="text-xs md:text-sm">Manage navigation items in the header menu</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {headerNavItemsState.map((item, index) => (
              <div key={item.id} className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4 p-3 md:p-4 border rounded-xl">
                <GripVertical className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                  <Input
                    value={item.title}
                    onChange={(e) => {
                      const updated = [...headerNavItemsState];
                      updated[index].title = e.target.value;
                      setHeaderNavItemsState(updated);
                    }}
                    placeholder="Menu Title"
                    className="rounded-xl text-sm"
                  />
                  <Input
                    value={item.url}
                    onChange={(e) => {
                      const updated = [...headerNavItemsState];
                      updated[index].url = e.target.value;
                      setHeaderNavItemsState(updated);
                    }}
                    placeholder="URL"
                    className="rounded-xl text-sm"
                  />
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={item.is_active}
                        onCheckedChange={(checked) => {
                          const updated = [...headerNavItemsState];
                          updated[index].is_active = checked;
                          setHeaderNavItemsState(updated);
                        }}
                      />
                      <Label className="text-xs md:text-sm font-medium">Active</Label>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteNavItemId(item.id)}
                      className="rounded-md h-7 w-7 p-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button 
                variant="outline" 
                onClick={() => addNavItem("header")}
                className="rounded-md uppercase tracking-wide text-xs h-9 px-4 gap-2"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add Header Item</span>
                <span className="sm:hidden">Add</span>
              </Button>
              <Button
                onClick={() => {
                  const payload: [NavigationItem[], "header" | "footer"] = [headerNavItemsState, "header"];
                  saveNavItemsMutation.mutate(payload);
                }}
                disabled={saveNavItemsMutation.isPending}
                className="rounded-md uppercase tracking-wide text-xs h-9 px-4 gap-2"
              >
                {saveNavItemsMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="hidden sm:inline">Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span className="hidden sm:inline">Save Header Navigation</span>
                    <span className="sm:hidden">Save</span>
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Footer Navigation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">Footer Quick Links</CardTitle>
            <CardDescription className="text-xs md:text-sm">Manage quick links in the footer</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {footerNavItemsState.map((item, index) => (
              <div key={item.id} className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4 p-3 md:p-4 border rounded-xl">
                <GripVertical className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                  <Input
                    value={item.title}
                    onChange={(e) => {
                      const updated = [...footerNavItemsState];
                      updated[index].title = e.target.value;
                      setFooterNavItemsState(updated);
                    }}
                    placeholder="Link Title"
                    className="rounded-xl text-sm"
                  />
                  <Input
                    value={item.url}
                    onChange={(e) => {
                      const updated = [...footerNavItemsState];
                      updated[index].url = e.target.value;
                      setFooterNavItemsState(updated);
                    }}
                    placeholder="URL"
                    className="rounded-xl text-sm"
                  />
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={item.is_active}
                        onCheckedChange={(checked) => {
                          const updated = [...footerNavItemsState];
                          updated[index].is_active = checked;
                          setFooterNavItemsState(updated);
                        }}
                      />
                      <Label className="text-xs md:text-sm font-medium">Active</Label>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteNavItemId(item.id)}
                      className="rounded-md h-7 w-7 p-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button 
                variant="outline" 
                onClick={() => addNavItem("footer")}
                className="rounded-md uppercase tracking-wide text-xs h-9 px-4 gap-2"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add Footer Link</span>
                <span className="sm:hidden">Add</span>
              </Button>
              <Button
                onClick={() => {
                  const payload: [NavigationItem[], "header" | "footer"] = [footerNavItemsState, "footer"];
                  saveNavItemsMutation.mutate(payload);
                }}
                disabled={saveNavItemsMutation.isPending}
                className="rounded-md uppercase tracking-wide text-xs h-9 px-4 gap-2"
              >
                {saveNavItemsMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="hidden sm:inline">Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span className="hidden sm:inline">Save Footer Links</span>
                    <span className="sm:hidden">Save</span>
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Opening Hours */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">Opening Hours</CardTitle>
            <CardDescription className="text-xs md:text-sm">Set opening hours for each day of the week. Use bulk edit to set multiple days at once.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Bulk Edit Section */}
            <div className="p-4 border rounded-xl bg-muted/40 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-sm font-display font-bold uppercase tracking-wide mb-2">Bulk Edit</h3>
                  <p className="text-xs text-muted-foreground">Select multiple days and apply the same hours</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const weekdays = openingHoursState.filter(h => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(h.day_name));
                      setSelectedDays(weekdays.map(h => h.id));
                    }}
                    className="rounded-md uppercase tracking-wide text-xs h-8 px-3 gap-2"
                  >
                    Select Weekdays
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const weekend = openingHoursState.filter(h => ['Saturday', 'Sunday'].includes(h.day_name));
                      setSelectedDays(weekend.map(h => h.id));
                    }}
                    className="rounded-md uppercase tracking-wide text-xs h-8 px-3 gap-2"
                  >
                    Select Weekend
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedDays([])}
                    className="rounded-md uppercase tracking-wide text-xs h-8 px-3 gap-2"
                  >
                    Clear
                  </Button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {openingHoursState.map((hour) => (
                  <button
                    key={hour.id}
                    type="button"
                    onClick={() => {
                      if (selectedDays.includes(hour.id)) {
                        setSelectedDays(selectedDays.filter(id => id !== hour.id));
                      } else {
                        setSelectedDays([...selectedDays, hour.id]);
                      }
                    }}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium transition-colors ${
                      selectedDays.includes(hour.id)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted border-border'
                    }`}
                  >
                    {selectedDays.includes(hour.id) ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    {hour.day_name.slice(0, 3)}
                  </button>
                ))}
              </div>

              {selectedDays.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Status</Label>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!bulkIsClosed}
                        onCheckedChange={(checked) => setBulkIsClosed(!checked)}
                      />
                      <Label className="text-xs font-medium">{bulkIsClosed ? 'Closed' : 'Open'}</Label>
                    </div>
                  </div>
                  {!bulkIsClosed && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Open Time</Label>
                        <Input
                          type="time"
                          value={bulkOpenTime}
                          onChange={(e) => setBulkOpenTime(e.target.value)}
                          className="rounded-xl text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Close Time</Label>
                        <Input
                          type="time"
                          value={bulkCloseTime}
                          onChange={(e) => setBulkCloseTime(e.target.value)}
                          className="rounded-xl text-sm"
                        />
                      </div>
                    </>
                  )}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Special Note</Label>
                    <Input
                      value={bulkSpecialNote}
                      onChange={(e) => setBulkSpecialNote(e.target.value)}
                      placeholder="Optional"
                      className="rounded-xl text-sm"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      onClick={() => {
                        const updated = openingHoursState.map(hour => {
                          if (selectedDays.includes(hour.id)) {
                            return {
                              ...hour,
                              is_closed: bulkIsClosed,
                              open_time: bulkIsClosed ? null : bulkOpenTime,
                              close_time: bulkIsClosed ? null : bulkCloseTime,
                              special_note: bulkSpecialNote || null,
                            };
                          }
                          return hour;
                        });
                        setOpeningHoursState(updated);
                        setSelectedDays([]);
                        setBulkOpenTime("");
                        setBulkCloseTime("");
                        setBulkIsClosed(false);
                        setBulkSpecialNote("");
                        toast({
                          title: "Hours applied",
                          description: `Applied to ${selectedDays.length} day(s)`,
                        });
                      }}
                      disabled={!bulkIsClosed && (!bulkOpenTime || !bulkCloseTime)}
                      className="rounded-md uppercase tracking-wide text-xs h-9 px-4 gap-2 w-full"
                    >
                      Apply to Selected ({selectedDays.length})
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Individual Day Editing - Compact View */}
            <div className="space-y-2">
              <h3 className="text-sm font-display font-bold uppercase tracking-wide">Individual Days</h3>
              <div className="grid grid-cols-1 gap-2">
                {openingHoursState.map((hour, index) => (
                  <div key={hour.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 p-2 sm:p-3 border rounded-lg">
                    <div className="w-24 sm:w-28 text-xs sm:text-sm font-medium font-display flex-shrink-0">
                      {hour.day_name}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        checked={!hour.is_closed}
                        onCheckedChange={(checked) => {
                          const updated = [...openingHoursState];
                          updated[index].is_closed = !checked;
                          setOpeningHoursState(updated);
                        }}
                      />
                      <Label className="text-xs font-medium whitespace-nowrap">{hour.is_closed ? 'Closed' : 'Open'}</Label>
                    </div>
                    {!hour.is_closed && (
                      <div className="flex-1 flex flex-wrap items-center gap-2">
                        <Input
                          type="time"
                          value={hour.open_time || ""}
                          onChange={(e) => {
                            const updated = [...openingHoursState];
                            updated[index].open_time = e.target.value;
                            setOpeningHoursState(updated);
                          }}
                          className="rounded-xl text-xs sm:text-sm h-8 w-24 sm:w-28"
                        />
                        <span className="text-xs text-muted-foreground">-</span>
                        <Input
                          type="time"
                          value={hour.close_time || ""}
                          onChange={(e) => {
                            const updated = [...openingHoursState];
                            updated[index].close_time = e.target.value;
                            setOpeningHoursState(updated);
                          }}
                          className="rounded-xl text-xs sm:text-sm h-8 w-24 sm:w-28"
                        />
                        <Input
                          value={hour.special_note || ""}
                          onChange={(e) => {
                            const updated = [...openingHoursState];
                            updated[index].special_note = e.target.value;
                            setOpeningHoursState(updated);
                          }}
                          placeholder="Note (optional)"
                          className="rounded-xl text-xs sm:text-sm h-8 flex-1 min-w-[120px]"
                        />
                      </div>
                    )}
                    {hour.is_closed && (
                      <div className="flex-1">
                        <Input
                          value={hour.special_note || ""}
                          onChange={(e) => {
                            const updated = [...openingHoursState];
                            updated[index].special_note = e.target.value;
                            setOpeningHoursState(updated);
                          }}
                          placeholder="Note (e.g., Emergency contact available 24/7)"
                          className="rounded-xl text-xs sm:text-sm h-8"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            <Button
              onClick={() => saveHoursMutation.mutate(openingHoursState)}
              disabled={saveHoursMutation.isPending}
              className="rounded-md uppercase tracking-wide text-xs md:text-sm h-9 md:h-10 px-4 md:px-6 gap-2 w-full sm:w-auto"
            >
              {saveHoursMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span className="hidden sm:inline">Save Opening Hours</span>
                  <span className="sm:hidden">Save</span>
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Footer Content */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">Footer Content</CardTitle>
            <CardDescription className="text-xs md:text-sm">Manage footer description and copyright text</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="footer-desc" className="text-sm font-medium">Footer Description</Label>
              <Textarea
                id="footer-desc"
                value={footerDescription}
                onChange={(e) => setFooterDescription(e.target.value)}
                placeholder="Premium student accommodation designed for modern living and academic success."
                rows={3}
                className="rounded-xl min-h-[80px] text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="footer-copyright" className="text-sm font-medium">Copyright Text</Label>
              <Input
                id="footer-copyright"
                value={footerCopyright}
                onChange={(e) => setFooterCopyright(e.target.value)}
                placeholder={`${settings?.company_name || "Urban Hub"}. All rights reserved.`}
                className="rounded-xl text-sm"
              />
              <p className="text-xs text-muted-foreground">
                The current year will be automatically added (e.g., `© 2025 ${settings?.company_name || "Urban Hub"}. All rights reserved.`)
              </p>
            </div>
            <Button
              onClick={() => saveSettingsMutation.mutate()}
              disabled={saveSettingsMutation.isPending}
              className="rounded-md uppercase tracking-wide text-xs md:text-sm h-9 md:h-10 px-4 md:px-6 gap-2"
            >
              {saveSettingsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span className="hidden sm:inline">Save Footer Content</span>
                  <span className="sm:hidden">Save</span>
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteNavItemId} onOpenChange={(open) => !open && setDeleteNavItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Navigation Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this navigation item? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteNavItem} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default Branding;

