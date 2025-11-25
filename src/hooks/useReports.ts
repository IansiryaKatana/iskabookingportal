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
  cashback_amount: number | null;
  adjusted_total: number | null;
  partner_name: string | null;
  commission_amount: number | null;
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

export type OccupancyReportItem = {
  studio_grade_id: string;
  studio_grade_name: string;
  total_studios: number;
  occupied_studios: number;
  available_studios: number;
  reserved_studios: number;
  maintenance_studios: number;
  occupancy_percentage: number;
  occupied_details: Array<{
    studio_id: string;
    studio_number: string;
    student_name: string;
    student_email: string;
    contract_name: string;
    contract_start: string | null;
    contract_end: string | null;
    application_id: string;
  }>;
};

export type OccupancyReport = {
  academic_year_id: string | null;
  academic_year_name: string | null;
  total_studios: number;
  total_occupied: number;
  total_available: number;
  total_reserved: number;
  total_maintenance: number;
  overall_occupancy_percentage: number;
  by_grade: OccupancyReportItem[];
};

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
      cashback_amount,
      referred_by_partner_id,
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

  // Fetch cashback and partner referral data
  const applicationIds = data.map((app) => app.id);
  const { data: cashbacksData } = await supabase
    .from("application_cashbacks")
    .select("application_id, cashback_amount")
    .in("application_id", applicationIds);

  const { data: partnerReferralsData } = await supabase
    .from("partner_referrals")
    .select(`
      application_id,
      commission_amount,
      partner:partners(name)
    `)
    .in("application_id", applicationIds);

  const cashbacksMap = new Map(
    (cashbacksData || []).map((c) => [c.application_id, c.cashback_amount])
  );

  const partnerReferralsMap = new Map(
    (partnerReferralsData || []).map((pr) => [
      pr.application_id,
      {
        partner_name: (pr.partner as any)?.name || null,
        commission_amount: pr.commission_amount,
      },
    ])
  );

  // Build report items
  const reportItems: ReportItem[] = data
    .map((app) => {
      const profile = profilesMap.get(app.student_id);
      // Fix: Handle cases where profile doesn't exist or has no name
      if (!profile || (!profile.name && !profile.email)) {
        // Try to get email from the emailsMap as fallback
        const email = emailsMap.get(app.student_id) || "";
        if (!email) return null; // Skip if we can't identify the student at all
        // Create a minimal profile with just email
        const minimalProfile = {
          name: email.split("@")[0] || "Student", // Use email username as fallback
          email: email,
          phone: null,
        };
        const cashbackAmount = cashbacksMap.get(app.id) || app.cashback_amount || null;
        const adjustedTotal = app.total_contract_value 
          ? (app.total_contract_value - (cashbackAmount || 0))
          : null;
        const partnerRef = partnerReferralsMap.get(app.id);
        
        return {
          id: app.id,
          application_id: app.id,
          student_name: minimalProfile.name,
          student_email: minimalProfile.email,
          student_phone: minimalProfile.phone,
          contract_name: (app.contract as any)?.name || "—",
          studio_grade: (app.contract as any)?.studio_grade?.name || "—",
          status: app.status,
          deposit_paid: !!app.deposit_payment_intent_id,
          deposit_payment_intent_id: app.deposit_payment_intent_id,
          total_contract_value: app.total_contract_value,
          cashback_amount: cashbackAmount,
          adjusted_total: adjustedTotal,
          partner_name: partnerRef?.partner_name || null,
          commission_amount: partnerRef?.commission_amount || null,
          created_at: app.created_at,
          contract_start: (app.contract as any)?.contract_start || null,
          contract_end: (app.contract as any)?.contract_end || null,
          assigned_studio: (app.assigned_studio as any)?.studio_number || null,
          overdue_amount: null,
          overdue_days: null,
        };
      }

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

      const cashbackAmount = cashbacksMap.get(app.id) || app.cashback_amount || null;
      const adjustedTotal = app.total_contract_value 
        ? (app.total_contract_value - (cashbackAmount || 0))
        : null;
      const partnerRef = partnerReferralsMap.get(app.id);

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
        cashback_amount: cashbackAmount,
        adjusted_total: adjustedTotal,
        partner_name: partnerRef?.partner_name || null,
        commission_amount: partnerRef?.commission_amount || null,
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

const fetchOccupancyReport = async (academicYearId?: string): Promise<OccupancyReport> => {
  // Get academic year info if provided
  let academicYearName: string | null = null;
  if (academicYearId) {
    const { data: academicYear } = await supabase
      .from("academic_years")
      .select("name")
      .eq("id", academicYearId)
      .single();
    academicYearName = academicYear?.name || null;
  }

  // Fetch studio status by academic year
  let studioStatusQuery = supabase
    .from("studio_status_by_academic_year")
    .select(`
      studio_id,
      studio_number,
      studio_grade_id,
      effective_status,
      academic_year_id,
      academic_year_name
    `)
    .eq("is_active", true);

  if (academicYearId) {
    studioStatusQuery = studioStatusQuery.eq("academic_year_id", academicYearId);
  }

  const { data: studioStatuses, error: statusError } = await studioStatusQuery;

  if (statusError) {
    console.error("Failed to fetch studio statuses:", statusError);
    throw statusError;
  }

  if (!studioStatuses || studioStatuses.length === 0) {
    return {
      academic_year_id: academicYearId || null,
      academic_year_name: academicYearName,
      total_studios: 0,
      total_occupied: 0,
      total_available: 0,
      total_reserved: 0,
      total_maintenance: 0,
      overall_occupancy_percentage: 0,
      by_grade: [],
    };
  }

  // Get studio grades info
  const gradeIds = [...new Set(studioStatuses.map((s) => s.studio_grade_id))];
  const { data: studioGrades } = await supabase
    .from("studio_grades")
    .select("id, name")
    .in("id", gradeIds);

  const gradesMap = new Map((studioGrades || []).map((g) => [g.id, g.name]));

  // Get occupied studios with student info
  const occupiedStudioIds = studioStatuses
    .filter((s) => s.effective_status === "occupied")
    .map((s) => s.studio_id);

  let occupiedDetails: OccupancyReportItem["occupied_details"] = [];
  if (occupiedStudioIds.length > 0) {
    // Get applications for occupied studios
    let applicationsQuery = supabase
      .from("student_applications")
      .select(`
        id,
        student_id,
        assigned_studio_id,
        status,
        contract:contracts(
          name,
          contract_start,
          contract_end,
          academic_year_id
        )
      `)
      .eq("status", "confirmed")
      .in("assigned_studio_id", occupiedStudioIds);

    const { data: applicationsData } = await applicationsQuery;
    
    // Filter by academic year if provided
    const applications = academicYearId 
      ? (applicationsData || []).filter((app) => (app.contract as any)?.academic_year_id === academicYearId)
      : (applicationsData || []);

    if (applications && applications.length > 0) {
      // Get student profiles
      const studentIds = [...new Set(applications.map((app) => app.student_id).filter((id): id is string => Boolean(id)))];
      
      let profiles: any[] = [];
      if (studentIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", studentIds);
        profiles = profilesData || [];
      }

      // Get emails
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
        (profiles || []).map((p) => [
          p.id,
          {
            name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || emailsMap.get(p.id)?.split("@")[0] || "Student",
            email: emailsMap.get(p.id) || "",
          },
        ])
      );

      // Get studio numbers
      const { data: studios } = await supabase
        .from("studios")
        .select("id, studio_number")
        .in("id", occupiedStudioIds);

      const studiosMap = new Map((studios || []).map((s) => [s.id, s.studio_number]));

      occupiedDetails = applications
        .map((app) => {
          const profile = profilesMap.get(app.student_id);
          const studioNumber = studiosMap.get(app.assigned_studio_id || "");
          if (!profile || !studioNumber) return null;

          return {
            studio_id: app.assigned_studio_id || "",
            studio_number: studioNumber,
            student_name: profile.name,
            student_email: profile.email,
            contract_name: (app.contract as any)?.name || "—",
            contract_start: (app.contract as any)?.contract_start || null,
            contract_end: (app.contract as any)?.contract_end || null,
            application_id: app.id,
          };
        })
        .filter((item): item is OccupancyReportItem["occupied_details"][0] => item !== null);
    }
  }

  // Group by studio grade
  const byGradeMap = new Map<string, {
    studio_grade_id: string;
    studios: typeof studioStatuses;
  }>();

  studioStatuses.forEach((status) => {
    if (!byGradeMap.has(status.studio_grade_id)) {
      byGradeMap.set(status.studio_grade_id, {
        studio_grade_id: status.studio_grade_id,
        studios: [],
      });
    }
    byGradeMap.get(status.studio_grade_id)!.studios.push(status);
  });

  const byGrade: OccupancyReportItem[] = Array.from(byGradeMap.values()).map((gradeData) => {
    const studios = gradeData.studios;
    const total = studios.length;
    const occupied = studios.filter((s) => s.effective_status === "occupied").length;
    const available = studios.filter((s) => s.effective_status === "available").length;
    const reserved = studios.filter((s) => s.effective_status === "reserved").length;
    const maintenance = studios.filter((s) => s.effective_status === "maintenance").length;

    return {
      studio_grade_id: gradeData.studio_grade_id,
      studio_grade_name: gradesMap.get(gradeData.studio_grade_id) || "Unknown",
      total_studios: total,
      occupied_studios: occupied,
      available_studios: available,
      reserved_studios: reserved,
      maintenance_studios: maintenance,
      occupancy_percentage: total > 0 ? Math.round((occupied / total) * 100 * 100) / 100 : 0,
      occupied_details: occupiedDetails.filter((detail) => {
        const studio = studios.find((s) => s.studio_id === detail.studio_id);
        return studio !== undefined;
      }),
    };
  });

  // Calculate totals
  const total_studios = studioStatuses.length;
  const total_occupied = studioStatuses.filter((s) => s.effective_status === "occupied").length;
  const total_available = studioStatuses.filter((s) => s.effective_status === "available").length;
  const total_reserved = studioStatuses.filter((s) => s.effective_status === "reserved").length;
  const total_maintenance = studioStatuses.filter((s) => s.effective_status === "maintenance").length;
  const overall_occupancy_percentage = total_studios > 0 
    ? Math.round((total_occupied / total_studios) * 100 * 100) / 100 
    : 0;

  return {
    academic_year_id: academicYearId || null,
    academic_year_name: academicYearName,
    total_studios,
    total_occupied,
    total_available,
    total_reserved,
    total_maintenance,
    overall_occupancy_percentage,
    by_grade: byGrade.sort((a, b) => a.studio_grade_name.localeCompare(b.studio_grade_name)),
  };
};

export const useOccupancyReport = (academicYearId?: string) => {
  return useQuery({
    queryKey: ["occupancy-report", academicYearId],
    queryFn: () => fetchOccupancyReport(academicYearId),
  });
};

