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

const fetchDashboardStats = async (academicYearId?: string): Promise<DashboardStats> => {
  try {
    // Only pass p_academic_year_id when set. Omitting it lets the DB use DEFAULT NULL; passing null can cause 400.
    const { data, error } = await supabase.rpc(
      "get_admin_dashboard_stats",
      academicYearId ? { p_academic_year_id: academicYearId } : {}
    );

    if (error) {
      // Log detailed error information for debugging
      const errorDetails = {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        academicYearId: academicYearId ?? "(none)",
      };
      
      console.error("Failed to load dashboard stats:", errorDetails);
      console.error("Full error object:", error);
      
      // If function doesn't exist (code 42883), log a helpful message
      if (error.code === '42883' || error.message?.includes('does not exist')) {
        console.error(
          "⚠️ The get_admin_dashboard_stats function doesn't exist in the database. " +
          "Please run the migration: supabase/migrations/20250214_fix_admin_dashboard_stats_function.sql"
        );
      }
      
      // Return empty stats instead of throwing to prevent UI crashes
      // This allows the app to continue functioning even if stats fail
      return normalizeRow(null);
    }

    return normalizeRow(data?.[0]);
  } catch (err) {
    // Catch any unexpected errors
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

