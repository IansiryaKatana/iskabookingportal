import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type StaffMember = Profile & {
  email?: string;
};

export const useStaffMembers = (filters?: {
  role?: string;
  staff_subrole?: string;
}) => {
  return useQuery({
    queryKey: ["staff-members", filters],
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("id, role, first_name, last_name, staff_subrole, phone");

      if (filters?.role) {
        query = query.eq("role", filters.role);
      }
      if (filters?.staff_subrole) {
        query = query.eq("staff_subrole", filters.staff_subrole);
      }

      const { data: profiles, error } = await query;

      if (error) throw error;

      // Fetch emails from auth.users
      const profileIds = (profiles || []).map((p) => p.id);
      let emails: Record<string, string> = {};

      if (profileIds.length > 0) {
        // Note: This requires a database function or RPC call to get emails
        // For now, we'll just return profiles without emails
        // You can add email via a database function if needed
      }

      return (profiles || []).map((profile) => ({
        ...profile,
        email: emails[profile.id],
      })) as StaffMember[];
    },
  });
};

// Get maintenance officers specifically
export const useMaintenanceOfficers = () => {
  return useStaffMembers({
    role: "staff",
    staff_subrole: "maintenance_officer",
  });
};

