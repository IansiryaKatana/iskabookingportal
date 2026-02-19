import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ApplicationRow =
  Database["public"]["Tables"]["student_applications"]["Row"];
type ContractRow = Database["public"]["Tables"]["contracts"]["Row"];
type StudioGradeRow = Database["public"]["Tables"]["studio_grades"]["Row"];
type PaymentPlanRow =
  Database["public"]["Tables"]["payment_plans"]["Row"];

export type ApplicationSummary = ApplicationRow & {
  selected_payment_plan_id: string | null;
  contract: (ContractRow & {
    studio_grade: StudioGradeRow | null;
    contract_payment_plans: {
      payment_plan_id: string;
      display_order: number | null;
      payment_plan: PaymentPlanRow | null;
    }[];
  }) | null;
  student_application_steps?: Array<{
    step_number: number;
    payload: Record<string, unknown>;
  }>;
};

const fetchApplications = async (
  studentId: string,
): Promise<ApplicationSummary[]> => {
  const { data, error } = await supabase
    .from("student_applications")
    .select(
      `
        *,
        contract:contracts!contract_id (
          *,
          studio_grade:studio_grades (*),
          contract_payment_plans:contract_payment_plans (
            payment_plan_id,
            display_order,
            payment_plan:payment_plans (*)
          )
        ),
        student_application_steps (
          step_number,
          payload
        )
      `,
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data as unknown as ApplicationSummary[]) ?? [];
};

export const useStudentApplicationsList = (studentId?: string) =>
  useQuery({
    queryKey: ["student-applications", studentId],
    queryFn: () =>
      studentId ? fetchApplications(studentId) : Promise.resolve([]),
    enabled: Boolean(studentId),
  });

