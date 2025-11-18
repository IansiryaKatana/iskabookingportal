import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Refund = Database["public"]["Tables"]["refunds"]["Row"];

export const useRefunds = (filters?: {
  studentId?: string;
  applicationId?: string;
  status?: string;
}) => {
  return useQuery({
    queryKey: ["refunds", filters],
    queryFn: async () => {
      // First, try a simple query without joins
      let query = supabase
        .from("refunds")
        .select("*")
        .order("processed_at", { ascending: false });

      if (filters?.studentId) {
        query = query.eq("student_id", filters.studentId);
      }

      if (filters?.applicationId) {
        query = query.eq("application_id", filters.applicationId);
      }

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }

      const { data, error } = await query;

      if (error) {
        // If table doesn't exist, return empty array
        if (error.code === "42P01" || error.message?.includes("does not exist") || error.code === "PGRST116") {
          console.warn("Refunds table does not exist yet. Please run the migration.");
          return [];
        }
        throw error;
      }

      // Fetch related data separately if needed
      if (data && data.length > 0) {
        // Get unique student IDs
        const studentIds = [...new Set(data.map((r) => r.student_id).filter(Boolean))];
        
        // Get unique staff IDs
        const staffIds = [...new Set(data.map((r) => r.refunded_by).filter(Boolean))];

        // Fetch profiles for students and staff
        const allUserIds = [...new Set([...studentIds, ...staffIds].filter(Boolean))];
        
        let profiles: Record<string, any> = {};
        if (allUserIds.length > 0) {
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, role")
            .in("id", allUserIds);
          
          if (profilesData) {
            profilesData.forEach((p) => {
              profiles[p.id] = p;
            });
          }
        }

        // Enrich refund data with profile info
        return data.map((refund) => ({
          ...refund,
          student: profiles[refund.student_id] || null,
          refunded_by_profile: profiles[refund.refunded_by || ""] || null,
        }));
      }

      return (data as Refund[]) ?? [];
    },
  });
};
