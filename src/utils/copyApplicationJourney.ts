import { supabase } from "@/integrations/supabase/client";

/**
 * Copy steps 1-5 and documents from a source application onto a target
 * (rebooker or extension). No-op if the target already has steps.
 */
export async function copyApplicationJourneyFromSource(
  targetApplicationId: string,
  sourceApplicationId: string,
): Promise<{ copied: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("copy_application_journey_from_source", {
    p_target_application_id: targetApplicationId,
    p_source_application_id: sourceApplicationId,
  });

  if (error) {
    console.warn("copy_application_journey_from_source failed:", error);
    return { copied: false, error: error.message };
  }

  return { copied: Boolean(data) };
}
