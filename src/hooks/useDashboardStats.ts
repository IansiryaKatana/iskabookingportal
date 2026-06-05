import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isUnauthorizedAuthError } from "@/utils/authErrors";

export type DashboardStats = {
  totalStudents: number;
  totalApplications: number;
  totalRevenue: number;
  occupancy: {
    total: number;
    occupied: number;
    percentage: number;
  };
  upcomingInstalments: {
    count: number;
    totalAmount: number;
    nextDueDate: string | null;
  };
  pendingVerifications: number;
  recentApplications: number; // Applications in last 7 days
  confirmedApplications: number;
};

export type DashboardBreakdowns = {
  students: {
    total: number;
    withApplication: number;
    confirmed: number;
    inPipeline: number;
    withoutApplication: number;
  };
  applications: {
    total: number;
    byStatus: Record<string, number>;
    customContracts: number;
    defaultContracts: number;
  };
};

type RpcRow = {
  total_students: number | null;
  total_applications: number | null;
  confirmed_applications: number | null;
  recent_applications: number | null;
  total_revenue: number | null;
  occupancy_total: number | null;
  occupancy_occupied: number | null;
  occupancy_percentage: number | null;
  upcoming_instalments_count: number | null;
  upcoming_instalments_total: number | null;
  upcoming_instalments_next_due: string | null;
  pending_verifications: number | null;
};

const normalizeRow = (row?: RpcRow | null): DashboardStats => {
  return {
    totalStudents: Number(row?.total_students ?? 0),
    totalApplications: Number(row?.total_applications ?? 0),
    confirmedApplications: Number(row?.confirmed_applications ?? 0),
    recentApplications: Number(row?.recent_applications ?? 0),
    totalRevenue: Number(row?.total_revenue ?? 0),
    occupancy: {
      total: Number(row?.occupancy_total ?? 0),
      occupied: Number(row?.occupancy_occupied ?? 0),
      percentage: Number(row?.occupancy_percentage ?? 0),
    },
    upcomingInstalments: {
      count: Number(row?.upcoming_instalments_count ?? 0),
      totalAmount: Number(row?.upcoming_instalments_total ?? 0),
      nextDueDate: row?.upcoming_instalments_next_due ?? null,
    },
    pendingVerifications: Number(row?.pending_verifications ?? 0),
  };
};

// Only pass a value that Postgres will accept as UUID; invalid values cause 400.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toValidAcademicYearParam = (id?: string | null): string | null => {
  if (id == null || id === "" || id === "all") return null;
  return UUID_REGEX.test(id) ? id : null;
};

const fetchDashboardStats = async (academicYearId?: string): Promise<DashboardStats> => {
  try {
    const pAcademicYearId = toValidAcademicYearParam(academicYearId ?? null);
    // Always pass p_academic_year_id explicitly; passing {} or invalid UUID can cause 400.
    const { data, error } = await supabase.rpc("get_admin_dashboard_stats", {
      p_academic_year_id: pAcademicYearId,
    });

    if (error) {
      if (isUnauthorizedAuthError(error)) {
        throw error;
      }

      const errorDetails = {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        academicYearId: academicYearId ?? "(none)",
        paramSent: pAcademicYearId,
      };
      console.error("Failed to load dashboard stats:", errorDetails);
      console.error("Full error object:", error);

      if (error.code === "42883" || error.message?.includes("does not exist")) {
        console.error(
          "⚠️ The get_admin_dashboard_stats function doesn't exist in the database. " +
            "Run migrations and ensure supabase/migrations (e.g. 20260216_dashboard_occupancy_total_all_studios.sql) are applied."
        );
      }
      if (error.code === "PGRST202" || (error.message && error.message.includes("Could not find the function"))) {
        console.error(
          "⚠️ PostgREST schema cache may be stale. In Supabase SQL Editor run: NOTIFY pgrst, 'reload schema';"
        );
      }
      if (error.code === "22P02" || (error.message && error.message.includes("invalid input syntax for type uuid"))) {
        console.error("⚠️ An invalid UUID was passed. Ensure academic year selector sends a valid UUID or null.");
      }
      // 400 often means PostgREST schema cache or missing migration
      console.error(
        "💡 If you see HTTP 400: apply migrations on your Supabase project and run in SQL Editor: NOTIFY pgrst, 'reload schema';"
      );

      return normalizeRow(null);
    }

    return normalizeRow(data?.[0]);
  } catch (err) {
    console.error("Unexpected error in fetchDashboardStats:", err);
    return normalizeRow(null);
  }
};

