import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type CashbackCampaign = {
  id: string;
  name: string;
  description: string | null;
  cashback_amount: number;
  applies_to: "all" | "new" | "rebooking";
  start_date: string;
  end_date: string;
  is_active: boolean;
  max_uses: number | null;
  current_uses: number;
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
export const useActiveCashbackCampaigns = (appliesTo?: "all" | "new" | "rebooking") => {
  return useQuery<CashbackCampaign[], Error>({
    queryKey: ["active-cashback-campaigns", appliesTo],
    queryFn: async () => {
      let query = supabase
        .from("cashback_campaigns")
        .select("*")
        .eq("is_active", true)
        .lte("start_date", new Date().toISOString().split("T")[0])
        .gte("end_date", new Date().toISOString().split("T")[0])
        .order("created_at", { ascending: false });

      if (appliesTo) {
        query = query.or(`applies_to.eq.${appliesTo},applies_to.eq.all`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as CashbackCampaign[];
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

