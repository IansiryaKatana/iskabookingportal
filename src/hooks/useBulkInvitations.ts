import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type InvitationStatus = "pending_activation" | "invited" | "activated" | "active";

export type ApplicationWithInvitation = {
  id: string;
  student_id: string;
  status: string;
  created_at: string;
  contract: {
    id: string;
    name: string;
    academic_year_id: string;
    academic_years?: {
      id: string;
      name: string;
    };
  } | null;
  student_email?: string;
  student_name?: string;
  account_status?: InvitationStatus;
  invitation_sent_at?: string;
  invitation_expires_at?: string;
};

const fetchApplicationsWithPlaceholders = async (
  filters?: {
    contract_id?: string;
    academic_year_id?: string;
    status?: string;
    imported_after?: string;
  }
): Promise<ApplicationWithInvitation[]> => {
  // Build query
  let query = supabase
    .from("student_applications")
    .select(`
      id,
      student_id,
      status,
      created_at,
      contract:contracts (
        id,
        name,
        academic_year_id,
        academic_years:academic_years (
          id,
          name
        )
      ),
      student_application_steps!inner (
        step_number,
        payload
      )
    `)
    .eq("student_application_steps.step_number", 2);

  // Apply filters
  if (filters?.contract_id) {
    query = query.eq("contract_id", filters.contract_id);
  }
  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.academic_year_id) {
    query = query.eq("contract.academic_year_id", filters.academic_year_id);
  }
  if (filters?.imported_after) {
    query = query.gte("created_at", filters.imported_after);
  }

  const { data: applications, error } = await query;

  if (error) throw error;

  if (!applications || applications.length === 0) {
    return [];
  }

  // Get user metadata to check account status
  const studentIds = [...new Set(applications.map((app: any) => app.student_id))];
  
  // Fetch user metadata from auth.users (via admin API would be better, but we'll use profiles as proxy)
  // For now, we'll extract email from step 2 and check if we can determine status
  const enriched = applications.map((app: any) => {
    const step2 = app.student_application_steps?.find((s: any) => s.step_number === 2);
    const email = step2?.payload?.email || "";
    const firstName = step2?.payload?.first_name || "";
    const lastName = step2?.payload?.last_name || "";

    return {
      id: app.id,
      student_id: app.student_id,
      status: app.status,
      created_at: app.created_at,
      contract: app.contract,
      student_email: email,
      student_name: `${firstName} ${lastName}`.trim() || email,
      // We'll fetch account_status from a separate query or Edge Function
      account_status: "pending_activation" as InvitationStatus, // Default, will be updated
    };
  });

  return enriched;
};

export const useApplicationsWithPlaceholders = (filters?: {
  contract_id?: string;
  academic_year_id?: string;
  status?: string;
  imported_after?: string;
}) => {
  return useQuery({
    queryKey: ["applications-with-placeholders", filters],
    queryFn: () => fetchApplicationsWithPlaceholders(filters),
  });
};

export const useSendBulkInvitations = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      application_ids?: string[];
      filters?: {
        contract_id?: string;
        academic_year_id?: string;
        status?: string;
        imported_after?: string;
      };
      email_template_id?: string;
      resend?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke("bulk-invite-students", {
        body: payload,
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications-with-placeholders"] });
    },
  });
};

