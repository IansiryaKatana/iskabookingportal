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

const fetchDashboardStats = async (): Promise<DashboardStats> => {
  // Fetch total students
  const { count: studentCount, error: studentError } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "student");

  if (studentError) {
    console.error("Error fetching student count:", studentError);
  }

  // Fetch total applications
  const { count: applicationCount, error: applicationError } = await supabase
    .from("student_applications")
    .select("*", { count: "exact", head: true });

  if (applicationError) {
    console.error("Error fetching application count:", applicationError);
  }

  // Fetch confirmed applications
  const { count: confirmedCount, error: confirmedError } = await supabase
    .from("student_applications")
    .select("*", { count: "exact", head: true })
    .eq("status", "confirmed");

  if (confirmedError) {
    console.error("Error fetching confirmed applications:", confirmedError);
  }

  // Fetch recent applications (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { count: recentCount, error: recentError } = await supabase
    .from("student_applications")
    .select("*", { count: "exact", head: true })
    .gte("created_at", sevenDaysAgo.toISOString());

  if (recentError) {
    console.error("Error fetching recent applications:", recentError);
  }

  // Fetch total revenue from unified payment history
  const { data: payments, error: paymentsError } = await supabase
    .from("unified_payment_history")
    .select("amount_paid, payment_status");

  let totalRevenue = 0;
  if (!paymentsError && payments) {
    totalRevenue = payments
      .filter((p) => p.payment_status === "completed" || p.payment_status === "succeeded")
      .reduce((sum, p) => sum + (p.amount_paid || 0), 0);
  } else if (paymentsError) {
    console.error("Error fetching payments:", paymentsError);
  }

  // Fetch occupancy stats
  const { data: studios, error: studiosError } = await supabase
    .from("studios")
    .select("status, is_active")
    .eq("is_active", true);

  let occupancy = { total: 0, occupied: 0, percentage: 0 };
  if (!studiosError && studios) {
    const total = studios.length;
    const occupied = studios.filter((s) => s.status === "occupied").length;
    occupancy = {
      total,
      occupied,
      percentage: total > 0 ? Math.round((occupied / total) * 100) : 0,
    };
  } else if (studiosError) {
    console.error("Error fetching studios:", studiosError);
  }

  // Fetch upcoming instalments (next 30 days)
  const today = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  const { data: upcomingInstalments, error: instalmentsError } = await supabase
    .from("contract_payment_schedule")
    .select("due_date, amount")
    .gte("due_date", today.toISOString().split("T")[0])
    .lte("due_date", thirtyDaysFromNow.toISOString().split("T")[0])
    .order("due_date", { ascending: true });

  let upcomingInstalmentsData = {
    count: 0,
    totalAmount: 0,
    nextDueDate: null as string | null,
  };

  if (!instalmentsError && upcomingInstalments) {
    upcomingInstalmentsData = {
      count: upcomingInstalments.length,
      totalAmount: upcomingInstalments.reduce((sum, i) => sum + (i.amount || 0), 0),
      nextDueDate: upcomingInstalments.length > 0 ? upcomingInstalments[0].due_date : null,
    };
  } else if (instalmentsError) {
    console.error("Error fetching upcoming instalments:", instalmentsError);
  }

  // Fetch pending verifications
  const { count: pendingCount, error: pendingError } = await supabase
    .from("student_documents")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  if (pendingError) {
    console.error("Error fetching pending verifications:", pendingError);
  }

  return {
    totalStudents: studentCount || 0,
    totalApplications: applicationCount || 0,
    totalRevenue,
    occupancy,
    upcomingInstalments: upcomingInstalmentsData,
    pendingVerifications: pendingCount || 0,
    recentApplications: recentCount || 0,
    confirmedApplications: confirmedCount || 0,
  };
};

export const useDashboardStats = () => {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: fetchDashboardStats,
    refetchInterval: 60000, // Refetch every minute
  });
};

