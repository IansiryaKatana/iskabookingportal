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
        deposit_override,
        academic_year_id,
        studio_grade_id,
        studio_grade:studio_grades ( name )
      `,
      )
      .eq("id", application.contract_id)
      .maybeSingle();

    if (contractError) throw contractError;
    if (!contract) return [];

    // Get weekly price and deposit from studio_grade_prices
    const { data: priceData } = await supabase
      .from("studio_grade_prices")
      .select("weekly_price, deposit_amount_override")
      .eq("academic_year_id", contract.academic_year_id)
      .eq("studio_grade_id", contract.studio_grade_id)
      .eq("is_active", true)
      .maybeSingle();

    const weeklyPrice = contract.weekly_price_override || priceData?.weekly_price || 0;
    const totalContractValue = weeklyPrice * contract.weeks;

    // Get deposit amount with proper priority (matches database function logic):
    // 1. contract.deposit_override (highest priority)
    // 2. payment_plans.deposit_amount
    // 3. studio_grade_prices.deposit_amount_override (lowest priority)
    let depositAmount = 0;
    let depositSource = "none (0)";
    
    if (contract.deposit_override) {
      depositAmount = Number(contract.deposit_override);
      depositSource = "contract.deposit_override";
    } else {
      const { data: paymentPlan } = await supabase
        .from("payment_plans")
        .select("deposit_amount")
        .eq("id", application.selected_payment_plan_id)
        .maybeSingle();
      
      if (paymentPlan?.deposit_amount) {
        depositAmount = Number(paymentPlan.deposit_amount);
        depositSource = "payment_plans.deposit_amount";
      } else if (priceData?.deposit_amount_override) {
        depositAmount = Number(priceData.deposit_amount_override);
        depositSource = "studio_grade_prices.deposit_amount_override";
      }
    }

    // Deposit is separate: installments are calculated from full contract total (no minus deposit)
    const installmentBase = totalContractValue;

    // Get payment plan installments
    const { data: allInstallments, error: installmentsError } = await supabase
      .from("payment_plan_installments")
      .select("*")
      .eq("payment_plan_id", application.selected_payment_plan_id)
      .order("sequence", { ascending: true });

    if (installmentsError) throw installmentsError;
    if (!allInstallments || allInstallments.length === 0) {
      return [];
    }

    // CRITICAL FIX: Filter out deposits from installments
    // Deposits are separate and should NOT be included in installment calculations
    const installments = allInstallments.filter(inst => {
      const isDeposit = 
        inst.label?.toLowerCase().includes('deposit') ||
        (inst.sequence === 1 && inst.amount_type === 'fixed' && Number(inst.amount_value) === depositAmount);
      
      return !isDeposit;
    });

    if (installments.length === 0) {
      return [];
    }

    // Convert installments to payment schedule format
    // CRITICAL: Last installment absorbs rounding difference to ensure exact sum
    // Helper function to round to 2 decimal places (currency precision)
    const roundCurrency = (value: number): number => {
      return Math.round((value + Number.EPSILON) * 100) / 100;
    };

    const generatedSchedule: PaymentSchedule[] = installments.map((inst, index) => {
      // Calculate amount from full contract total (deposit is separate, not deducted)
      let amount = 0;
      
      if (inst.amount_type === "percentage") {
        // Installments are percentage of full contract total
        const rawAmount = (installmentBase * Number(inst.amount_value)) / 100;
        amount = roundCurrency(rawAmount);
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
        amount: amount, // Will be adjusted for last installment below
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

    // Adjust last installment to absorb rounding so installments sum exactly to contract total
    if (generatedSchedule.length > 0) {
      const lastIndex = generatedSchedule.length - 1;
      const sumOfPrevious = generatedSchedule
        .slice(0, lastIndex)
        .reduce((sum, inst) => sum + inst.amount, 0);
      const adjustedAmount = roundCurrency(installmentBase - sumOfPrevious);
      generatedSchedule[lastIndex].amount = adjustedAmount;
    }
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

