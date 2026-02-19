import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/utils/auditLog";

const TOLERANCE = 0.01;

export type CustomInstallmentInput = {
  sequence: number;
  label: string;
  amount: number;
  due_date: string; // YYYY-MM-DD
};

export type CreateCustomContractPayload = {
  applicationId: string;
  studentDisplayName: string;
  installments: CustomInstallmentInput[];
};

/**
 * Check if application has any installment payments (manual or Stripe).
 * Customise schedule is only allowed when there are none.
 */
export async function applicationHasInstalmentPayments(
  applicationId: string
): Promise<boolean> {
  const { data: manual } = await supabase
    .from("manual_payments")
    .select("id")
    .eq("application_id", applicationId)
    .eq("payment_type", "instalment")
    .limit(1)
    .maybeSingle();

  if (manual) return true;

  const { data: stripePayments } = await supabase
    .from("stripe_payments")
    .select("id, metadata")
    .eq("student_application_id", applicationId)
    .in("status", ["succeeded", "completed"])
    .limit(50);

  const hasStripeInstalment = stripePayments?.some(
    (p) => p.metadata && typeof p.metadata === "object" && (p.metadata as { instalment_id?: string }).instalment_id
  );
  return hasStripeInstalment ?? false;
}

/**
 * Create a student-specific contract and payment plan from the current application's
 * contract/plan, with custom installment amounts. Updates the application to point
 * to the new contract and plan. Does not modify the original contract or plan.
 */
