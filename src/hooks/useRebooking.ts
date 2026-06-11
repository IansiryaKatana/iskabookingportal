import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { copyApplicationJourneyFromSource } from "@/utils/copyApplicationJourney";

export type RebookingCheck = {
  can_rebook: boolean;
  previous_application_id: string | null;
  previous_contract_name: string | null;
  previous_academic_year: string | null;
  message: string;
};

export type RebookingData = {
  step1_data: Record<string, any> | null;
  step2_data: Record<string, any> | null;
  step3_data: Record<string, any> | null;
  step4_data: Record<string, any> | null;
  step5_data: Record<string, any> | null;
};

/**
 * Check if student can rebook for a contract
 */
export const useCanRebook = (contractId: string | undefined) => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ["can-rebook", user?.id, contractId],
    queryFn: async () => {
      if (!user?.id || !contractId) return null;

      const { data, error } = await supabase
        .rpc("can_student_rebook", {
          p_user_id: user.id,
          p_contract_id: contractId,
        });

      if (error) {
        console.error("Rebooking check error:", error);
        throw error;
      }
      
      if (import.meta.env.DEV) console.log("Rebooking check result:", { data, firstItem: data?.[0] });
      return (data?.[0] || null) as RebookingCheck | null;
    },
    enabled: !!user?.id && !!contractId,
  });
};

/**
 * Resolve which application supplies journey pre-fill data (rebooker or extension).
 */
export const resolveApplicationPrefillSourceId = (application: {
  is_rebooking?: boolean | null;
  previous_application_id?: string | null;
  extension_of_application_id?: string | null;
} | null | undefined): string | null => {
  if (!application) return null;
  if (application.is_rebooking && application.previous_application_id) {
    return application.previous_application_id;
  }
  if (application.extension_of_application_id) {
    return application.extension_of_application_id;
  }
  return null;
};

/**
 * Get journey step data from a source application (rebooker or extension pre-fill).
 */
export const useRebookingData = (sourceApplicationId: string | null) => {
  return useQuery({
    queryKey: ["rebooking-data", sourceApplicationId],
    queryFn: async () => {
      if (!sourceApplicationId) return null;

      const { data, error } = await supabase
        .rpc("get_rebooking_data", {
          p_previous_application_id: sourceApplicationId,
        });

      if (error) throw error;
      return (data?.[0] || null) as RebookingData | null;
    },
    enabled: !!sourceApplicationId,
  });
};

/**
 * Mark application as rebooking
 */
export const useMarkAsRebooking = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      applicationId,
      previousApplicationId,
      reason,
    }: {
      applicationId: string;
      previousApplicationId: string;
      reason?: string;
    }) => {
      const { error } = await supabase
        .from("student_applications")
        .update({
          is_rebooking: true,
          booking_source: "rebooker",
          previous_application_id: previousApplicationId,
          rebooking_reason: reason || null,
        })
        .eq("id", applicationId);

      if (error) throw error;

      await copyApplicationJourneyFromSource(applicationId, previousApplicationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-application"] });
      toast({
        title: "Application marked as rebooking",
        description: "Your previous application data will be used to pre-fill this form.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

