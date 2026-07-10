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
    academic_year?: {
      id: string;
      name: string;
    };
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
  must_change_password?: boolean;
  last_sign_in_at?: string | null;
};

type RpcRow = {
  id: string;
  student_id: string;
  status: string;
  created_at: string;
  contract_id: string | null;
  contract_name: string | null;
  academic_year_id: string | null;
  academic_year_name: string | null;
  student_email: string | null;
  student_name: string | null;
  account_status: string | null;
  invitation_sent_at: string | null;
  invitation_expires_at: string | null;
  must_change_password: boolean | null;
  last_sign_in_at: string | null;
};

const mapRpcRow = (row: RpcRow): ApplicationWithInvitation => {
  const accountStatus = (row.account_status || "pending_activation") as InvitationStatus;
  return {
    id: row.id,
    student_id: row.student_id,
    status: row.status,
    created_at: row.created_at,
    contract: row.contract_id
      ? {
          id: row.contract_id,
          name: row.contract_name || "N/A",
          academic_year_id: row.academic_year_id || "",
          academic_year: row.academic_year_id
            ? {
                id: row.academic_year_id,
                name: row.academic_year_name || "—",
              }
            : undefined,
        }
      : null,
    student_email: row.student_email || "",
    student_name: row.student_name || row.student_email || "Student",
    account_status: accountStatus,
    invitation_sent_at: row.invitation_sent_at || undefined,
    invitation_expires_at: row.invitation_expires_at || undefined,
    must_change_password: Boolean(row.must_change_password),
    last_sign_in_at: row.last_sign_in_at,
  };
};

const fetchApplicationsWithPlaceholders = async (filters?: {
  contract_id?: string;
  academic_year_id?: string;
}): Promise<ApplicationWithInvitation[]> => {
  const { data, error } = await (supabase as any).rpc("list_bulk_invitation_applications", {
    p_contract_id: filters?.contract_id || null,
    p_academic_year_id: filters?.academic_year_id || null,
  });

  if (error) throw error;

  return ((data || []) as RpcRow[]).map(mapRpcRow);
};

export const useApplicationsWithPlaceholders = (filters?: {
  contract_id?: string;
  academic_year_id?: string;
}) => {
  return useQuery({
    queryKey: ["applications-with-placeholders", filters],
    queryFn: () => fetchApplicationsWithPlaceholders(filters),
    staleTime: 30_000,
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
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications-with-placeholders"] });
    },
  });
};

export type TempPasswordResult = {
  application_id: string;
  student_id: string;
  email: string;
  name: string;
  password?: string;
  error?: string;
};

export const useSetTempPasswords = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      application_ids: string[];
      password?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("set-temp-passwords", {
        body: payload,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as {
        success: boolean;
        succeeded: number;
        failed: number;
        shared_password: boolean;
        results: TempPasswordResult[];
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications-with-placeholders"] });
    },
  });
};
