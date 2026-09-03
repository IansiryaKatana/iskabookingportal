import { supabase } from "@/integrations/supabase/client";

type BreakdownRow = {
  installment_id: string;
  sequence: number;
  label: string;
  payment_status: string;
  remaining_amount: number;
  amount_due: number;
  amount_paid: number;
};

function isDepositLabel(label: string | null | undefined): boolean {
  return String(label ?? "")
    .toLowerCase()
    .includes("deposit");
}

/**
 * Map a portal/request instalment id to contract_payment_schedule.id.
 * Students often submit payment_plan_installments.id; manual_payments.instalment_id
 * must reference contract_payment_schedule.
 */
export async function resolveScheduleInstalmentId(
  applicationId: string,
  instalmentId: string,
): Promise<string> {
  const { data: direct, error: directError } = await supabase
    .from("contract_payment_schedule")
    .select("id")
    .eq("id", instalmentId)
    .maybeSingle();
  if (directError) throw directError;
  if (direct?.id) return direct.id;

  const { data: planInst, error: planError } = await supabase
    .from("payment_plan_installments")
    .select("id, sequence, label, payment_plan_id")
    .eq("id", instalmentId)
    .maybeSingle();
  if (planError) throw planError;
  if (!planInst) {
    throw new Error("Instalment not found. Please refresh and try again.");
  }

  const { data: app, error: appError } = await supabase
    .from("student_applications")
    .select("contract_id, selected_payment_plan_id")
    .eq("id", applicationId)
    .single();
  if (appError) throw appError;
  if (!app?.contract_id) {
    throw new Error("Application has no contract; cannot link this instalment.");
  }

  const planId = app.selected_payment_plan_id ?? planInst.payment_plan_id;
  const { data: planRows, error: planRowsError } = await supabase
    .from("payment_plan_installments")
    .select("id, sequence, label")
    .eq("payment_plan_id", planId)
    .order("sequence", { ascending: true });
  if (planRowsError) throw planRowsError;

  const nonDepositPlan = (planRows ?? []).filter((row) => !isDepositLabel(row.label));
  const planIndex = nonDepositPlan.findIndex((row) => row.id === instalmentId);
  if (planIndex < 0) {
    throw new Error("Could not map this instalment to the contract schedule.");
  }

  const { data: scheduleRows, error: scheduleError } = await supabase
    .from("contract_payment_schedule")
    .select("id, sequence, label")
    .eq("contract_id", app.contract_id)
    .order("sequence", { ascending: true });
  if (scheduleError) throw scheduleError;

  const nonDepositSchedule = (scheduleRows ?? []).filter((row) => !isDepositLabel(row.label));
  const mapped = nonDepositSchedule[planIndex];
  if (!mapped?.id) {
    throw new Error("Contract schedule is missing this instalment. Contact support.");
  }
  return mapped.id;
}

/** Returns true when breakdown already marks this schedule instalment as fully paid. */
export async function isScheduleInstalmentAlreadyPaid(
  applicationId: string,
  scheduleInstalmentId: string,
): Promise<{ paid: boolean; label?: string; remaining?: number }> {
  const { data, error } = await supabase.rpc("get_installment_breakdown", {
    p_application_id: applicationId,
  });
  if (error) throw error;

  const rows = (data ?? []) as BreakdownRow[];
  const row = rows.find((r) => r.installment_id === scheduleInstalmentId);
  if (!row) return { paid: false };
  return {
    paid: row.payment_status === "paid",
    label: row.label,
    remaining: Number(row.remaining_amount),
  };
}
