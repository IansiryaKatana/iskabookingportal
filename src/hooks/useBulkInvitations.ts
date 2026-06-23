import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** PostgREST `.in()` with hundreds of UUIDs exceeds URL limits and returns 400. */
const IN_QUERY_CHUNK_SIZE = 80;

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

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
      )
    `);

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
      for (const contractIdChunk of chunkArray(contractIds, IN_QUERY_CHUNK_SIZE)) {
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
          .in("id", contractIdChunk);

        if (contractsError) {
          console.warn("Could not fetch contracts separately:", contractsError);
          break;
        }

        (contractsData || []).forEach((contract: any) => {
          contractsMap.set(contract.id, contract);
        });
      }
    } catch (err) {
      console.warn("Could not fetch contracts separately:", err);
    }
  }

  const applicationIds = applications.map((app: any) => app.id).filter(Boolean);
  const studentIds = [...new Set(applications.map((app: any) => app.student_id).filter(Boolean))];

  // Fetch step 2 payload separately so applications are not dropped when step 2 is missing
  const step2ByApplicationId = new Map<string, any>();
  if (applicationIds.length > 0) {
    try {
      for (const applicationIdChunk of chunkArray(applicationIds, IN_QUERY_CHUNK_SIZE)) {
        const { data: step2Rows, error: step2Error } = await supabase
          .from("student_application_steps")
          .select("application_id, step_number, payload")
          .in("application_id", applicationIdChunk)
          .eq("step_number", 2);

        if (step2Error) {
          console.warn("Could not fetch step 2 payloads:", step2Error);
          break;
        }

        (step2Rows || []).forEach((row: any) => {
          step2ByApplicationId.set(row.application_id, row.payload || {});
        });
      }
    } catch (err) {
      console.warn("Could not fetch step 2 payloads:", err);
    }
  }

  // Fetch profile names as fallback for search and display
  const profileMap = new Map<string, { first_name?: string | null; last_name?: string | null }>();
  if (studentIds.length > 0) {
    try {
      for (const studentIdChunk of chunkArray(studentIds, IN_QUERY_CHUNK_SIZE)) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", studentIdChunk);

        if (profilesError) {
          console.warn("Could not fetch profile names:", profilesError);
          break;
        }

        (profilesData || []).forEach((p: any) => {
          profileMap.set(p.id, { first_name: p.first_name, last_name: p.last_name });
        });
      }
    } catch (err) {
      console.warn("Could not fetch profile names:", err);
    }
  }

  // Fetch auth emails as fallback when step 2 payload does not contain email
  const emailsMap = new Map<string, string>();
  if (studentIds.length > 0) {
    try {
      for (const studentIdChunk of chunkArray(studentIds, IN_QUERY_CHUNK_SIZE)) {
        const { data: emailsData, error: emailsError } = await supabase.functions.invoke("get-user-emails", {
          body: { userIds: studentIdChunk },
        });

        if (emailsError) {
          console.warn("Could not fetch auth emails:", emailsError);
          break;
        }

        if (emailsData?.emails) {
          Object.entries(emailsData.emails).forEach(([userId, email]) => {
            emailsMap.set(userId, String(email || ""));
          });
        }
      }
    } catch (err) {
      console.warn("Could not fetch auth emails:", err);
    }
  }
  
  // Fetch user metadata from auth.users via Edge Function
  let metadataMap: Record<string, { account_status?: string; invitation_sent_at?: string; invitation_expires_at?: string }> = {};
  if (studentIds.length > 0) {
    try {
      for (const studentIdChunk of chunkArray(studentIds, IN_QUERY_CHUNK_SIZE)) {
        const { data: metadataData, error: metadataError } = await supabase.functions.invoke("get-user-metadata", {
          body: { userIds: studentIdChunk },
        });

        if (metadataError) {
          console.warn("Could not fetch user metadata via edge function:", metadataError);
          break;
        }

        if (metadataData?.metadata) {
          metadataMap = { ...metadataMap, ...metadataData.metadata };
        }
      }
    } catch (err) {
      console.warn("Could not fetch user metadata:", err);
    }
  }

  // Enrich applications with metadata and ensure contracts are populated
  const enriched = applications.map((app: any) => {
    const step2Payload = step2ByApplicationId.get(app.id) || {};
    const profile = profileMap.get(app.student_id) || {};
    const email = (step2Payload?.email || emailsMap.get(app.student_id) || "").toString();
    const firstName = (step2Payload?.first_name || profile.first_name || "").toString();
    const lastName = (step2Payload?.last_name || profile.last_name || "").toString();
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
      student_name: `${firstName} ${lastName}`.trim() || email || "Student",
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