const fetchDashboardBreakdowns = async (academicYearId?: string): Promise<DashboardBreakdowns> => {
  const pAcademicYearId = toValidAcademicYearParam(academicYearId ?? null);

  const [{ data: studentsData, error: studentsError }, { data: applicationsData, error: applicationsError }] =
    await Promise.all([
      supabase.from("profiles").select("id").eq("role", "student"),
      supabase
        .from("student_applications")
        .select(
          `
          student_id,
          status,
          contract:contracts!contract_id(
            academic_year_id,
            student_application_id,
            source_contract_id
          )
        `,
        ),
    ]);

  if (studentsError) {
    if (isUnauthorizedAuthError(studentsError)) throw studentsError;
    console.error("Failed to fetch student profiles for dashboard breakdown:", studentsError);
  }
  if (applicationsError) {
    if (isUnauthorizedAuthError(applicationsError)) throw applicationsError;
    console.error("Failed to fetch applications for dashboard breakdown:", applicationsError);
  }

  const allStudents = studentsData ?? [];
  const allApplications = (applicationsData ?? []) as Array<{
    student_id: string | null;
    status: string;
    contract: {
      academic_year_id: string | null;
      student_application_id: string | null;
      source_contract_id: string | null;
    } | null;
  }>;

  const filteredApplications = pAcademicYearId
    ? allApplications.filter((app) => (app.contract as any)?.academic_year_id === pAcademicYearId)
    : allApplications;

  const applicationStatusCounts = filteredApplications.reduce<Record<string, number>>((acc, app) => {
    const key = app.status || "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const studentsWithApplicationSet = new Set(
    filteredApplications
      .map((app) => app.student_id)
      .filter((id): id is string => Boolean(id)),
  );

  const confirmedStudentsSet = new Set(
    filteredApplications
      .filter((app) => app.status === "confirmed")
      .map((app) => app.student_id)
      .filter((id): id is string => Boolean(id)),
  );

  const pipelineStudentsSet = new Set(
    filteredApplications
      .filter((app) => app.status === "awaiting_signature" || app.status === "awaiting_deposit")
      .map((app) => app.student_id)
      .filter((id): id is string => Boolean(id)),
  );

  const totalStudents = allStudents.length;
  const withApplication = studentsWithApplicationSet.size;
  const customContracts = filteredApplications.filter(
    (app) =>
      Boolean((app.contract as any)?.student_application_id) ||
      Boolean((app.contract as any)?.source_contract_id),
  ).length;
  const defaultContracts = Math.max(filteredApplications.length - customContracts, 0);

  return {
    students: {
      total: totalStudents,
      withApplication,
      confirmed: confirmedStudentsSet.size,
      inPipeline: pipelineStudentsSet.size,
      withoutApplication: Math.max(totalStudents - withApplication, 0),
    },
    applications: {
      total: filteredApplications.length,
      byStatus: applicationStatusCounts,
      customContracts,
      defaultContracts,
    },
  };
};

export const useDashboardStats = (academicYearId?: string) => {
  const { session, loading: authLoading } = useAuth();
  const authReady = !!session && !authLoading;

  return useQuery({
    queryKey: ["dashboard-stats", academicYearId],
    queryFn: () => fetchDashboardStats(academicYearId),
    enabled: authReady,
    refetchInterval: 60000, // Refetch every minute
    staleTime: 60000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  });
};

export const useDashboardBreakdowns = (academicYearId?: string) => {
  const { session, loading: authLoading } = useAuth();
  const authReady = !!session && !authLoading;

  return useQuery({
    queryKey: ["dashboard-breakdowns", academicYearId],
    queryFn: () => fetchDashboardBreakdowns(academicYearId),
    enabled: authReady,
    staleTime: 60000,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  });
};

