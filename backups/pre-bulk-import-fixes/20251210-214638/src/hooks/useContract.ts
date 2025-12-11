import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ContractRow = Database["public"]["Tables"]["contracts"]["Row"];
type StudioGradeRow = Database["public"]["Tables"]["studio_grades"]["Row"];
type PaymentPlanRow = Database["public"]["Tables"]["payment_plans"]["Row"];
type PaymentPlanInstallmentRow =
  Database["public"]["Tables"]["payment_plan_installments"]["Row"];
type ContractScheduleRow =
  Database["public"]["Tables"]["contract_payment_schedule"]["Row"];
type ContractPaymentPlanRow =
  Database["public"]["Tables"]["contract_payment_plans"]["Row"];
type AcademicYearRow = Database["public"]["Tables"]["academic_years"]["Row"];

export type ContractPaymentPlanDetail = ContractPaymentPlanRow & {
  payment_plan: (PaymentPlanRow & {
    payment_plan_installments: PaymentPlanInstallmentRow[];
  }) | null;
};

export type ContractDetail = ContractRow & {
  studio_grade: StudioGradeRow;
  contract_payment_plans: ContractPaymentPlanDetail[];
  contract_payment_schedule: ContractScheduleRow[];
  academic_year: AcademicYearRow | null;
};

const fetchContract = async (slug: string): Promise<ContractDetail | null> => {
  const { data, error } = await supabase
    .from("contracts")
    .select(
      `
        *,
        academic_year:academic_years (*),
        studio_grade:studio_grades (*),
        contract_payment_plans:contract_payment_plans (
          *,
          payment_plan:payment_plans (
            *,
            payment_plan_installments (*)
          )
        ),
        contract_payment_schedule (*)
      `,
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as ContractDetail) ?? null;
};

export const useContract = (slug?: string) =>
  useQuery({
    queryKey: ["contract", slug],
    queryFn: () => (slug ? fetchContract(slug) : Promise.resolve(null)),
    enabled: Boolean(slug),
    staleTime: 1000 * 60 * 2,
  });

