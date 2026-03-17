import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type DiscountCampaign = {
  id: string;
  name: string;
  description: string | null;
  discount_amount: number;
  amount_type: "fixed" | "percentage";
  applies_to: "all" | "new" | "rebooking" | "staff_assigned";
  booking_source: string | null;
  start_date: string;
  end_date: string;
  is_active: boolean;
  max_uses: number | null;
  current_uses: number;
  academic_year_id: string | null;
  academic_year?: {
    id: string;
    name: string;
  } | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationDiscount = {
  id: string;
  application_id: string;
  campaign_id: string;
  discount_amount: number;
  applied_at: string;
  campaign?: DiscountCampaign;
};

/**
 * Get active discount campaigns
 */
export const useActiveDiscountCampaigns = (
  appliesTo?: "all" | "new" | "rebooking",
  academicYearId?: string | null
) => {
  return useQuery<DiscountCampaign[], Error>({
    queryKey: ["active-discount-campaigns", appliesTo, academicYearId],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      let campaigns: any[] = [];

      if (academicYearId) {
        const { data: yearCampaigns, error: yearError } = await supabase
          .from("discount_campaigns")
          .select("*")
          .eq("is_active", true)
          .lte("start_date", today)
          .gte("end_date", today)
          .eq("academic_year_id", academicYearId)
          .order("created_at", { ascending: false });

        const { data: allYearCampaigns, error: allYearError } = await supabase
          .from("discount_campaigns")
          .select("*")
          .eq("is_active", true)
          .lte("start_date", today)
          .gte("end_date", today)
          .is("academic_year_id", null)
          .order("created_at", { ascending: false });

        if (yearError) console.error("Error fetching year discount campaigns:", yearError);
        if (allYearError) console.error("Error fetching all-year discount campaigns:", allYearError);
        campaigns = [...(yearCampaigns || []), ...(allYearCampaigns || [])];
      } else {
        const { data, error } = await supabase
          .from("discount_campaigns")
          .select("*")
          .eq("is_active", true)
          .lte("start_date", today)
          .gte("end_date", today)
          .order("created_at", { ascending: false });

        if (error) throw error;
        campaigns = data || [];
      }

      if (appliesTo) {
        // For staff flows (e.g. admin Application Detail), we always want staff-assigned
        // campaigns to be selectable, alongside the usual "all"/type-specific ones.
        campaigns = campaigns.filter(
          (c) =>
            c.applies_to === appliesTo ||
            c.applies_to === "all" ||
            c.applies_to === "staff_assigned",
        );
      }

      const availableCampaigns = campaigns.filter((c) => {
        if (c.max_uses != null) return c.current_uses < c.max_uses;
        return true;
      });

      const unique = availableCampaigns.filter(
        (campaign, index, self) => index === self.findIndex((c) => c.id === campaign.id)
      );

      const academicYearIds = [
        ...new Set(unique.map((c) => c.academic_year_id).filter((id): id is string => Boolean(id))),
      ];
      let academicYearsMap = new Map<string, { id: string; name: string }>();
      if (academicYearIds.length > 0) {
        const { data: years } = await supabase
          .from("academic_years")
          .select("id, name")
          .in("id", academicYearIds);
        if (years) years.forEach((year) => academicYearsMap.set(year.id, year));
      }

      return unique.map((campaign) => ({
        ...campaign,
        academic_year: campaign.academic_year_id
          ? academicYearsMap.get(campaign.academic_year_id) || null
          : null,
      })) as DiscountCampaign[];
    },
  });
};

/**
 * Check if application qualifies for a discount campaign
 */
export const useCheckDiscountEligibility = (applicationId?: string, campaignId?: string) => {
  return useQuery<boolean, Error>({
    queryKey: ["discount-eligibility", applicationId, campaignId],
    queryFn: async () => {
      if (!applicationId || !campaignId) return false;
      const { data, error } = await supabase.rpc("check_discount_eligibility", {
        p_application_id: applicationId,
        p_campaign_id: campaignId,
      });
      if (error) throw error;
      return (data as boolean) || false;
    },
    enabled: !!applicationId && !!campaignId,
  });
};

/**
 * Get discount for an application
 */
export const useApplicationDiscount = (applicationId?: string) => {
  return useQuery<ApplicationDiscount | null, Error>({
    queryKey: ["application-discount", applicationId],
    queryFn: async () => {
      if (!applicationId) return null;
      const { data, error } = await supabase
        .from("application_discounts")
        .select(`*, campaign:discount_campaigns(*)`)
        .eq("application_id", applicationId)
        .maybeSingle();
      if (error) throw error;
      return (data as ApplicationDiscount | null) || null;
    },
    enabled: !!applicationId,
  });
};

/**
 * Apply discount to an application (admin only)
 */
export const useApplyDiscount = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      applicationId,
      campaignId,
    }: {
      applicationId: string;
      campaignId: string;
    }) => {
      const { data, error } = await supabase.rpc("apply_discount_to_application", {
        p_application_id: applicationId,
        p_campaign_id: campaignId,
        p_applied_by: null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["application-discount", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["student-application", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["payment-summary", variables.applicationId] });
      toast({
        title: "Discount applied",
        description: "Discount has been successfully applied to the application.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to apply discount.",
        variant: "destructive",
      });
    },
  });
};

/**
 * Remove discount from an application (admin only)
 */
export const useRemoveDiscount = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ applicationId }: { applicationId: string }) => {
      const { error } = await supabase.rpc("remove_discount_from_application", {
        p_application_id: applicationId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["application-discount", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["student-application", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["payment-summary", variables.applicationId] });
      toast({
        title: "Discount removed",
        description: "Discount has been removed from the application.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove discount.",
        variant: "destructive",
      });
    },
  });
};
