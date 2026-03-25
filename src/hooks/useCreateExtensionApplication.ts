import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/utils/auditLog";

export type CreateExtensionPayload = {
  /** Original application being extended */
  originalApplicationId: string;
  /** Extension period in weeks */
  extensionWeeks: number;
  /** Extra extension days (0-6) */
  extensionDays?: number;
  /** Number of installments for the extension period */
  numInstallments: number;
  /** Start date of extension (default: day after original contract end) */
  extensionStartDate: string;
  /** Weekly price for extension (default: from original contract or studio grade) */
  weeklyPrice: number;
  /** Deposit for extension period (default: from original plan, often 0 for extension) */
  depositAmount: number;
  /** Student display name for contract/plan labels */
  studentDisplayName: string;
};

/**
 * Create a contract extension: new application linked to the original, with its own
 * custom contract (extension period) and payment plan. Original application is unchanged.
 */
async function createExtensionApplication(
  payload: CreateExtensionPayload
): Promise<{ applicationId: string; contractId: string; paymentPlanId: string }> {
  const {
    originalApplicationId,
    extensionWeeks,
    extensionDays = 0,
    numInstallments,
    extensionStartDate,
    weeklyPrice,
    depositAmount,
    studentDisplayName,
  } = payload;

  if (extensionWeeks < 1 || numInstallments < 1) {
    throw new Error("Extension weeks and number of installments must be at least 1.");
  }
  if (extensionDays < 0 || extensionDays > 6) {
    throw new Error("Extension days must be between 0 and 6.");
  }

  const start = new Date(extensionStartDate);
  if (Number.isNaN(start.getTime())) {
    throw new Error("Invalid extension start date.");
  }

  // Load original application with contract and plan
  const { data: originalApp, error: appError } = await supabase
    .from("student_applications")
    .select(
      `
      id,
      student_id,
      studio_grade_id,
      assigned_studio_id,
      contract_id,
      selected_payment_plan_id
    `
    )
    .eq("id", originalApplicationId)
    .single();

  if (appError || !originalApp) {
    throw new Error("Original application not found.");
  }

  // Original must not itself be an extension (one level only)
  const { data: originalRow } = await supabase
    .from("student_applications")
    .select("extension_of_application_id")
    .eq("id", originalApplicationId)
    .single();

  if ((originalRow as { extension_of_application_id?: string | null })?.extension_of_application_id) {
    throw new Error("Extensions can only be created from the original booking, not from another extension.");
  }

  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("id, academic_year_id, studio_grade_id, name, slug")
    .eq("id", originalApp.contract_id)
    .single();

  if (contractError || !contract) {
    throw new Error("Original contract not found.");
  }

  const academicYearId = contract.academic_year_id as string;
  const studioGradeId = contract.studio_grade_id as string;

  const totalExtensionDays = extensionWeeks * 7 + extensionDays;

  // Extension end date: start + (weeks * 7 + extra days)
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + totalExtensionDays);
  const contractEndStr = endDate.toISOString().slice(0, 10);

  const percentEach = 100 / numInstallments;
  const daysSpan = totalExtensionDays;
  const offsetStep = Math.floor(daysSpan / numInstallments);

  // 1) Create new payment plan for extension (installments only; deposit separate)
  const durationLabel = extensionDays > 0 ? `${extensionWeeks}w ${extensionDays}d` : `${extensionWeeks}w`;
  const planName = `Extension ${durationLabel} ${numInstallments} inst (${studentDisplayName})`;
  const { data: newPlan, error: planErr } = await supabase
    .from("payment_plans")
    .insert({
      academic_year_id: academicYearId,
      name: planName,
      description: `Contract extension: ${extensionWeeks} weeks${extensionDays > 0 ? ` ${extensionDays} days` : ""}, ${numInstallments} installments.`,
      deposit_amount: depositAmount,
      is_active: true,
      source_payment_plan_id: null,
      student_application_id: null,
    })
    .select("id")
    .single();

  if (planErr || !newPlan) {
    throw new Error(planErr?.message ?? "Failed to create extension payment plan.");
  }

  const newPlanId = newPlan.id;

  for (let i = 0; i < numInstallments; i++) {
    const sequence = i + 1;
    const dueDateOffsetDays = i * offsetStep;
    const percent = sequence === numInstallments ? 100 - (numInstallments - 1) * percentEach : percentEach;
    const { error: instErr } = await supabase
      .from("payment_plan_installments")
      .insert({
        payment_plan_id: newPlanId,
        sequence,
        label: `Instalment ${sequence}`,
        due_date: null,
        due_date_offset_days: dueDateOffsetDays,
        amount_type: "percentage",
        amount_value: Math.round(percent * 100) / 100,
      });

    if (instErr) {
      throw new Error(`Failed to create installment ${sequence}: ${instErr.message}`);
    }
  }

  // 2) Create new contract for extension period (student_application_id set after we create application)
  const baseSlug = typeof contract.slug === "string" ? contract.slug : "custom";
  const uniqueSlug = `extension-${baseSlug}-${originalApplicationId.slice(0, 8)}-${Date.now().toString(36)}`;
  const contractName = `Extension ${durationLabel} (${studentDisplayName})`;

  const { data: newContract, error: contractInsertErr } = await supabase
    .from("contracts")
    .insert({
      academic_year_id: academicYearId,
      studio_grade_id: studioGradeId,
      payment_plan_id: newPlanId,
      slug: uniqueSlug,
      name: contractName,
      summary: `Contract extension: ${extensionWeeks} weeks${extensionDays > 0 ? ` ${extensionDays} days` : ""} from ${extensionStartDate}.`,
      contract_start: extensionStartDate,
      contract_end: contractEndStr,
      weeks: extensionWeeks,
      extra_days: extensionDays,
      weekly_price_override: weeklyPrice,
      deposit_override: depositAmount > 0 ? depositAmount : null,
      cta_label: null,
      display_order: 999,
      is_active: true,
      source_contract_id: originalApp.contract_id,
      student_application_id: null,
      visible_on_portal: false,
    })
    .select("id")
    .single();

  if (contractInsertErr || !newContract) {
    throw new Error(contractInsertErr?.message ?? "Failed to create extension contract.");
  }

  const newContractId = newContract.id;

  const { error: linkErr } = await supabase
    .from("contract_payment_plans")
    .insert({
      contract_id: newContractId,
      payment_plan_id: newPlanId,
      display_order: 1,
    });

  if (linkErr) {
    throw new Error(`Failed to link plan to contract: ${linkErr.message}`);
  }

  const { error: backfillErr } = await supabase.rpc(
    "backfill_contract_payment_schedule_for_contract",
    { p_contract_id: newContractId, p_payment_plan_id: newPlanId }
  );

  if (backfillErr) {
    throw new Error(`Failed to generate payment schedule: ${backfillErr.message}`);
  }

  // 3) Create extension application
  const { data: newApp, error: appInsertErr } = await supabase
    .from("student_applications")
    .insert({
      student_id: originalApp.student_id,
      studio_grade_id: studioGradeId,
      contract_id: newContractId,
      assigned_studio_id: originalApp.assigned_studio_id ?? null,
      status: "draft",
      extension_of_application_id: originalApplicationId,
      selected_payment_plan_id: newPlanId,
    })
    .select("id")
    .single();

  if (appInsertErr || !newApp) {
    throw new Error(appInsertErr?.message ?? "Failed to create extension application.");
  }

  const newApplicationId = newApp.id;

  // 4) Tie contract and plan to this application (custom contract)
  await supabase
    .from("contracts")
    .update({ student_application_id: newApplicationId })
    .eq("id", newContractId);

  await supabase
    .from("payment_plans")
    .update({ student_application_id: newApplicationId })
    .eq("id", newPlanId);

  // 5) Set total_contract_value (no trigger on application insert)
  const { data: totalValue } = await supabase.rpc("calculate_contract_value", {
    p_contract_id: newContractId,
  });
  if (totalValue != null) {
    await supabase
      .from("student_applications")
      .update({ total_contract_value: totalValue })
      .eq("id", newApplicationId);
  }

  await logActivity({
    action: "create",
    entityType: "application",
    entityId: newApplicationId,
    payload: {
      extension_of_application_id: originalApplicationId,
      extension_weeks: extensionWeeks,
      extension_days: extensionDays,
      num_installments: numInstallments,
      contract_id: newContractId,
      payment_plan_id: newPlanId,
    },
  });

  return {
    applicationId: newApplicationId,
    contractId: newContractId,
    paymentPlanId: newPlanId,
  };
}

export function useCreateExtensionApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createExtensionApplication,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["student-application", variables.originalApplicationId] });
      queryClient.invalidateQueries({ queryKey: ["student-application-extensions", variables.originalApplicationId] });
      queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      queryClient.invalidateQueries({ queryKey: ["admin-contracts"] });
    },
  });
}
