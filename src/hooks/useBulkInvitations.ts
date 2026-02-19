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
      contract_id,
      contract:contracts!contract_id (
        id,
        name,
        academic_year_id,
        academic_year:academic_years (
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

  // Get unique contract IDs that need to be fetched (for applications missing contract data)
  const contractIds = [...new Set(applications.map((app: any) => app.contract_id).filter(Boolean))];
  
  // Fetch contracts separately if some are missing (fallback)
  let contractsMap: Map<string, any> = new Map();
  if (contractIds.length > 0) {
    try {
      const { data: contractsData, error: contractsError } = await supabase
        .from("contracts")
        .select(`
          id,
          name,
          academic_year_id,
          academic_year:academic_years (
            id,
            name
          )
        `)
        .in("id", contractIds);

      if (!contractsError && contractsData) {
        contractsData.forEach((contract: any) => {
          contractsMap.set(contract.id, contract);
        });
      }
    } catch (err) {
      console.warn("Could not fetch contracts separately:", err);
    }
  }

  // Get user metadata to check account status
  const studentIds = [...new Set(applications.map((app: any) => app.student_id))];
  
  // Fetch user metadata from auth.users via Edge Function
  let metadataMap: Record<string, { account_status?: string; invitation_sent_at?: string; invitation_expires_at?: string }> = {};
  if (studentIds.length > 0) {
    try {
      const { data: metadataData, error: metadataError } = await supabase.functions.invoke("get-user-metadata", {
        body: { userIds: studentIds },
      });

      if (!metadataError && metadataData?.metadata) {
        metadataMap = metadataData.metadata;
      } else if (metadataError) {
        console.warn("Could not fetch user metadata via edge function:", metadataError);
      }
    } catch (err) {
      console.warn("Could not fetch user metadata:", err);
    }
  }

  // Enrich applications with metadata and ensure contracts are populated
  const enriched = applications.map((app: any) => {
    const step2 = app.student_application_steps?.find((s: any) => s.step_number === 2);
    const email = step2?.payload?.email || "";
    const firstName = step2?.payload?.first_name || "";
    const lastName = step2?.payload?.last_name || "";
    const metadata = metadataMap[app.student_id] || {};

    // Use contract from query if available, otherwise fetch from map
    let contract = app.contract;
    if (!contract && app.contract_id) {
      contract = contractsMap.get(app.contract_id) || null;
    }

    return {
      id: app.id,
      student_id: app.student_id,
      status: app.status,
      created_at: app.created_at,
      contract: contract,
      student_email: email,
      student_name: `${firstName} ${lastName}`.trim() || email,
      // Determine account status:
      // 1. If metadata has account_status, use it (this is the source of truth)
      // 2. If no metadata, default to "pending_activation" (bulk imported users start as pending)
      // Note: Bulk imported users are created with account_status: "pending_activation" in metadata
      // Only users who actually activated will have account_status: "activated"
      account_status: (metadata.account_status && metadata.account_status !== "" 
        ? (metadata.account_status as InvitationStatus)
        : "pending_activation") as InvitationStatus,
      invitation_sent_at: metadata.invitation_sent_at || undefined,
      invitation_expires_at: metadata.invitation_expires_at || undefined,
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

