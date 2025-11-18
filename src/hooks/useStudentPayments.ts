import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type PaymentScheduleRow =
  Database["public"]["Tables"]["contract_payment_schedule"]["Row"];

type PaymentSchedule = PaymentScheduleRow & {
  contract: {
    id: string;
    name: string;
    contract_start: string;
    contract_end: string;
    studio_grade: { name: string } | null;
  } | null;
};

const fetchPaymentSchedule = async (
  applicationId: string,
): Promise<PaymentSchedule[]> => {
  // First get the application to find the contract_id
  const { data: application, error: appError } = await supabase
    .from("student_applications")
    .select("contract_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (appError) throw appError;
  if (!application?.contract_id) return [];

  // Fetch payment schedule for the contract
  const { data, error } = await supabase
    .from("contract_payment_schedule")
    .select(
      `
      *,
      contract:contracts (
        id,
        name,
        contract_start,
        contract_end,
        studio_grade:studio_grades ( name )
      )
    `,
    )
    .eq("contract_id", application.contract_id)
    .order("sequence", { ascending: true });

  if (error) throw error;
  return (data as unknown as PaymentSchedule[]) ?? [];
};

export const useStudentPayments = (applicationId?: string) =>
  useQuery({
    queryKey: ["student-payments", applicationId],
    queryFn: () =>
      applicationId ? fetchPaymentSchedule(applicationId) : Promise.resolve([]),
    enabled: Boolean(applicationId),
  });

