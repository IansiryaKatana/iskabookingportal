import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export type PaymentPlanOption = {
  planId: string;
  name: string;
  installmentCount: number;
  isCustom: boolean;
  isTemplate: boolean;
};

type ContractWalkRow = {
  id: string;
  name: string | null;
  slug: string | null;
  source_contract_id: string | null;
  student_application_id: string | null;
  academic_year_id: string | null;
  studio_grade_id: string | null;
  payment_plan_id: string | null;
  summary: string | null;
  contract_start: string | null;
  contract_end: string | null;
  weeks: number | null;
  weekly_price_override: number | null;
  deposit_override: number | null;
  cta_label: string | null;
  display_order: number | null;
  extra_days: number | null;
  is_active: boolean | null;
};

/**
 * Check if application has any installment payments (manual or Stripe).
 * Customise schedule / plan switches that rebuild schedule are only allowed when there are none.
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
    (p) =>
      p.metadata &&
      typeof p.metadata === "object" &&
      (p.metadata as { instalment_id?: string }).instalment_id
  );
  return hasStripeInstalment ?? false;
}

/** Walk source_contract_id until the catalog/template contract (no student_application_id). */
export async function resolveRootTemplateContractId(
  contractId: string
): Promise<string> {
  let currentId = contractId;
  for (let i = 0; i < 12; i++) {
    const { data, error } = await supabase
      .from("contracts")
      .select("id, source_contract_id, student_application_id")
      .eq("id", currentId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Contract not found while resolving template.");

    if (!data.student_application_id) {
      return data.id;
    }
    if (!data.source_contract_id) {
      return data.id;
    }
    currentId = data.source_contract_id;
  }
  return currentId;
}

function stripStudentNameSuffixes(name: string, studentDisplayName: string): string {
  let cleaned = name.trim();
  const suffix = ` (${studentDisplayName})`;
  while (cleaned.endsWith(suffix)) {
    cleaned = cleaned.slice(0, -suffix.length).trim();
  }
  // Also strip generic trailing "(Name)" repeats left from older clones
  cleaned = cleaned.replace(/(\s*\([^)]+\))+$/g, (match) => {
    // Keep if it looks like academic year / grade context — only strip when whole name ends with repeated person-like parens
    return match;
  });
  // Safer: repeatedly strip any trailing " (…)" that matches the student name only (already done).
  return cleaned || name;
}

function customPlanName(studentDisplayName: string, count: number): string {
  return `Custom ${count} Instalments (${studentDisplayName})`;
}

function customContractName(rootName: string, studentDisplayName: string): string {
  const base = stripStudentNameSuffixes(rootName, studentDisplayName);
  return `${base} (${studentDisplayName})`;
}

function renumberInstallments(
  installments: CustomInstallmentInput[]
): CustomInstallmentInput[] {
  return installments.map((inst, index) => ({
    ...inst,
    sequence: index + 1,
    label: `Instalment ${index + 1}`,
  }));
}