async function createCustomContractFromApplication(
  payload: CreateCustomContractPayload
): Promise<{ contractId: string; paymentPlanId: string }> {
  const { applicationId, studentDisplayName, installments } = payload;

  if (!installments.length) {
    throw new Error("At least one installment is required.");
  }

  const totalRequired = installments.reduce((s, i) => s + i.amount, 0);

  // Load application with contract and plan
  const { data: application, error: appError } = await supabase
    .from("student_applications")
    .select(
      `
      id,
      contract_id,
      selected_payment_plan_id,
      total_contract_value
    `
    )
    .eq("id", applicationId)
    .single();

  if (appError || !application) {
    throw new Error("Application not found.");
  }

  const contractId = application.contract_id as string;
  const planId = application.selected_payment_plan_id;
  if (!contractId || !planId) {
    throw new Error("Application must have a contract and payment plan selected.");
  }

  const totalContractValue = Number(application.total_contract_value ?? 0);
  if (totalContractValue <= 0) {
    throw new Error("Contract total value is missing or zero.");
  }

  if (Math.abs(totalRequired - totalContractValue) > TOLERANCE) {
    throw new Error(
      `Installment total £${totalRequired.toFixed(2)} must equal contract total £${totalContractValue.toFixed(2)}.`
    );
  }

  const hasPayments = await applicationHasInstalmentPayments(applicationId);
  if (hasPayments) {
    throw new Error(
      "Cannot customise schedule: this application already has installment payments recorded. Customise only before any installments are paid."
    );
  }

  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", contractId)
    .single();

  if (contractError || !contract) {
    throw new Error("Contract not found.");
  }

  const { data: sourcePlan, error: planError } = await supabase
    .from("payment_plans")
    .select("id, name, deposit_amount, academic_year_id")
    .eq("id", planId)
    .single();

  if (planError || !sourcePlan) {
    throw new Error("Payment plan not found.");
  }

  const academicYearId = sourcePlan.academic_year_id as string;
  const depositAmount = sourcePlan.deposit_amount ?? 0;

  // 1) Create new payment plan (custom installments as fixed amounts)
  const planName =
    sourcePlan.name && typeof sourcePlan.name === "string"
      ? `${sourcePlan.name} (${studentDisplayName})`
      : `Custom (${studentDisplayName})`;

  const { data: newPlan, error: insertPlanError } = await supabase
    .from("payment_plans")
    .insert({
      academic_year_id: academicYearId,
      name: planName,
      description: `Custom payment schedule for ${studentDisplayName}.`,
      deposit_amount: depositAmount,
      is_active: true,
      source_payment_plan_id: planId,
      student_application_id: applicationId,
    })
    .select("id")
    .single();

  if (insertPlanError || !newPlan) {
    throw new Error(insertPlanError?.message ?? "Failed to create payment plan.");
  }

  const newPlanId = newPlan.id;

  for (const inst of installments) {
    const { error: instError } = await supabase
      .from("payment_plan_installments")
      .insert({
        payment_plan_id: newPlanId,
        sequence: inst.sequence,
        label: inst.label || `Instalment ${inst.sequence}`,
        due_date: inst.due_date,
        due_date_offset_days: null,
        amount_type: "fixed",
        amount_value: Math.round(inst.amount * 100) / 100,
      });

    if (instError) {
      throw new Error(
        `Failed to create installment ${inst.sequence}: ${instError.message}`
      );
    }
  }

  // 2) Create new contract (clone with student-specific name/slug and links)
  const baseName =
    typeof contract.name === "string" ? contract.name : "Custom Contract";
  const newContractName = `${baseName} (${studentDisplayName})`;
  const baseSlug =
    typeof contract.slug === "string" ? contract.slug : "custom";
  const uniqueSlug = `${baseSlug}-${applicationId.slice(0, 8)}`;

  const { data: newContract, error: insertContractError } = await supabase
    .from("contracts")
    .insert({
      academic_year_id: contract.academic_year_id,
      studio_grade_id: contract.studio_grade_id,
      payment_plan_id: newPlanId,
      slug: uniqueSlug,
      name: newContractName,
      summary: contract.summary ?? null,
      contract_start: contract.contract_start,
      contract_end: contract.contract_end,
      weeks: contract.weeks,
      weekly_price_override: contract.weekly_price_override,
      deposit_override: contract.deposit_override,
      cta_label: contract.cta_label,
      display_order: contract.display_order ?? 0,
      is_active: true,
      extra_days: contract.extra_days ?? null,
      source_contract_id: contractId,
      student_application_id: applicationId,
    })
    .select("id")
    .single();

  if (insertContractError || !newContract) {
    throw new Error(
      insertContractError?.message ?? "Failed to create contract."
    );
  }

  const newContractId = newContract.id;

  const { error: linkError } = await supabase
    .from("contract_payment_plans")
    .insert({
      contract_id: newContractId,
      payment_plan_id: newPlanId,
      display_order: 1,
    });

  if (linkError) {
    throw new Error(`Failed to link plan to contract: ${linkError.message}`);
  }

  // 3) Backfill contract_payment_schedule for the new contract
  const { error: backfillError } = await supabase.rpc(
    "backfill_contract_payment_schedule_for_contract",
    {
      p_contract_id: newContractId,
      p_payment_plan_id: newPlanId,
    }
  );

  if (backfillError) {
    throw new Error(
      `Failed to generate payment schedule: ${backfillError.message}`
    );
  }

  // 4) Point application to new contract and plan
  const { error: updateAppError } = await supabase
    .from("student_applications")
    .update({
      contract_id: newContractId,
      selected_payment_plan_id: newPlanId,
    })
    .eq("id", applicationId);

  if (updateAppError) {
    throw new Error(
      `Failed to update application: ${updateAppError.message}`
    );
  }

  await logActivity({
    action: "create",
    entityType: "contract",
    entityId: newContractId,
    payload: {
      custom_from_application: applicationId,
      source_contract_id: contractId,
      source_payment_plan_id: planId,
      student_display_name: studentDisplayName,
      installments_count: installments.length,
    },
  });

  return { contractId: newContractId, paymentPlanId: newPlanId };
}

export function useCreateCustomContractFromApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCustomContractFromApplication,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["student-application", variables.applicationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["student-payments", variables.applicationId],
      });
      queryClient.invalidateQueries({ queryKey: ["payment-summary", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["admin-contracts"] });
    },
  });
}
