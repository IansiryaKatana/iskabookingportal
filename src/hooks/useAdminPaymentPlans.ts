import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type PaymentPlanRow = Database["public"]["Tables"]["payment_plans"]["Row"];
type PaymentPlanInstallmentRow =
  Database["public"]["Tables"]["payment_plan_installments"]["Row"];
type AcademicYearRow = Database["public"]["Tables"]["academic_years"]["Row"];

export type PaymentPlanWithInstallments = PaymentPlanRow & {
  installments: PaymentPlanInstallmentRow[];
};

const fetchActiveAcademicYear = async (): Promise<AcademicYearRow | null> => {
  const { data, error } = await supabase
    .from("academic_years")
    .select("*")
    .eq("is_active", true)
    .order("start_date", { ascending: false })
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
};

const fetchPaymentPlans = async (): Promise<{
  academicYear: AcademicYearRow | null;
  plans: PaymentPlanWithInstallments[];
}> => {
  const academicYear = await fetchActiveAcademicYear();
  const academicYearId = academicYear?.id;

  if (!academicYearId) {
    return {
      academicYear: null,
      plans: [],
    };
  }

  const { data: plans, error: plansError } = await supabase
    .from("payment_plans")
    .select("*")
    .eq("academic_year_id", academicYearId)
    .order("name", { ascending: true });

  if (plansError) throw plansError;

  const planIds = plans?.map((plan) => plan.id) ?? [];

  if (planIds.length === 0) {
    return {
      academicYear,
      plans: [],
    };
  }

  const { data: installments, error: installmentsError } = await supabase
    .from("payment_plan_installments")
    .select("*")
    .in("payment_plan_id", planIds)
    .order("sequence", { ascending: true });

  if (installmentsError) throw installmentsError;

  const grouped = (plans ?? []).map<PaymentPlanWithInstallments>((plan) => ({
    ...plan,
    installments:
      installments?.filter(
        (installment) => installment.payment_plan_id === plan.id,
      ) ?? [],
  }));

  return {
    academicYear,
    plans: grouped,
  };
};

export const useAdminPaymentPlans = () =>
  useQuery({
    queryKey: ["admin-payment-plans"],
    queryFn: fetchPaymentPlans,
  });

type InstallmentInput = {
  label: string;
  due_date_offset_days: number | null;
  due_date: string | null;
  amount_type: PaymentPlanInstallmentRow["amount_type"];
  amount_value: number;
};

type PlanInput = {
  id?: string;
  academic_year_id: string;
  name: string;
  description?: string | null;
  deposit_amount: number | null;
  is_active: boolean;
  installments: InstallmentInput[];
};

const upsertInstallments = async (
  planId: string,
  installments: InstallmentInput[],
) => {
  await supabase
    .from("payment_plan_installments")
    .delete()
    .eq("payment_plan_id", planId);

  if (!installments.length) return;

  const insertPayload = installments.map((installment, index) => ({
    payment_plan_id: planId,
    sequence: index + 1,
    label: installment.label,
    due_date_offset_days: installment.due_date_offset_days,
    due_date: installment.due_date,
    amount_type: installment.amount_type,
    amount_value: installment.amount_value,
  }));

  const { error } = await supabase
    .from("payment_plan_installments")
    .insert(insertPayload);
  if (error) throw error;
};

export const useCreatePaymentPlan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PlanInput) => {
      const { installments, id: _ignored, ...planData } = payload;

      const { data: plan, error } = await supabase
        .from("payment_plans")
        .insert(planData)
        .select("*")
        .single();

      if (error) throw error;

      await upsertInstallments(plan.id, installments);
      return plan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payment-plans"] });
    },
  });
};

export const useUpdatePaymentPlan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PlanInput) => {
      if (!payload.id) throw new Error("Missing payment plan ID");
      const { id, installments, ...planData } = payload;

      const { data: plan, error } = await supabase
        .from("payment_plans")
        .update(planData)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;

      await upsertInstallments(plan.id, installments);
      return plan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payment-plans"] });
    },
  });
};

export const useDeletePaymentPlan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("payment_plans")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payment-plans"] });
    },
  });
};