async function replaceStudentCustomPlanInstallments(args: {
  applicationId: string;
  contractId: string;
  planId: string;
  studentDisplayName: string;
  installments: CustomInstallmentInput[];
}): Promise<{ contractId: string; paymentPlanId: string }> {
  const { applicationId, contractId, planId, studentDisplayName, installments } =
    args;
  const numbered = renumberInstallments(installments);

  const { error: nameError } = await supabase
    .from("payment_plans")
    .update({
      name: customPlanName(studentDisplayName, numbered.length),
      description: `Custom payment schedule for ${studentDisplayName}.`,
      student_application_id: applicationId,
    })
    .eq("id", planId);

  if (nameError) {
    throw new Error(`Failed to update payment plan: ${nameError.message}`);
  }

  const { error: deleteError } = await supabase
    .from("payment_plan_installments")
    .delete()
    .eq("payment_plan_id", planId);

  if (deleteError) {
    throw new Error(`Failed to clear instalments: ${deleteError.message}`);
  }

  for (const inst of numbered) {
    const { error: instError } = await supabase
      .from("payment_plan_installments")
      .insert({
        payment_plan_id: planId,
        sequence: inst.sequence,
        label: inst.label,
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

  const { error: backfillError } = await supabase.rpc(
    "backfill_contract_payment_schedule_for_contract",
    {
      p_contract_id: contractId,
      p_payment_plan_id: planId,
    }
  );

  if (backfillError) {
    throw new Error(
      `Failed to generate payment schedule: ${backfillError.message}`
    );
  }

  // Ensure app still points at this custom contract/plan
  const { error: updateAppError } = await supabase
    .from("student_applications")
    .update({
      contract_id: contractId,
      selected_payment_plan_id: planId,
    })
    .eq("id", applicationId);

  if (updateAppError) {
    throw new Error(`Failed to update application: ${updateAppError.message}`);
  }

  const { error: stepError } = await supabase.rpc("set_selected_payment_plan", {
    p_application_id: applicationId,
    p_plan_id: planId,
  });
  if (stepError) {
    console.warn("Failed to sync step 5 after custom schedule replace:", stepError);
  }

  await logActivity({
    action: "update",
    entityType: "payment_plan",
    entityId: planId,
    payload: {
      custom_schedule_replaced: true,
      application_id: applicationId,
      installments_count: numbered.length,
    },
  });

  return { contractId, paymentPlanId: planId };
}

/**
 * Create or replace a student-specific custom schedule.
 * - First customise from a template: clone root template contract + new plan.
 * - Re-customise with no instalment payments: replace plan rows in place (no nested names).
 */
async function createCustomContractFromApplication(
  payload: CreateCustomContractPayload
): Promise<{ contractId: string; paymentPlanId: string; replaced: boolean }> {
  const { applicationId, studentDisplayName, installments } = payload;

  if (!installments.length) {
    throw new Error("At least one installment is required.");
  }

  const numberedInput = renumberInstallments(installments);
  const totalRequired = numberedInput.reduce((s, i) => s + i.amount, 0);

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

  const { data: currentContract, error: contractError } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", contractId)
    .single();

  if (contractError || !currentContract) {
    throw new Error("Contract not found.");
  }

  const isStudentSpecific =
    Boolean(currentContract.student_application_id) &&
    currentContract.student_application_id === applicationId;

  // Replace in place when already on this application's custom contract
  if (isStudentSpecific && planId) {
    const { data: currentPlan } = await supabase
      .from("payment_plans")
      .select("id, student_application_id")
      .eq("id", planId)
      .maybeSingle();

    if (currentPlan?.student_application_id === applicationId) {
      const result = await replaceStudentCustomPlanInstallments({
        applicationId,
        contractId,
        planId,
        studentDisplayName,
        installments: numberedInput,
      });
      return { ...result, replaced: true };
    }
  }

  // Also reuse any prior custom contract for this application (by slug / ownership)
  const rootContractId = await resolveRootTemplateContractId(contractId);
  const { data: rootContract, error: rootError } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", rootContractId)
    .single();

  if (rootError || !rootContract) {
    throw new Error("Template contract not found.");
  }

  const root = rootContract as ContractWalkRow;
  const baseSlug =
    typeof root.slug === "string" && root.slug ? root.slug : "custom";
  const uniqueSlug = `${baseSlug}-${applicationId.slice(0, 8)}`;

  const { data: priorCustomContract } = await supabase
    .from("contracts")
    .select("id, payment_plan_id")
    .eq("student_application_id", applicationId)
    .limit(1)
    .maybeSingle();

  if (priorCustomContract?.id && priorCustomContract.payment_plan_id) {
    const { data: priorPlan } = await supabase
      .from("payment_plans")
      .select("id, student_application_id, deposit_amount")
      .eq("id", priorCustomContract.payment_plan_id)
      .maybeSingle();

    if (priorPlan?.student_application_id === applicationId) {
      await supabase
        .from("contracts")
        .update({
          name: customContractName(
            typeof root.name === "string" ? root.name : "Custom Contract",
            studentDisplayName
          ),
          source_contract_id: rootContractId,
          slug: uniqueSlug,
        })
        .eq("id", priorCustomContract.id);

      const result = await replaceStudentCustomPlanInstallments({
        applicationId,
        contractId: priorCustomContract.id,
        planId: priorPlan.id,
        studentDisplayName,
        installments: numberedInput,
      });
      return { ...result, replaced: true };
    }
  }

  const { data: sourcePlan, error: planError } = await supabase
    .from("payment_plans")
    .select("id, name, deposit_amount, academic_year_id")
    .eq("id", planId)
    .single();

  if (planError || !sourcePlan) {
    throw new Error("Payment plan not found.");
  }

  const academicYearId =
    (sourcePlan.academic_year_id as string) || (root.academic_year_id as string);
  const depositAmount = sourcePlan.deposit_amount ?? 0;

  const planName = customPlanName(studentDisplayName, numberedInput.length);

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

  for (const inst of numberedInput) {
    const { error: instError } = await supabase
      .from("payment_plan_installments")
      .insert({
        payment_plan_id: newPlanId,
        sequence: inst.sequence,
        label: inst.label,
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

  const newContractName = customContractName(
    typeof root.name === "string" ? root.name : "Custom Contract",
    studentDisplayName
  );

  const { data: newContract, error: insertContractError } = await supabase
    .from("contracts")
    .insert({
      academic_year_id: root.academic_year_id,
      studio_grade_id: root.studio_grade_id,
      payment_plan_id: newPlanId,
      slug: uniqueSlug,
      name: newContractName,
      summary: root.summary ?? null,
      contract_start: root.contract_start,
      contract_end: root.contract_end,
      weeks: root.weeks,
      weekly_price_override: root.weekly_price_override,
      deposit_override: root.deposit_override,
      cta_label: root.cta_label,
      display_order: root.display_order ?? 0,
      is_active: true,
      extra_days: root.extra_days ?? null,
      source_contract_id: rootContractId,
      student_application_id: applicationId,
      visible_on_portal: false,
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

  const { error: updateAppError } = await supabase
    .from("student_applications")
    .update({
      contract_id: newContractId,
      selected_payment_plan_id: newPlanId,
    })
    .eq("id", applicationId);

  if (updateAppError) {
    throw new Error(`Failed to update application: ${updateAppError.message}`);
  }

  const { error: stepError } = await supabase.rpc("set_selected_payment_plan", {
    p_application_id: applicationId,
    p_plan_id: newPlanId,
  });
  if (stepError) {
    console.warn("Failed to sync step 5 after custom schedule create:", stepError);
  }

  await logActivity({
    action: "create",
    entityType: "contract",
    entityId: newContractId,
    payload: {
      custom_from_application: applicationId,
      source_contract_id: rootContractId,
      source_payment_plan_id: planId,
      student_display_name: studentDisplayName,
      installments_count: numberedInput.length,
    },
  });

  return { contractId: newContractId, paymentPlanId: newPlanId, replaced: false };
}

function invalidatePaymentPlanQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  applicationId: string
) {
  queryClient.invalidateQueries({
    queryKey: ["student-application", applicationId],
  });
  queryClient.invalidateQueries({
    queryKey: ["student-payments", applicationId],
  });
  queryClient.invalidateQueries({ queryKey: ["payment-summary", applicationId] });
  queryClient.invalidateQueries({
    queryKey: ["installment-breakdown", applicationId],
  });
  queryClient.invalidateQueries({
    queryKey: ["application-has-instalment-payments", applicationId],
  });
  queryClient.invalidateQueries({
    queryKey: ["application-payment-plan-options", applicationId],
  });
  queryClient.invalidateQueries({ queryKey: ["admin-contracts"] });
  queryClient.invalidateQueries({ queryKey: ["all-payments"] });
}

export function useCreateCustomContractFromApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCustomContractFromApplication,
    onSuccess: (_, variables) => {
      invalidatePaymentPlanQueries(queryClient, variables.applicationId);
    },
  });
}

export async function fetchApplicationPaymentPlanOptions(
  applicationId: string
): Promise<PaymentPlanOption[]> {
  const { data: application, error } = await supabase
    .from("student_applications")
    .select("id, contract_id, selected_payment_plan_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (error) throw error;
  if (!application?.contract_id) return [];

  const rootContractId = await resolveRootTemplateContractId(
    application.contract_id
  );

  const { data: links, error: linksError } = await supabase
    .from("contract_payment_plans")
    .select(
      `
      payment_plan_id,
      display_order,
      payment_plan:payment_plans (
        id,
        name,
        student_application_id,
        payment_plan_installments ( id, label, sequence )
      )
    `
    )
    .eq("contract_id", rootContractId)
    .order("display_order", { ascending: true });

  if (linksError) throw linksError;

  const countRentRows = (
    rows: { label: string | null; sequence: number }[] | null | undefined
  ) => {
    if (!rows?.length) return 0;
    return rows.filter((r) => !r.label?.toLowerCase().includes("deposit")).length;
  };

  const options: PaymentPlanOption[] = [];
  const seen = new Set<string>();

  for (const link of links ?? []) {
    const plan = link.payment_plan as {
      id: string;
      name: string;
      student_application_id: string | null;
      payment_plan_installments: { id: string; label: string | null; sequence: number }[];
    } | null;
    if (!plan?.id || seen.has(plan.id)) continue;
    // Template catalog only (skip any stray student plans linked to root)
    if (plan.student_application_id) continue;
    seen.add(plan.id);
    options.push({
      planId: plan.id,
      name: plan.name,
      installmentCount: countRentRows(plan.payment_plan_installments),
      isCustom: false,
      isTemplate: true,
    });
  }

  // Include current custom plan so staff can see/select it while on a custom schedule
  if (application.selected_payment_plan_id) {
    const selectedId = application.selected_payment_plan_id;
    if (!seen.has(selectedId)) {
      const { data: customPlan } = await supabase
        .from("payment_plans")
        .select(
          `
          id,
          name,
          student_application_id,
          payment_plan_installments ( id, label, sequence )
        `
        )
        .eq("id", selectedId)
        .maybeSingle();

      if (customPlan?.id) {
        options.unshift({
          planId: customPlan.id,
          name: customPlan.name,
          installmentCount: countRentRows(
            customPlan.payment_plan_installments as {
              id: string;
              label: string | null;
              sequence: number;
            }[]
          ),
          isCustom: Boolean(customPlan.student_application_id),
          isTemplate: false,
        });
      }
    }
  }

  return options;
}

export function useApplicationPaymentPlanOptions(applicationId?: string) {
  return useQuery({
    queryKey: ["application-payment-plan-options", applicationId],
    queryFn: () => fetchApplicationPaymentPlanOptions(applicationId!),
    enabled: Boolean(applicationId),
  });
}

/**
 * Staff: switch to a root template plan (re-binds application to the template contract).
 * Or re-select the current custom plan (no contract change).
 */
export async function selectApplicationPaymentPlan(args: {
  applicationId: string;
  planId: string;
}): Promise<void> {
  const { applicationId, planId } = args;

  const hasPayments = await applicationHasInstalmentPayments(applicationId);
  if (hasPayments) {
    throw new Error(
      "Cannot change payment plan after instalment payments are recorded."
    );
  }

  const { data: application, error: appError } = await supabase
    .from("student_applications")
    .select("id, contract_id, selected_payment_plan_id")
    .eq("id", applicationId)
    .single();

  if (appError || !application?.contract_id) {
    throw new Error("Application not found.");
  }

  const { data: plan, error: planError } = await supabase
    .from("payment_plans")
    .select("id, student_application_id")
    .eq("id", planId)
    .maybeSingle();

  if (planError || !plan) {
    throw new Error("Payment plan not found.");
  }

  // Custom plan for this application: keep current (or matching) student contract
  if (plan.student_application_id === applicationId) {
    const { error } = await supabase.rpc("set_selected_payment_plan", {
      p_application_id: applicationId,
      p_plan_id: planId,
    });
    if (error) throw error;
    return;
  }

  if (plan.student_application_id) {
    throw new Error("That payment plan belongs to another application.");
  }

  const rootContractId = await resolveRootTemplateContractId(
    application.contract_id
  );

  // Ensure the plan is linked to the root template
  const { data: link } = await supabase
    .from("contract_payment_plans")
    .select("id")
    .eq("contract_id", rootContractId)
    .eq("payment_plan_id", planId)
    .maybeSingle();

  if (!link) {
    throw new Error("Selected plan is not available on the template contract.");
  }

  const { error: updateError } = await supabase
    .from("student_applications")
    .update({
      contract_id: rootContractId,
      selected_payment_plan_id: planId,
    })
    .eq("id", applicationId);

  if (updateError) {
    throw new Error(`Failed to switch plan: ${updateError.message}`);
  }

  const { error: rpcError } = await supabase.rpc("set_selected_payment_plan", {
    p_application_id: applicationId,
    p_plan_id: planId,
  });
  if (rpcError) {
    throw new Error(rpcError.message);
  }

  await logActivity({
    action: "update",
    entityType: "student_application",
    entityId: applicationId,
    payload: {
      selected_payment_plan_id: planId,
      rebound_to_template_contract_id: rootContractId,
    },
  });
}

export function useSelectApplicationPaymentPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: selectApplicationPaymentPlan,
    onSuccess: (_, variables) => {
      invalidatePaymentPlanQueries(queryClient, variables.applicationId);
    },
  });
}

/** Helpers for Customise UI */
export function redistributeInstallmentAmounts(
  installments: CustomInstallmentInput[],
  total: number
): CustomInstallmentInput[] {
  if (installments.length === 0) return installments;
  const n = installments.length;
  const each = Math.floor((total * 100) / n) / 100;
  return installments.map((inst, index) => {
    if (index === n - 1) {
      const sumPrev = each * (n - 1);
      return {
        ...inst,
        amount: Math.round((total - sumPrev) * 100) / 100,
      };
    }
    return { ...inst, amount: each };
  });
}

export function addCustomInstallmentRow(
  installments: CustomInstallmentInput[],
  total: number,
  defaultDueDate = ""
): CustomInstallmentInput[] {
  const next = [
    ...installments,
    {
      sequence: installments.length + 1,
      label: `Instalment ${installments.length + 1}`,
      amount: 0,
      due_date: defaultDueDate,
    },
  ];
  return renumberInstallments(redistributeInstallmentAmounts(next, total));
}

export function removeCustomInstallmentRow(
  installments: CustomInstallmentInput[],
  index: number,
  total: number
): CustomInstallmentInput[] {
  if (installments.length <= 1) return installments;
  const next = installments.filter((_, i) => i !== index);
  return renumberInstallments(redistributeInstallmentAmounts(next, total));
}
