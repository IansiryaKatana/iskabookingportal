import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

export const useDashboardStats = (academicYearId?: string) => {
  return useQuery({
    queryKey: ["dashboard-stats", academicYearId],
    queryFn: () => fetchDashboardStats(academicYearId),
    refetchInterval: 60000, // Refetch every minute
    staleTime: 60000,
  });
};

