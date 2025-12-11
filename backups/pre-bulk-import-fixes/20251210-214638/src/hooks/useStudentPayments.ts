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
  // First get the application to find the contract_id and payment plan
  const { data: application, error: appError } = await supabase
    .from("student_applications")
    .select("contract_id, selected_payment_plan_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (appError) throw appError;
  if (!application?.contract_id) return [];

  // Fetch payment schedule for the contract
  const { data: scheduleData, error: scheduleError } = await supabase
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

  if (scheduleError) throw scheduleError;
  
  // If schedule exists, return it
  if (scheduleData && scheduleData.length > 0) {
    return (scheduleData as unknown as PaymentSchedule[]) ?? [];
  }

  // If no schedule exists (e.g., Pay in Full plans), generate from payment_plan_installments
  if (application.selected_payment_plan_id) {
    // Get contract details
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select(
        `
        id,
        name,
        contract_start,
        contract_end,
        weeks,
        weekly_price_override,
        academic_year_id,
        studio_grade_id,
        studio_grade:studio_grades ( name )
      `,
      )
      .eq("id", application.contract_id)
      .maybeSingle();

    if (contractError) throw contractError;
    if (!contract) return [];

    // Get weekly price
    const { data: priceData } = await supabase
      .from("studio_grade_prices")
      .select("weekly_price")
      .eq("academic_year_id", contract.academic_year_id)
      .eq("studio_grade_id", contract.studio_grade_id)
      .eq("is_active", true)
      .maybeSingle();

    const weeklyPrice = contract.weekly_price_override || priceData?.weekly_price || 0;
    const totalContractValue = weeklyPrice * contract.weeks;

    // Get deposit amount
    const { data: paymentPlan } = await supabase
      .from("payment_plans")
      .select("deposit_amount")
      .eq("id", application.selected_payment_plan_id)
      .maybeSingle();

    const depositAmount = paymentPlan?.deposit_amount || 0;

    // CRITICAL: Calculate remaining balance = Contract Total - Deposit
    // Installments are calculated from remaining balance, NOT contract total
    const remainingBalance = Math.max(totalContractValue - depositAmount, 0);

    // Get payment plan installments
    const { data: installments, error: installmentsError } = await supabase
      .from("payment_plan_installments")
      .select("*")
      .eq("payment_plan_id", application.selected_payment_plan_id)
      .order("sequence", { ascending: true });

    if (installmentsError) throw installmentsError;
    if (!installments || installments.length === 0) return [];

    // Convert installments to payment schedule format
    const generatedSchedule: PaymentSchedule[] = installments.map((inst) => {
      // Calculate amount from REMAINING BALANCE, not contract total
      let amount = 0;
      if (inst.amount_type === "percentage") {
        // Installments are percentage of remaining balance (after deposit)
        amount = (remainingBalance * Number(inst.amount_value)) / 100;
      } else if (inst.amount_type === "fixed") {
        amount = Number(inst.amount_value);
      }

      // Calculate due date
      let dueDate: Date;
      if (inst.due_date) {
        dueDate = new Date(inst.due_date);
      } else if (inst.due_date_offset_days !== null) {
        dueDate = new Date(contract.contract_start);
        dueDate.setDate(dueDate.getDate() + inst.due_date_offset_days);
      } else {
        // Fallback to contract start
        dueDate = new Date(contract.contract_start);
      }

      return {
        id: inst.id,
        contract_id: contract.id,
        label: inst.label || `Instalment ${inst.sequence}`,
        sequence: inst.sequence,
        due_date: dueDate.toISOString().split("T")[0],
        amount: amount,
        created_at: inst.created_at,
        updated_at: inst.updated_at,
        contract: {
          id: contract.id,
          name: contract.name,
          contract_start: contract.contract_start,
          contract_end: contract.contract_end,
          studio_grade: contract.studio_grade,
        },
      } as PaymentSchedule;
    });

    return generatedSchedule;
  }

  return [];
};

export const useStudentPayments = (applicationId?: string) =>
  useQuery({
    queryKey: ["student-payments", applicationId],
    queryFn: () =>
      applicationId ? fetchPaymentSchedule(applicationId) : Promise.resolve([]),
    enabled: Boolean(applicationId),
  });

