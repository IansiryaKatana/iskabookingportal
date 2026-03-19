import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type CashbackCampaign = {
  id: string;
  name: string;
  description: string | null;
  cashback_amount: number;
  applies_to: "all" | "new" | "rebooking" | "staff_assigned";
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

export type ApplicationCashback = {
  id: string;
  application_id: string;
  campaign_id: string;
  cashback_amount: number;
  applied_at: string;
  campaign?: CashbackCampaign;
};

/**
 * Get active cashback campaigns
 */
export const useActiveCashbackCampaigns = (
  appliesTo?: "all" | "new" | "rebooking",
  academicYearId?: string | null
) => {
  return useQuery<CashbackCampaign[], Error>({
    queryKey: ["active-cashback-campaigns", appliesTo, academicYearId],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      
      let campaigns: any[] = [];

      // Filter by academic year: show campaigns for the selected year OR campaigns with no academic year (applies to all)
      if (academicYearId) {
        // Use separate queries and combine results since .or() with null checks can be tricky
        const { data: yearCampaigns, error: yearError } = await supabase
          .from("cashback_campaigns")
          .select("*")
          .eq("is_active", true)
          .lte("start_date", today)
          .gte("end_date", today)
          .eq("academic_year_id", academicYearId)
          .order("created_at", { ascending: false });

        const { data: allYearCampaigns, error: allYearError } = await supabase
          .from("cashback_campaigns")
          .select("*")
          .eq("is_active", true)
          .lte("start_date", today)
          .gte("end_date", today)
          .is("academic_year_id", null)
          .order("created_at", { ascending: false });

        if (yearError) {
          console.error("Error fetching year campaigns:", yearError);
        }
        if (allYearError) {
          console.error("Error fetching all-year campaigns:", allYearError);
        }

        // Combine campaigns
        campaigns = [...(yearCampaigns || []), ...(allYearCampaigns || [])];
      } else {
        // No academic year filter - fetch all active campaigns
        const { data, error } = await supabase
          .from("cashback_campaigns")
          .select("*")
          .eq("is_active", true)
          .lte("start_date", today)
          .gte("end_date", today)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error fetching campaigns:", error);
          throw error;
        }
        campaigns = data || [];
      }

      // Apply appliesTo filter if needed
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

      // Filter out campaigns that have reached max uses
      const availableCampaigns = campaigns.filter((c) => {
        if (c.max_uses !== null && c.max_uses !== undefined) {
          return c.current_uses < c.max_uses;
        }
        return true; // No max uses limit
      });

      // Deduplicate
      const unique = availableCampaigns.filter((campaign, index, self) => 
        index === self.findIndex((c) => c.id === campaign.id)
      );

      // Fetch academic year names for campaigns that have academic_year_id
      const academicYearIds = [
        ...new Set(
          unique
            .map((c) => c.academic_year_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];

      let academicYearsMap = new Map<string, { id: string; name: string }>();
      if (academicYearIds.length > 0) {
        const { data: years, error: yearsError } = await supabase
          .from("academic_years")
          .select("id, name")
          .in("id", academicYearIds);

        if (yearsError) {
          console.error("Error fetching academic years:", yearsError);
        } else if (years) {
          years.forEach((year) => {
            academicYearsMap.set(year.id, year);
          });
        }
      }

      // Enrich campaigns with academic year data
      const enriched = unique.map((campaign) => ({
        ...campaign,
        academic_year: campaign.academic_year_id
          ? academicYearsMap.get(campaign.academic_year_id) || null
          : null,
      }));

      return enriched as CashbackCampaign[];
    },
  });
};

/**
 * Check if application qualifies for a cashback campaign
 */
export const useCheckCashbackEligibility = (applicationId?: string, campaignId?: string) => {
  return useQuery<boolean, Error>({
    queryKey: ["cashback-eligibility", applicationId, campaignId],
    queryFn: async () => {
      if (!applicationId || !campaignId) return false;

      const { data, error } = await supabase.rpc("check_cashback_eligibility", {
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
 * Get cashback for an application
 */
export const useApplicationCashback = (applicationId?: string) => {
  return useQuery<ApplicationCashback | null, Error>({
    queryKey: ["application-cashback", applicationId],
    queryFn: async () => {
      if (!applicationId) return null;

      const { data, error } = await supabase
        .from("application_cashbacks")
        .select(`
          *,
          campaign:cashback_campaigns(*)
        `)
        .eq("application_id", applicationId)
        .maybeSingle();

      if (error) throw error;
      return (data as ApplicationCashback | null) || null;
    },
    enabled: !!applicationId,
  });
};

/**
 * Apply cashback to an application (admin only)
 */
export const useApplyCashback = () => {
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
      const { data, error } = await supabase.rpc("apply_cashback_to_application", {
        p_application_id: applicationId,
        p_campaign_id: campaignId,
        p_applied_by: null, // Will be set by RLS/auth
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["application-cashback", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["student-application", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["payment-summary", variables.applicationId] });

      // Cashback changes adjusted totals used in accounting reports.
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable-report"] });
      queryClient.invalidateQueries({ queryKey: ["outstanding-balances-report"] });
      queryClient.invalidateQueries({ queryKey: ["deposit-installment-breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["fully-paid-students-report"] });
      toast({
        title: "Cashback applied",
        description: "Cashback has been successfully applied to the application.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to apply cashback.",
        variant: "destructive",
      });
    },
  });
};

/**
 * Remove cashback from an application (admin only)
 */
export const useRemoveCashback = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ applicationId }: { applicationId: string }) => {
      const { error } = await supabase.rpc("remove_cashback_from_application", {
        p_application_id: applicationId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["application-cashback", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["student-application", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["payment-summary", variables.applicationId] });

      // Cashback changes adjusted totals used in accounting reports.
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable-report"] });
      queryClient.invalidateQueries({ queryKey: ["outstanding-balances-report"] });
      queryClient.invalidateQueries({ queryKey: ["deposit-installment-breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["fully-paid-students-report"] });
      toast({
        title: "Cashback removed",
        description: "Cashback has been removed from the application.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove cashback.",
        variant: "destructive",
      });
    },
  });
};

