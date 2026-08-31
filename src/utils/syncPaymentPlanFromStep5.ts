import { supabase } from "@/integrations/supabase/client";

export type SyncPaymentPlanFromStep5Result = {
  /** True when an RPC write filled a previously null selected_payment_plan_id */
  synced: boolean;
  /** Plan id now on the application (existing or newly synced), else null */
  planId: string | null;
};

/**
 * Progressive sync: if the application has no selected_payment_plan_id but step 5
 * already stores selected_plan_id, copy it via set_selected_payment_plan.
 * Never invents a plan when both are empty; never overwrites an existing plan.
 */
export async function syncPaymentPlanFromStep5(
  applicationId: string,
): Promise<SyncPaymentPlanFromStep5Result> {
  if (!applicationId) {
    return { synced: false, planId: null };
  }

  const { data: app, error: appError } = await supabase
    .from("student_applications")
    .select("selected_payment_plan_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (appError) {
    throw appError;
  }

  if (app?.selected_payment_plan_id) {
    return { synced: false, planId: app.selected_payment_plan_id };
  }

  const { data: step5, error: stepError } = await supabase
    .from("student_application_steps")
    .select("payload")
    .eq("application_id", applicationId)
    .eq("step_number", 5)
    .maybeSingle();

  if (stepError) {
    throw stepError;
  }

  const raw =
    step5?.payload && typeof step5.payload === "object"
      ? (step5.payload as Record<string, unknown>).selected_plan_id
      : null;

  const planId =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;

  if (!planId) {
    return { synced: false, planId: null };
  }

  const { error: rpcError } = await supabase.rpc("set_selected_payment_plan", {
    p_application_id: applicationId,
    p_plan_id: planId,
  });

  if (rpcError) {
    throw rpcError;
  }

  return { synced: true, planId };
}
