import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ApplicationRow = Database["public"]["Tables"]["student_applications"]["Row"];

export type ReportItem = {
  id: string;
  application_id: string;
  student_name: string;
  student_email: string;
  student_phone: string | null;
  contract_name: string;
  studio_grade: string;
  status: ApplicationRow["status"];
  deposit_paid: boolean;
  deposit_payment_intent_id: string | null;
  total_contract_value: number | null;
  created_at: string;
  contract_start: string | null;
  contract_end: string | null;
  assigned_studio: string | null;
  overdue_amount: number | null;
  overdue_days: number | null;
};

export type ReportType =
  | "awaiting_signatures"
  | "awaiting_deposit"
  | "overdue_payments"
  | "debtors"
  | "occupancy";

const fetchReport = async (reportType: ReportType): Promise<ReportItem[]> => {
  let statusFilter: string[] = [];
  let additionalFilters = "";

  switch (reportType) {
    case "awaiting_signatures":
      statusFilter = ["awaiting_signature"];
      break;
    case "awaiting_deposit":
      statusFilter = ["awaiting_deposit"];
      break;
    case "overdue_payments":
      statusFilter = ["confirmed"];
      // We'll filter for overdue payments in the query
      break;
    case "debtors":
      statusFilter = ["confirmed"];
      // We'll filter for debtors in the query
      break;
    case "occupancy":
      statusFilter = ["confirmed"];
      break;
  }

  let query = supabase
    .from("student_applications")
    .select(
      `
      id,
      status,
      deposit_payment_intent_id,
      total_contract_value,
      created_at,
      contract:contracts(
        name,
        contract_start,
        contract_end,
        studio_grade:studio_grades(name)
      ),
      assigned_studio:studios(studio_number)
    `,
    )
    .in("status", statusFilter)
    .order("created_at", { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error(`Failed to fetch ${reportType} report:`, error);
    throw error;
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Fetch student profiles
  const applicationIds = data.map((app) => app.id);
  const studentIds = [...new Set(data.map((app) => app.student_id).filter((id): id is string => Boolean(id)))];

  let profiles: any[] = [];
  if (studentIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, phone")
      .in("id", studentIds);
    
    profiles = profilesData || [];
  }

  // Fetch emails from auth.users using Edge Function
  const emailsMap = new Map<string, string>();
  try {
    const { data, error: emailsError } = await supabase.functions.invoke("get-user-emails", {
      body: { userIds: studentIds },
    });

    if (!emailsError && data?.emails) {
      Object.entries(data.emails).forEach(([userId, email]) => {
        emailsMap.set(userId, email as string);
      });
    }
  } catch (error) {
    console.warn("Could not fetch user emails:", error);
  }

  const profilesMap = new Map(
    (profiles ?? []).map((p) => [
      p.id,
      {
        name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        email: emailsMap.get(p.id) || "",
        phone: p.phone || null,
      },
    ]),
  );

  // Fetch payment schedules for overdue/debtors calculations
  let paymentSchedules: Array<{
    application_id: string;
    instalment_id: string;
    due_date: string;
    amount: number;
    paid: boolean;
  }> = [];

  if (reportType === "overdue_payments" || reportType === "debtors") {
    // Get contract_ids from applications
    const contractIds = [...new Set(data.map((app) => app.contract_id).filter((id): id is string => Boolean(id)))];
    
    let schedules: any[] = [];
    if (contractIds.length > 0) {
      const { data: schedulesData } = await supabase
        .from("contract_payment_schedule")
        .select("id, contract_id, due_date, amount")
        .in("contract_id", contractIds)
        .order("due_date", { ascending: true });
      
      schedules = schedulesData || [];
    }
    
    // Map schedules to applications by contract_id
    const applicationContractMap = new Map(data.map((app) => [app.contract_id, app.id]));
    const schedulesWithAppId = schedules.map((schedule) => ({
      ...schedule,
      application_id: applicationContractMap.get(schedule.contract_id) || null,
    }));

    if (schedulesWithAppId && schedulesWithAppId.length > 0) {
      // Check which instalments are paid via manual_payments or Stripe
      const instalmentIds = schedulesWithAppId.map((s) => s.id);
      
      // Check manual payments
      const { data: manualPayments } = await supabase
        .from("manual_payments")
        .select("instalment_id")
        .in("instalment_id", instalmentIds);
      
      // For Stripe payments, we'd need to check payment intents
      // For now, we'll use manual payments as the source of truth
      const paidInstalmentIds = new Set((manualPayments || []).map((p) => p.instalment_id));

      paymentSchedules = schedulesWithAppId
        .filter((s) => s.application_id) // Only include schedules with valid application_id
        .map((schedule) => ({
          application_id: schedule.application_id!,
          instalment_id: schedule.id,
          due_date: schedule.due_date,
          amount: Number(schedule.amount),
          paid: paidInstalmentIds.has(schedule.id),
        }));
    }
  }

  const schedulesByApp = new Map<string, typeof paymentSchedules>();
  paymentSchedules.forEach((s) => {
    if (!schedulesByApp.has(s.application_id)) {
      schedulesByApp.set(s.application_id, []);
    }
    schedulesByApp.get(s.application_id)!.push(s);
  });

  // Build report items
  const reportItems: ReportItem[] = data
    .map((app) => {
      const profile = profilesMap.get(app.student_id);
      if (!profile) return null;

      const schedules = schedulesByApp.get(app.id) || [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let overdueAmount: number | null = null;
      let overdueDays: number | null = null;

      if (reportType === "overdue_payments" || reportType === "debtors") {
        const overdue = schedules.filter((s) => {
          const dueDate = new Date(s.due_date);
          dueDate.setHours(0, 0, 0, 0);
          return !s.paid && dueDate < today;
        });

        if (overdue.length > 0) {
          overdueAmount = overdue.reduce((sum, s) => sum + s.amount, 0);
          const oldestOverdue = overdue[0];
          const oldestDueDate = new Date(oldestOverdue.due_date);
          overdueDays = Math.floor(
            (today.getTime() - oldestDueDate.getTime()) / (1000 * 60 * 60 * 24),
          );
        }
      }

      // Filter based on report type
      if (reportType === "awaiting_deposit") {
        if (app.deposit_payment_intent_id) {
          return null; // Deposit already paid
        }
      }

      if (reportType === "overdue_payments") {
        if (!overdueAmount || overdueAmount === 0) {
          return null; // No overdue payments
        }
      }

      if (reportType === "debtors") {
        // Debtors are students with any outstanding balance
        const totalDue = schedules.reduce((sum, s) => sum + s.amount, 0);
        const totalPaid = schedules.filter((s) => s.paid).reduce((sum, s) => sum + s.amount, 0);
        const outstanding = totalDue - totalPaid;
        if (outstanding <= 0) {
          return null; // No outstanding balance
        }
        overdueAmount = outstanding;
      }

      return {
        id: app.id,
        application_id: app.id,
        student_name: profile.name,
        student_email: profile.email,
        student_phone: profile.phone,
        contract_name: (app.contract as any)?.name || "—",
        studio_grade: (app.contract as any)?.studio_grade?.name || "—",
        status: app.status,
        deposit_paid: !!app.deposit_payment_intent_id,
        deposit_payment_intent_id: app.deposit_payment_intent_id,
        total_contract_value: app.total_contract_value,
        created_at: app.created_at,
        contract_start: (app.contract as any)?.contract_start || null,
        contract_end: (app.contract as any)?.contract_end || null,
        assigned_studio: (app.assigned_studio as any)?.studio_number || null,
        overdue_amount: overdueAmount,
        overdue_days: overdueDays,
      };
    })
    .filter((item): item is ReportItem => item !== null);

  return reportItems;
};

export const useReport = (reportType: ReportType) => {
  return useQuery({
    queryKey: ["report", reportType],
    queryFn: () => fetchReport(reportType),
  });
};

