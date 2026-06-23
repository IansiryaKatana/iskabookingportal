import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ApplicationRow = Database["public"]["Tables"]["student_applications"]["Row"];
type StepRow = Database["public"]["Tables"]["student_application_steps"]["Row"];

type PaymentPlanInstallment =
  Database["public"]["Tables"]["payment_plan_installments"]["Row"];

type DocusignEnvelopeRow =
  Database["public"]["Tables"]["docusign_envelopes"]["Row"];

type StudentApplication = ApplicationRow & {
  selected_payment_plan_id: string | null;
  contract: {
    id: string;
    slug: string;
    academic_year_id: string | null;
    deposit_override: number | null;
    contract_start: string;
    contract_end: string;
    weeks: number;
    extra_days?: number | null;
    weekly_price_override?: number | null;
    payment_plan_id: string | null;
    studio_grade: { id: string; name: string } | null;
    contract_payment_plans: {
      id: string;
      payment_plan_id: string;
      display_order: number | null;
      payment_plan: {
        id: string;
        name: string;
        description: string | null;
        deposit_amount: number | null;
        payment_plan_installments: PaymentPlanInstallment[];
      } | null;
    }[];
    is_custom_duration_placeholder?: boolean;
  } | null;
  assigned_studio: Database["public"]["Tables"]["studios"]["Row"] | null;
  student_application_steps: StepRow[];
  docusign_envelopes: DocusignEnvelopeRow[];
};

const fetchApplication = async (
  applicationId: string,
): Promise<StudentApplication | null> => {
  const { data, error } = await supabase
    .from("student_applications")
    .select(`
        *,
        contract:contracts!contract_id (
          id,
          slug,
          academic_year_id,
          deposit_override,
          payment_plan_id,
          contract_start,
          contract_end,
          weeks,
          extra_days,
          weekly_price_override,
          is_custom_duration_placeholder,
          studio_grade:studio_grades ( id, name ),
          contract_payment_plans:contract_payment_plans (
            id,
            payment_plan_id,
            display_order,
            payment_plan:payment_plans (
              id,
              name,
              description,
              deposit_amount,
              payment_plan_installments:payment_plan_installments ( * )
            )
          )
        ),
        assigned_studio:studios (*),
        student_application_steps (*),
        docusign_envelopes (*)
      `)
    .eq("id", applicationId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
};

const upsertStep = async (payload: {
  applicationId: string;
  stepNumber: number;
  data: Record<string, unknown>;
  isComplete?: boolean;
}) => {
  const { applicationId, stepNumber, data, isComplete } = payload;

  const { data: result, error } = await supabase
    .from("student_application_steps")
    .upsert(
      {
        application_id: applicationId,
        step_number: stepNumber,
        payload: data,
        is_complete: isComplete ?? false,
      },
      {
        onConflict: "application_id,step_number",
      },
    )
    .select("*")
    .maybeSingle();

  if (error) throw error;

  // Step 4 complete: move to awaiting_deposit and extend studio hold to 48 hours.
  if (isComplete && stepNumber === 4) {
    const { error: extendError } = await supabase.rpc(
      "extend_studio_hold_for_deposit",
      { p_application_id: applicationId },
    );

    if (extendError) {
      console.error("Failed to extend studio hold for deposit:", extendError);
    }
  }

  return result;
};

export const useStudentApplication = (applicationId?: string) =>
  useQuery({
    queryKey: ["student-application", applicationId],
    queryFn: () =>
      applicationId ? fetchApplication(applicationId) : Promise.resolve(null),
    enabled: Boolean(applicationId),
    refetchOnWindowFocus: false,
  });

export const useSaveApplicationStep = (applicationId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      stepNumber: number;
      data: Record<string, unknown>;
      isComplete?: boolean;
    }) =>
      upsertStep({
        applicationId,
        stepNumber: payload.stepNumber,
        data: payload.data,
        isComplete: payload.isComplete,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["student-application", applicationId],
      });
      // Also invalidate admin applications so they see updates immediately
      queryClient.invalidateQueries({
        queryKey: ["admin-applications"],
      });
    },
  });
};

