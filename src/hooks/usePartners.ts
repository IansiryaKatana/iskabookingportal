import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type Partner = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  commission_percentage: number;
  referral_code: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PartnerReferral = {
  id: string;
  partner_id: string;
  application_id: string;
  referral_code: string | null;
  commission_percentage: number;
  total_contract_value: number;
  commission_amount: number;
  commission_status: "pending" | "approved" | "paid" | "cancelled";
  paid_at: string | null;
  paid_by: string | null;
  notes: string | null;
  partner?: Partner;
  created_at: string;
  updated_at: string;
};

/**
 * Get all partners
 */
export const usePartners = (activeOnly = false) => {
  return useQuery<Partner[], Error>({
    queryKey: ["partners", activeOnly],
    queryFn: async () => {
      let query = supabase.from("partners").select("*").order("name", { ascending: true });

      if (activeOnly) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as Partner[];
    },
  });
};

/**
 * Get partner referral for an application
 */
export const useApplicationPartnerReferral = (applicationId?: string) => {
  return useQuery<PartnerReferral | null, Error>({
    queryKey: ["partner-referral", applicationId],
    queryFn: async () => {
      if (!applicationId) return null;

      const { data, error } = await supabase
        .from("partner_referrals")
        .select(`
          *,
          partner:partners(*)
        `)
        .eq("application_id", applicationId)
        .maybeSingle();

      if (error) throw error;
      return (data as PartnerReferral | null) || null;
    },
    enabled: !!applicationId,
  });
};

/**
 * Create partner referral (admin only)
 */
export const useCreatePartnerReferral = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      applicationId,
      partnerId,
      referralCode,
    }: {
      applicationId: string;
      partnerId: string;
      referralCode?: string;
    }) => {
      const { data, error } = await supabase.rpc("create_partner_referral", {
        p_application_id: applicationId,
        p_partner_id: partnerId,
        p_referral_code: referralCode || null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["partner-referral", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["student-application", variables.applicationId] });
      toast({
        title: "Partner referral created",
        description: "Commission will be calculated when application is confirmed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create partner referral.",
        variant: "destructive",
      });
    },
  });
};

/**
 * Update partner referral commission status
 */
export const useUpdateCommissionStatus = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      referralId,
      status,
      notes,
    }: {
      referralId: string;
      status: "pending" | "approved" | "paid" | "cancelled";
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from("partner_referrals")
        .update({
          commission_status: status,
          notes: notes || null,
          paid_at: status === "paid" ? new Date().toISOString() : null,
        })
        .eq("id", referralId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["partner-referral", data.application_id] });
      queryClient.invalidateQueries({ queryKey: ["partner-referrals"] });
      toast({
        title: "Commission status updated",
        description: `Commission status changed to ${data.commission_status}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update commission status.",
        variant: "destructive",
      });
    },
  });
};

