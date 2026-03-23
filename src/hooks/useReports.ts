import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
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
  discount_amount: number | null;
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
  | "occupancy"
  | "studio-allocation"
  | "no_instalment_payments";

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

export type StudioAllocationReportItem = {
  studio_grade_id: string;
  studio_grade_name: string;
  studio_grade_slug: string;
  total_studios: number;
  active_studios: number;
  allocated_to_students: number;
  allocated_to_ota: number;
  allocated_to_keyworkers: number;
  unallocated: number;
  status_available: number;
  status_occupied: number;
  status_reserved: number;
  status_maintenance: number;
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

const fetchReport = async (
  reportType: ReportType,
  academicYearId?: string,
): Promise<ReportItem[]> => {
  let statusFilter: string[] = [];
  let additionalFilters = "";

  switch (reportType) {
    case "awaiting_signatures":
      statusFilter = ["awaiting_signature"];
      break;
    case "awaiting_deposit":
      statusFilter = ["awaiting_deposit"];
      break;
    case "no_instalment_payments":
      statusFilter = ["confirmed", "awaiting_signature", "awaiting_deposit"];
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
      student_id,
      contract_id,
      status,
      deposit_payment_intent_id,
      total_contract_value,
      cashback_amount,
      discount_amount,
      referred_by_partner_id,
      created_at,
      contract:contracts!contract_id(
        name,
        contract_start,
        contract_end,
        academic_year_id,
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

  const applications = data as any[];

  const filteredApplications =
    academicYearId && reportType !== "occupancy" && reportType !== "studio-allocation"
      ? applications.filter((app) => (app.contract as any)?.academic_year_id === academicYearId)
      : applications;

  if (filteredApplications.length === 0) {
    return [];
  }

  // Fetch student profiles
  const studentIds = [
    ...new Set(
      filteredApplications.map((app) => app.student_id).filter((id): id is string => Boolean(id)),
    ),
  ];

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

  if (
    reportType === "overdue_payments" ||
    reportType === "debtors" ||
    reportType === "no_instalment_payments"
  ) {
    // Get contract_ids from applications
    const contractIds = [
      ...new Set(
        filteredApplications
          .map((app) => app.contract_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    
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
    const applicationContractMap = new Map(
      filteredApplications.map((app) => [app.contract_id, app.id]),
    );
    const schedulesWithAppId = schedules.map((schedule) => ({
      ...schedule,
      application_id: applicationContractMap.get(schedule.contract_id) || null,
    }));

    if (schedulesWithAppId && schedulesWithAppId.length > 0) {
      // Check which instalments are paid via manual_payments or Stripe (stripe_payments)
      const instalmentIds = schedulesWithAppId.map((s) => s.id);
      
      // Check manual payments
      const { data: manualPayments } = await supabase
        .from("manual_payments")
        .select("instalment_id")
        .in("instalment_id", instalmentIds);
      
      // Check Stripe instalment payments (stripe_payments stores instalment_id in metadata)
      const paidInstalmentIds = new Set((manualPayments || []).map((p) => p.instalment_id));
      const instalmentIdStrs = instalmentIds.map((id) => String(id));
      const { data: stripeInstalmentPayments } = await supabase
        .from("stripe_payments")
        .select("metadata")
        .eq("payment_type", "instalment")
        .in("status", ["succeeded", "completed"]);
      (stripeInstalmentPayments || []).forEach((sp: { metadata?: { instalment_id?: string } | null }) => {
        const instId = sp.metadata?.instalment_id;
        if (instId && instalmentIdStrs.includes(instId)) paidInstalmentIds.add(instId);
      });
      // Normalise to schedule id type (UUID string) for .has() below
      const paidSet = new Set(instalmentIds.filter((id) => paidInstalmentIds.has(String(id))));

      paymentSchedules = schedulesWithAppId
        .filter((s) => s.application_id) // Only include schedules with valid application_id
        .map((schedule) => ({
          application_id: schedule.application_id!,
          instalment_id: schedule.id,
          due_date: schedule.due_date,
          amount: Number(schedule.amount),
          paid: paidSet.has(schedule.id),
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
  const applicationIds = filteredApplications.map((app) => app.id);
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
  const reportItems: ReportItem[] = filteredApplications
    .map((app) => {
      const profile = profilesMap.get(app.student_id);
      // Fix: Handle cases where profile doesn't exist or has no name
      let effectiveProfile = profile;
      if (!effectiveProfile || (!effectiveProfile.name && !effectiveProfile.email)) {
        // Try to get email from the emailsMap as fallback
        const email = emailsMap.get(app.student_id) || "";
        effectiveProfile = {
          name: email ? email.split("@")[0] || "Student" : "Student",
          email,
          phone: null,
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

      if (reportType === "no_instalment_payments") {
        const hasPaidInstalment = schedules.some((s) => s.paid);
        if (schedules.length > 0 && hasPaidInstalment) {
          return null; // At least one instalment payment recorded
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
      const discountAmount = app.discount_amount ?? null;
      const adjustedTotal = app.total_contract_value
        ? (app.total_contract_value - (cashbackAmount || 0) - (discountAmount || 0))
        : null;
      const partnerRef = partnerReferralsMap.get(app.id);

      return {
        id: app.id,
        application_id: app.id,
        student_name: effectiveProfile.name,
        student_email: effectiveProfile.email,
        student_phone: effectiveProfile.phone,
        contract_name: (app.contract as any)?.name || "—",
        studio_grade: (app.contract as any)?.studio_grade?.name || "—",
        status: app.status,
        deposit_paid: !!app.deposit_payment_intent_id,
        deposit_payment_intent_id: app.deposit_payment_intent_id,
        total_contract_value: app.total_contract_value,
        cashback_amount: cashbackAmount,
        discount_amount: discountAmount,
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

export const useReport = (reportType: ReportType, academicYearId?: string) => {
  return useQuery({
    queryKey: ["report", reportType, academicYearId ?? "all"],
    queryFn: () => fetchReport(reportType, academicYearId),
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
        contract:contracts!contract_id(
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

const fetchStudioAllocationReport = async (): Promise<StudioAllocationReportItem[]> => {
  const { data, error } = await supabase
    .from("studio_allocation_report")
    .select("*")
    .order("studio_grade_name", { ascending: true });

  if (error) {
    console.error("Failed to fetch studio allocation report:", error);
    throw error;
  }

  return (data || []) as StudioAllocationReportItem[];
};

export const useStudioAllocationReport = () =>
  useQuery({
    queryKey: ["studio-allocation-report"],
    queryFn: fetchStudioAllocationReport,
  });

// =============================================================================
// Additional Operational Reports
// =============================================================================

export type ApplicationsPipelineStatusSummary = {
  status: ApplicationRow["status"];
  count: number;
};

export type ApplicationsPipelineReport = {
  total: number;
  byStatus: ApplicationsPipelineStatusSummary[];
};

const fetchApplicationsPipelineReport = async (
  academicYearId?: string,
): Promise<ApplicationsPipelineReport> => {
  let query = supabase
    .from("student_applications")
    .select(
      `
      id,
      status,
      contract:contracts!contract_id(
        academic_year_id
      )
    `,
    );

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch applications pipeline report:", error);
    throw error;
  }

  const rows =
    (data || []) as Array<{
      id: string;
      status: ApplicationRow["status"];
      contract: { academic_year_id: string | null } | null;
    }>;

  const filtered = academicYearId
    ? rows.filter((row) => (row.contract as any)?.academic_year_id === academicYearId)
    : rows;

  const total = filtered.length;
  const counts = new Map<ApplicationRow["status"], number>();

  filtered.forEach((row) => {
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  });

  const byStatus: ApplicationsPipelineStatusSummary[] = Array.from(counts.entries()).map(
    ([status, count]) => ({
      status,
      count,
    }),
  );

  return { total, byStatus };
};

export const useApplicationsPipelineReport = (academicYearId?: string) => {
  return useQuery({
    queryKey: ["applications-pipeline-report", academicYearId],
    queryFn: () => fetchApplicationsPipelineReport(academicYearId),
  });
};

export type PendingDocumentReportItem = {
  id: string;
  application_id: string;
  student_id: string | null;
  student_name: string;
  student_email: string;
  document_type: string;
  status: string;
  uploaded_at: string | null;
};

const fetchPendingDocumentsReport = async (): Promise<PendingDocumentReportItem[]> => {
  const { data: docs, error } = await supabase
    .from("student_documents")
    .select("id, application_id, document_type, status, uploaded_at")
    .eq("status", "pending");

  if (error) {
    console.error("Failed to fetch pending documents report:", error);
    throw error;
  }

  if (!docs || docs.length === 0) {
    return [];
  }

  const applicationIds = [
    ...new Set(docs.map((d) => d.application_id).filter((id): id is string => Boolean(id))),
  ];

  let applications: Array<{ id: string; student_id: string | null }> = [];
  if (applicationIds.length > 0) {
    const { data: appsData, error: appsError } = await supabase
      .from("student_applications")
      .select("id, student_id")
      .in("id", applicationIds);

    if (appsError) {
      console.error("Failed to fetch applications for pending documents report:", appsError);
      throw appsError;
    }

    applications = appsData || [];
  }

  const appById = new Map(applications.map((app) => [app.id, app]));
  const studentIds = [
    ...new Set(
      applications
        .map((app) => app.student_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  let profiles: any[] = [];
  if (studentIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", studentIds);

    profiles = profilesData || [];
  }

  const emailsMap = new Map<string, string>();
  try {
    if (studentIds.length > 0) {
      const { data, error: emailsError } = await supabase.functions.invoke("get-user-emails", {
        body: { userIds: studentIds },
      });

      if (!emailsError && data?.emails) {
        Object.entries(data.emails).forEach(([userId, email]) => {
          emailsMap.set(userId, email as string);
        });
      }
    }
  } catch (error) {
    console.warn("Could not fetch user emails for pending documents report:", error);
  }

  const profilesMap = new Map(
    (profiles || []).map((p) => [
      p.id,
      {
        first_name: p.first_name,
        last_name: p.last_name,
      },
    ]),
  );

  return docs.map((doc) => {
    const app = appById.get(doc.application_id);
    const studentId = app?.student_id ?? null;

    let student_name = "Student";
    let student_email = "";

    if (studentId) {
      const profile = profilesMap.get(studentId);
      const email = emailsMap.get(studentId) || "";
      const nameFromProfile =
        ((profile?.first_name || "") + " " + (profile?.last_name || "")).trim();

      student_email = email;
      if (nameFromProfile) {
        student_name = nameFromProfile;
      } else if (email) {
        student_name = email.split("@")[0] || "Student";
      }
    }

    return {
      id: doc.id,
      application_id: doc.application_id,
      student_id: studentId,
      student_name,
      student_email,
      document_type: doc.document_type,
      status: doc.status,
      uploaded_at: doc.uploaded_at,
    };
  });
};

export const usePendingDocumentsReport = () => {
  return useQuery({
    queryKey: ["pending-documents-report"],
    queryFn: fetchPendingDocumentsReport,
  });
};

export type MoveOutWindow = "7" | "14" | "30" | "all";

export type MoveOutReportItem = {
  application_id: string;
  student_id: string | null;
  student_name: string;
  student_email: string;
  contract_name: string;
  contract_end: string;
  studio_number: string | null;
  academic_year_name: string | null;
};

const fetchMoveOutsReport = async (
  window: MoveOutWindow,
  academicYearId?: string,
): Promise<MoveOutReportItem[]> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDateStr = today.toISOString().split("T")[0];

  let endDateStr: string | null = null;
  if (window !== "all") {
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + Number(window));
    endDate.setHours(23, 59, 59, 999);
    endDateStr = endDate.toISOString().split("T")[0];
  }

  const { data, error } = await supabase
    .from("student_applications")
    .select(
      `
      id,
      student_id,
      status,
      contract_end,
      contract:contracts!contract_id(
        name,
        academic_year_id,
        academic_year:academic_years!academic_year_id(name)
      ),
      assigned_studio:studios!assigned_studio_id(studio_number)
    `,
    )
    .eq("status", "confirmed")
    .not("contract_end", "is", null)
    .gte("contract_end", startDateStr);

  if (error) {
    console.error("Failed to fetch move-outs report:", error);
    throw error;
  }

  if (!data || data.length === 0) {
    return [];
  }

  const rows = data as Array<{
    id: string;
    student_id: string | null;
    status: ApplicationRow["status"];
    contract_end: string | null;
    contract: {
      name: string | null;
      academic_year_id: string | null;
      academic_year: { name: string | null } | null;
    } | null;
    assigned_studio: { studio_number: string | null } | null;
  }>;

  const filteredByWindow = rows.filter((row) => {
    if (!row.contract_end) return false;
    const end = new Date(row.contract_end);
    end.setHours(0, 0, 0, 0);
    if (end < today) return false;
    if (endDateStr) {
      const maxEnd = new Date(endDateStr);
      maxEnd.setHours(23, 59, 59, 999);
      if (end > maxEnd) return false;
    }
    return true;
  });

  const filteredByYear = academicYearId
    ? filteredByWindow.filter(
        (row) => (row.contract as any)?.academic_year_id === academicYearId,
      )
    : filteredByWindow;

  if (filteredByYear.length === 0) {
    return [];
  }

  const studentIds = [
    ...new Set(
      filteredByYear
        .map((row) => row.student_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  let profiles: any[] = [];
  if (studentIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", studentIds);

    profiles = profilesData || [];
  }

  const emailsMap = new Map<string, string>();
  try {
    if (studentIds.length > 0) {
      const { data, error: emailsError } = await supabase.functions.invoke("get-user-emails", {
        body: { userIds: studentIds },
      });

      if (!emailsError && data?.emails) {
        Object.entries(data.emails).forEach(([userId, email]) => {
          emailsMap.set(userId, email as string);
        });
      }
    }
  } catch (error) {
    console.warn("Could not fetch user emails for move-outs report:", error);
  }

  const profilesMap = new Map(
    (profiles || []).map((p) => [
      p.id,
      {
        first_name: p.first_name,
        last_name: p.last_name,
      },
    ]),
  );

  return filteredByYear.map((row) => {
    const studentId = row.student_id;
    let student_name = "Student";
    let student_email = "";

    if (studentId) {
      const profile = profilesMap.get(studentId);
      const email = emailsMap.get(studentId) || "";
      const nameFromProfile =
        ((profile?.first_name || "") + " " + (profile?.last_name || "")).trim();

      student_email = email;
      if (nameFromProfile) {
        student_name = nameFromProfile;
      } else if (email) {
        student_name = email.split("@")[0] || "Student";
      }
    }

    return {
      application_id: row.id,
      student_id: row.student_id,
      student_name,
      student_email,
      contract_name: (row.contract as any)?.name || "—",
      contract_end: row.contract_end!,
      studio_number: row.assigned_studio?.studio_number ?? null,
      academic_year_name: row.contract?.academic_year?.name ?? null,
    };
  });
};

export const useMoveOutsReport = (window: MoveOutWindow, academicYearId?: string) => {
  return useQuery({
    queryKey: ["move-outs-report", window, academicYearId],
    queryFn: () => fetchMoveOutsReport(window, academicYearId),
  });
};

// =============================================================================
// Room No Income Summary (OTA-assigned studios)
// =============================================================================

export type RoomNoIncomeSummaryRow = {
  studio_id: string;
  room_no: string;
  studio_grade_name: string;
  total_res: number;
  total_nights: number;
  accom: number;
  discount: number;
  other: number;
  total: number;
  avg_accom: number;
  avg_discount: number;
  avg_other: number;
  avg_daily_tariff: number;
  occupancy_pct: number;
  revenue_per_day: number;
  revenue_per_week: number;
  revenue_per_month: number;
  revenue_per_year: number;
};

export type RoomNoIncomeSummaryReport = {
  rows: RoomNoIncomeSummaryRow[];
  grandTotal: {
    total_res: number;
    total_nights: number;
    accom: number;
    discount: number;
    other: number;
    total: number;
    avg_accom: number;
    avg_daily_tariff: number;
    occupancy_pct: number;
  };
  dateFrom: string;
  dateTo: string;
  daysInRange: number;
};

function nightsInRange(
  contractStart: string,
  contractEnd: string,
  rangeStart: string,
  rangeEnd: string,
): number {
  const start = new Date(Math.max(new Date(contractStart).getTime(), new Date(rangeStart).getTime()));
  const end = new Date(Math.min(new Date(contractEnd).getTime(), new Date(rangeEnd).getTime()));
  if (start > end) return 0;
  return differenceInCalendarDays(end, start) + 1;
}

function nightsInRangeExclusiveEnd(
  bookingStart: string,
  bookingEnd: string,
  rangeStart: string,
  rangeEnd: string,
): number {
  const start = new Date(Math.max(new Date(bookingStart).getTime(), new Date(rangeStart).getTime()));
  const end = new Date(Math.min(new Date(bookingEnd).getTime(), new Date(rangeEnd).getTime()));
  return Math.max(0, differenceInCalendarDays(end, start));
}

const fetchRoomNoIncomeSummaryReport = async (
  dateFrom: string,
  dateTo: string,
): Promise<RoomNoIncomeSummaryReport | null> => {
  if (!dateFrom || !dateTo) return null;

  const rangeStart = new Date(dateFrom);
  const rangeEnd = new Date(dateTo);
  const daysInRange = differenceInCalendarDays(rangeEnd, rangeStart) + 1;
  if (daysInRange <= 0) return null;

  const { data: otaStudios, error: studiosError } = await supabase
    .from("studios")
    .select("id, studio_number, studio_grade_id, studio_grade:studio_grades!studio_grade_id(name)")
    .eq("allocation", "OTA")
    .eq("is_active", true)
    .order("studio_number", { ascending: true });

  if (studiosError) {
    console.error("Failed to fetch OTA studios:", studiosError);
    throw studiosError;
  }

  if (!otaStudios || otaStudios.length === 0) {
    return {
      rows: [],
      grandTotal: {
        total_res: 0,
        total_nights: 0,
        accom: 0,
        discount: 0,
        other: 0,
        total: 0,
        avg_accom: 0,
        avg_daily_tariff: 0,
        occupancy_pct: 0,
      },
      dateFrom,
      dateTo,
      daysInRange,
    };
  }

  const studioIds = otaStudios.map((s) => s.id);

  const { data: applications, error: appsError } = await supabase
    .from("student_applications")
    .select(
      `
      id,
      assigned_studio_id,
      total_contract_value,
      discount_amount,
      contract:contracts!contract_id(contract_start, contract_end)
    `,
    )
    .eq("status", "confirmed")
    .in("assigned_studio_id", studioIds)
    .not("assigned_studio_id", "is", null);

  if (appsError) {
    console.error("Failed to fetch applications for room income summary:", appsError);
    throw appsError;
  }

  const apps = (applications || []).filter((app: any) => {
    const start = app.contract?.contract_start;
    const end = app.contract?.contract_end;
    if (!start || !end) return false;
    const overlapStart = new Date(Math.max(new Date(start).getTime(), rangeStart.getTime()));
    const overlapEnd = new Date(Math.min(new Date(end).getTime(), rangeEnd.getTime()));
    return overlapStart <= overlapEnd;
  });

  const studioMap = new Map(
    otaStudios.map((s: any) => [
      s.id,
      {
        studio_number: s.studio_number,
        studio_grade_name: s.studio_grade?.name ?? "—",
      },
    ]),
  );

  const byStudio = new Map<
    string,
    {
      total_res: number;
      total_nights: number;
      accom: number;
      discount: number;
      other: number;
    }
  >();

  apps.forEach((app: any) => {
    const sid = app.assigned_studio_id;
    if (!sid) return;
    const contractStart = app.contract?.contract_start ?? "";
    const contractEnd = app.contract?.contract_end ?? "";
    const nights = nightsInRange(contractStart, contractEnd, dateFrom, dateTo);
    const accom = Number(app.total_contract_value) || 0;
    const discount = Number(app.discount_amount) || 0;
    const other = 0;

    if (!byStudio.has(sid)) {
      byStudio.set(sid, { total_res: 0, total_nights: 0, accom: 0, discount: 0, other: 0 });
    }
    const agg = byStudio.get(sid)!;
    agg.total_res += 1;
    agg.total_nights += nights;
    agg.accom += accom;
    agg.discount += discount;
    agg.other += other;
  });

  const rows: RoomNoIncomeSummaryRow[] = [];
  let grandRes = 0;
  let grandNights = 0;
  let grandAccom = 0;
  let grandDiscount = 0;
  let grandOther = 0;

  for (const studio of otaStudios as any[]) {
    const sid = studio.id;
    const agg = byStudio.get(sid) ?? {
      total_res: 0,
      total_nights: 0,
      accom: 0,
      discount: 0,
      other: 0,
    };
    const total = agg.accom - agg.discount + agg.other;
    const totalRes = agg.total_res;
    const totalNights = agg.total_nights;
    const avg_accom = totalRes > 0 ? total / totalRes : 0;
    const avg_discount = totalRes > 0 ? agg.discount / totalRes : 0;
    const avg_other = totalRes > 0 ? agg.other / totalRes : 0;
    const avg_daily_tariff = totalNights > 0 ? total / totalNights : 0;
    const occupancy_pct = daysInRange > 0 ? (totalNights / daysInRange) * 100 : 0;
    const revenue_per_day = daysInRange > 0 ? total / daysInRange : 0;
    const revenue_per_week = daysInRange > 0 ? (total / daysInRange) * 7 : 0;
    const revenue_per_month = daysInRange > 0 ? (total / daysInRange) * (365 / 12) : 0;
    const revenue_per_year = daysInRange > 0 ? (total / daysInRange) * 365 : 0;

    rows.push({
      studio_id: sid,
      room_no: studio.studio_number,
      studio_grade_name: studio.studio_grade?.name ?? "—",
      total_res: totalRes,
      total_nights: totalNights,
      accom: agg.accom,
      discount: agg.discount,
      other: agg.other,
      total,
      avg_accom,
      avg_discount,
      avg_other,
      avg_daily_tariff,
      occupancy_pct,
      revenue_per_day,
      revenue_per_week,
      revenue_per_month,
      revenue_per_year,
    });

    grandRes += totalRes;
    grandNights += totalNights;
    grandAccom += agg.accom;
    grandDiscount += agg.discount;
    grandOther += agg.other;
  }

  const grandTotalSum = grandAccom - grandDiscount + grandOther;
  const grandAvgAccom = grandRes > 0 ? grandTotalSum / grandRes : 0;
  const grandAvgDailyTariff = grandNights > 0 ? grandTotalSum / grandNights : 0;
  const grandOccupancyPct = daysInRange > 0 ? (grandNights / daysInRange) * 100 : 0;

  return {
    rows,
    grandTotal: {
      total_res: grandRes,
      total_nights: grandNights,
      accom: grandAccom,
      discount: grandDiscount,
      other: grandOther,
      total: grandTotalSum,
      avg_accom: grandAvgAccom,
      avg_daily_tariff: grandAvgDailyTariff,
      occupancy_pct: grandOccupancyPct,
    },
    dateFrom,
    dateTo,
    daysInRange,
  };
};

export const useRoomNoIncomeSummaryReport = (dateFrom: string, dateTo: string) => {
  return useQuery({
    queryKey: ["room-no-income-summary", dateFrom, dateTo],
    queryFn: () => fetchRoomNoIncomeSummaryReport(dateFrom, dateTo),
    enabled: Boolean(dateFrom && dateTo),
  });
};

// =============================================================================
// OTA Studio Income Summary (from ota_bookings table - staff-added OTA bookings)
// =============================================================================

const fetchOTAStudioIncomeSummaryReport = async (
  dateFrom: string,
  dateTo: string,
): Promise<RoomNoIncomeSummaryReport | null> => {
  if (!dateFrom || !dateTo) return null;

  const rangeStart = new Date(dateFrom);
  const rangeEnd = new Date(dateTo);
  const daysInRange = differenceInCalendarDays(rangeEnd, rangeStart) + 1;
  if (daysInRange <= 0) return null;

  const { data: otaStudios, error: studiosError } = await supabase
    .from("studios")
    .select("id, studio_number, studio_grade_id, studio_grade:studio_grades!studio_grade_id(name)")
    .eq("allocation", "OTA")
    .eq("is_active", true)
    .order("studio_number", { ascending: true });

  if (studiosError) {
    console.error("Failed to fetch OTA studios:", studiosError);
    throw studiosError;
  }

  if (!otaStudios || otaStudios.length === 0) {
    return {
      rows: [],
      grandTotal: {
        total_res: 0,
        total_nights: 0,
        accom: 0,
        discount: 0,
        other: 0,
        total: 0,
        avg_accom: 0,
        avg_daily_tariff: 0,
        occupancy_pct: 0,
      },
      dateFrom,
      dateTo,
      daysInRange,
    };
  }

  const studioIds = otaStudios.map((s) => s.id);

  const { data: bookings, error: bookingsError } = await supabase
    .from("ota_bookings")
    .select("id, studio_id, check_in, check_out, price_per_night, commission_amount, total_revenue, number_of_nights, status")
    .in("studio_id", studioIds)
    .not("studio_id", "is", null);

  if (bookingsError) {
    console.error("Failed to fetch OTA bookings for income summary:", bookingsError);
    throw bookingsError;
  }

  const excludedStatuses = ["cancelled", "no_show"];
  const bookingsList = (bookings || []).filter((b: any) => {
    if (excludedStatuses.includes(b.status)) return false;
    return nightsInRangeExclusiveEnd(b.check_in, b.check_out, dateFrom, dateTo) > 0;
  });

  const byStudio = new Map<
    string,
    { total_res: number; total_nights: number; accom: number; discount: number; other: number }
  >();

  bookingsList.forEach((b: any) => {
    const sid = b.studio_id;
    if (!sid) return;
    const nights = nightsInRangeExclusiveEnd(b.check_in, b.check_out, dateFrom, dateTo);
    if (nights <= 0) return;
    const numNights = Number(b.number_of_nights) || 1;
    const pricePerNight = Number(b.price_per_night) || 0;
    const commission = Number(b.commission_amount) || 0;
    const totalRev = Number(b.total_revenue) ?? pricePerNight * numNights - commission;
    const ratio = numNights > 0 ? nights / numNights : 0;
    const accom = pricePerNight * nights;
    const discount = commission * ratio;
    const total = totalRev * ratio;

    if (!byStudio.has(sid)) {
      byStudio.set(sid, { total_res: 0, total_nights: 0, accom: 0, discount: 0, other: 0 });
    }
    const agg = byStudio.get(sid)!;
    agg.total_res += 1;
    agg.total_nights += nights;
    agg.accom += accom;
    agg.discount += discount;
    agg.other += 0;
  });

  const rows: RoomNoIncomeSummaryRow[] = [];
  let grandRes = 0;
  let grandNights = 0;
  let grandAccom = 0;
  let grandDiscount = 0;
  let grandOther = 0;

  for (const studio of otaStudios as any[]) {
    const sid = studio.id;
    const agg = byStudio.get(sid) ?? {
      total_res: 0,
      total_nights: 0,
      accom: 0,
      discount: 0,
      other: 0,
    };
    const total = agg.accom - agg.discount + agg.other;
    const totalRes = agg.total_res;
    const totalNights = agg.total_nights;
    const avg_accom = totalRes > 0 ? total / totalRes : 0;
    const avg_discount = totalRes > 0 ? agg.discount / totalRes : 0;
    const avg_other = 0;
    const avg_daily_tariff = totalNights > 0 ? total / totalNights : 0;
    const occupancy_pct = daysInRange > 0 ? (totalNights / daysInRange) * 100 : 0;
    const revenue_per_day = daysInRange > 0 ? total / daysInRange : 0;
    const revenue_per_week = daysInRange > 0 ? (total / daysInRange) * 7 : 0;
    const revenue_per_month = daysInRange > 0 ? (total / daysInRange) * (365 / 12) : 0;
    const revenue_per_year = daysInRange > 0 ? (total / daysInRange) * 365 : 0;

    rows.push({
      studio_id: sid,
      room_no: studio.studio_number,
      studio_grade_name: studio.studio_grade?.name ?? "—",
      total_res: totalRes,
      total_nights: totalNights,
      accom: agg.accom,
      discount: agg.discount,
      other: agg.other,
      total,
      avg_accom,
      avg_discount,
      avg_other,
      avg_daily_tariff,
      occupancy_pct,
      revenue_per_day,
      revenue_per_week,
      revenue_per_month,
      revenue_per_year,
    });

    grandRes += totalRes;
    grandNights += totalNights;
    grandAccom += agg.accom;
    grandDiscount += agg.discount;
    grandOther += agg.other;
  }

  const grandTotalSum = grandAccom - grandDiscount + grandOther;
  const grandAvgAccom = grandRes > 0 ? grandTotalSum / grandRes : 0;
  const grandAvgDailyTariff = grandNights > 0 ? grandTotalSum / grandNights : 0;
  const grandOccupancyPct = daysInRange > 0 ? (grandNights / daysInRange) * 100 : 0;

  return {
    rows,
    grandTotal: {
      total_res: grandRes,
      total_nights: grandNights,
      accom: grandAccom,
      discount: grandDiscount,
      other: grandOther,
      total: grandTotalSum,
      avg_accom: grandAvgAccom,
      avg_daily_tariff: grandAvgDailyTariff,
      occupancy_pct: grandOccupancyPct,
    },
    dateFrom,
    dateTo,
    daysInRange,
  };
};

export const useOTAStudioIncomeSummaryReport = (dateFrom: string, dateTo: string) => {
  return useQuery({
    queryKey: ["ota-studio-income-summary", dateFrom, dateTo],
    queryFn: () => fetchOTAStudioIncomeSummaryReport(dateFrom, dateTo),
    enabled: Boolean(dateFrom && dateTo),
  });
};

