import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ReferralCodeValidation = {
  is_valid: boolean;
  partner_id: string | null;
  partner_name: string | null;
  commission_percentage: number | null;
};

/**
 * Validate a referral code in real-time
 */
export const useValidateReferralCode = (code: string | null | undefined) => {
  return useQuery<ReferralCodeValidation | null>({
    queryKey: ["validate-referral-code", code],
    queryFn: async () => {
      if (!code || code.trim().length === 0) {
        return null; // Empty code is valid (optional field)
      }

      const normalizedCode = code.toUpperCase().trim();

      const { data, error } = await supabase.rpc("validate_referral_code", {
        p_code: normalizedCode,
      });

      if (error) {
        console.error("Error validating referral code:", error);
        console.error("Error details:", JSON.stringify(error, null, 2));
        return {
          is_valid: false,
          partner_id: null,
          partner_name: null,
          commission_percentage: null,
        };
      }

      if (!data || data.length === 0) {
        return {
          is_valid: false,
          partner_id: null,
          partner_name: null,
          commission_percentage: null,
        };
      }

      return data[0] as ReferralCodeValidation;
    },
    enabled: !!code && code.trim().length > 0,
    staleTime: 30000, // Cache for 30 seconds
  });
};

