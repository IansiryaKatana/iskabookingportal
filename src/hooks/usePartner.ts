import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type PartnerReferralSummary = {
  application_id: string;
  student_first_name: string;
  student_last_name: string;
  contract_name: string;
  academic_year_name: string;
  total_contract_value: number;
  total_paid: number;
  remaining_balance: number;
  payment_status: string;
  commission_amount: number;
  commission_status: string;
  last_payment_date: string | null;
};

export type PartnerDashboardStats = {
  total_referrals: number;
  confirmed_applications: number;
  total_commission: number;
  paid_commission: number;
  pending_commission: number;
  total_contract_value: number;
};

/**
 * Get partner's own partner record
 */
export const usePartner = () => {
  const { profile } = useAuth();
  const partnerId = profile?.partner_id;

  return useQuery({
    queryKey: ["partner", partnerId],
    queryFn: async () => {
      if (!partnerId) return null;

      const { data, error } = await supabase
        .from("partners")
        .select("*")
        .eq("id", partnerId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!partnerId,
  });
};

/**
 * Get partner's referral payment summaries
 */
export const usePartnerReferrals = () => {
  const { profile } = useAuth();
  const partnerId = profile?.partner_id;

  return useQuery<PartnerReferralSummary[]>({
    queryKey: ["partner-referrals", partnerId],
    queryFn: async () => {
      if (!partnerId) return [];

      const { data, error } = await supabase.rpc("get_partner_referral_payment_summary", {
        p_partner_id: partnerId,
      });

      if (error) throw error;
      return (data || []) as PartnerReferralSummary[];
    },
    enabled: !!partnerId,
  });
};

/**
 * Get partner dashboard statistics
 */
export const usePartnerDashboardStats = () => {
  const { profile } = useAuth();
  const partnerId = profile?.partner_id;
  const { data: referrals, isLoading: referralsLoading } = usePartnerReferrals();

  return useQuery<PartnerDashboardStats>({
    queryKey: ["partner-dashboard-stats", partnerId, referrals],
    queryFn: async () => {
      if (!referrals || referrals.length === 0) {
        return {
          total_referrals: 0,
          confirmed_applications: 0,
          total_commission: 0,
          paid_commission: 0,
          pending_commission: 0,
          total_contract_value: 0,
        };
      }

      const confirmed = referrals.filter((r) => r.payment_status !== "unpaid");
      const paidCommissions = referrals
        .filter((r) => r.commission_status === "paid")
        .reduce((sum, r) => sum + Number(r.commission_amount), 0);
      const pendingCommissions = referrals
        .filter((r) => r.commission_status !== "paid")
        .reduce((sum, r) => sum + Number(r.commission_amount), 0);

      return {
        total_referrals: referrals.length,
        confirmed_applications: confirmed.length,
        total_commission: paidCommissions + pendingCommissions,
        paid_commission: paidCommissions,
        pending_commission: pendingCommissions,
        total_contract_value: referrals.reduce((sum, r) => sum + Number(r.total_contract_value), 0),
      };
    },
    enabled: !!partnerId && !referralsLoading && referrals !== undefined,
  });
};

