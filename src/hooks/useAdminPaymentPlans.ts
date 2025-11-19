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

const fetchActiveAcademicYears = async (): Promise<AcademicYearRow[]> => {
  const { data, error } = await supabase
    .from("academic_years")
    .select("*")
    .eq("is_active", true)
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
};

/**
 * Fetch all academic years for payment plans management
 * (allows managing plans for future years that may not be active yet)
 */
const fetchAllAcademicYearsForPlans = async (): Promise<AcademicYearRow[]> => {
  const { data, error } = await supabase
    .from("academic_years")
    .select("*")
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
};

const fetchPaymentPlans = async (academicYearId?: string | null): Promise<{
  academicYears: AcademicYearRow[];
  selectedAcademicYear: AcademicYearRow | null;
  plans: PaymentPlanWithInstallments[];
}> => {
  // Fetch all academic years for the dropdown (not just active)
  const academicYears = await fetchAllAcademicYearsForPlans();
  
  // Get active years for default selection
  const activeYears = await fetchActiveAcademicYears();
  
  // If no academicYearId provided, use the first active year (most recent)
  let selectedAcademicYear: AcademicYearRow | null = null;
  if (academicYearId) {
    // Find the selected year in the all years list
    selectedAcademicYear = academicYears.find(y => y.id === academicYearId) ?? null;
  } else if (activeYears.length > 0) {
    // Default to most recent active year
    selectedAcademicYear = activeYears[0];
  } else if (academicYears.length > 0) {
    // Fallback to most recent year if no active years
    selectedAcademicYear = academicYears[0];
  }

  const selectedYearId = selectedAcademicYear?.id ?? academicYearId;

  if (!selectedYearId) {
    return {
      academicYears,
      selectedAcademicYear: null,
      plans: [],
    };
  }

  const { data: plans, error: plansError } = await supabase
    .from("payment_plans")
    .select("*")
    .eq("academic_year_id", selectedYearId)
    .order("name", { ascending: true });

  if (plansError) throw plansError;

  const planIds = plans?.map((plan) => plan.id) ?? [];

  if (planIds.length === 0) {
    return {
      academicYears,
      selectedAcademicYear,
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
    academicYears,
    selectedAcademicYear,
    plans: grouped,
  };
};

export const useAdminPaymentPlans = (academicYearId?: string | null) =>
  useQuery({
    queryKey: ["admin-payment-plans", academicYearId],
    queryFn: () => fetchPaymentPlans(academicYearId),
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

/**
 * Fetch all academic years (not just active) for duplication source selection
 */
const fetchAllAcademicYears = async (): Promise<AcademicYearRow[]> => {
  const { data, error } = await supabase
    .from("academic_years")
    .select("*")
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
};

/**
 * Duplicate payment plans from one academic year to another
 * Adds 1 year to fixed due dates, keeps offset days the same
 */
export const useDuplicatePaymentPlans = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      sourceAcademicYearId: string;
      targetAcademicYearId: string;
    }) => {
      const { sourceAcademicYearId, targetAcademicYearId } = payload;

      // Fetch source payment plans with installments
      const { data: sourcePlans, error: sourceError } = await supabase
        .from("payment_plans")
        .select(
          `
          *,
          installments:payment_plan_installments (*)
        `,
        )
        .eq("academic_year_id", sourceAcademicYearId)
        .order("name", { ascending: true });

      if (sourceError) throw sourceError;
      if (!sourcePlans || sourcePlans.length === 0) {
        throw new Error("No payment plans found in source academic year");
      }

      // Duplicate each plan
      for (const sourcePlan of sourcePlans) {
        const { installments, ...planData } = sourcePlan as any;

        // Create new plan for target year
        const { data: newPlan, error: planError } = await supabase
          .from("payment_plans")
          .insert({
            academic_year_id: targetAcademicYearId,
            name: planData.name,
            description: planData.description,
            deposit_amount: planData.deposit_amount,
            is_active: planData.is_active,
          })
          .select("*")
          .single();

        if (planError) throw planError;

        // Duplicate installments, adding 1 year to fixed due dates
        if (installments && installments.length > 0) {
          const installmentPayload = installments.map((inst: any, index: number) => {
            let dueDate = inst.due_date;
            // If there's a fixed due date, add 1 year to it
            if (dueDate) {
              const date = new Date(dueDate);
              date.setFullYear(date.getFullYear() + 1);
              dueDate = date.toISOString().split("T")[0];
            }

            return {
              payment_plan_id: newPlan.id,
              sequence: index + 1,
              label: inst.label,
              due_date_offset_days: inst.due_date_offset_days, // Keep offset the same
              due_date: dueDate, // Updated date if it was a fixed date
              amount_type: inst.amount_type,
              amount_value: inst.amount_value,
            };
          });

          const { error: installmentsError } = await supabase
            .from("payment_plan_installments")
            .insert(installmentPayload);

          if (installmentsError) throw installmentsError;
        }
      }

      return { count: sourcePlans.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payment-plans"] });
    },
  });
};

/**
 * Hook to fetch all academic years for duplication source selection
 */
export const useAllAcademicYears = () => {
  return useQuery({
    queryKey: ["all-academic-years"],
    queryFn: fetchAllAcademicYears,
  });
};


