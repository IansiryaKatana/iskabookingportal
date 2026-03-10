import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ApplicationRow =
  Database["public"]["Tables"]["student_applications"]["Row"];

type ContractRow = Database["public"]["Tables"]["contracts"]["Row"];

export type StudioApplicationSummary = ApplicationRow & {
  contract: Pick<
    ContractRow,
    "id" | "name" | "contract_start" | "contract_end" | "academic_year_id"
  > | null;
  student: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
};

type FetchOptions = {
  studioId?: string;
  academicYearId?: string | null;
  status?: string | null;
};

const fetchStudioApplications = async (
  options: FetchOptions,
): Promise<StudioApplicationSummary[]> => {
  const { studioId, academicYearId, status } = options;
  if (!studioId) return [];

  let query = supabase
    .from("student_applications")
    .select(
      `
        *,
        contract:contracts!contract_id (
          id,
          name,
          contract_start,
          contract_end,
          academic_year_id
        )
      `,
    )
    .eq("assigned_studio_id", studioId)
    .order("created_at", { ascending: false });

  if (academicYearId) {
    query = query.eq("contract.academic_year_id", academicYearId);
  }

  if (status) {
    if (status === "checked_out") {
      query = query.eq("status", "confirmed");
    } else {
      query = query.eq("status", status);
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data as (ApplicationRow & { contract: StudioApplicationSummary["contract"] })[]) ?? [];
  if (status === "checked_out") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    rows = rows.filter((r) => {
      const end = r.contract?.contract_end;
      if (!end) return false;
      const endDate = new Date(end);
      endDate.setHours(0, 0, 0, 0);
      return endDate < today;
    });
  }
  if (rows.length === 0) return [];

  const studentIds = [...new Set(rows.map((r) => r.student_id).filter(Boolean))] as string[];

  let profiles: { id: string; first_name: string | null; last_name: string | null }[] = [];
  if (studentIds.length > 0) {
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", studentIds);
    if (!profilesError) profiles = profilesData ?? [];
  }

  const emailsMap = new Map<string, string>();
  if (studentIds.length > 0) {
    try {
      const { data: emailData, error: emailsError } = await supabase.functions.invoke("get-user-emails", {
        body: { userIds: studentIds },
      });
      if (!emailsError && emailData?.emails && typeof emailData.emails === "object") {
        Object.entries(emailData.emails).forEach(([userId, email]) => {
          emailsMap.set(userId, String(email ?? ""));
        });
      }
    } catch {
      // ignore
    }
  }

  return rows.map((row) => {
    const profile = profiles.find((p) => p.id === row.student_id);
    return {
      ...row,
      student: row.student_id
        ? {
            id: row.student_id,
            first_name: profile?.first_name ?? null,
            last_name: profile?.last_name ?? null,
            email: emailsMap.get(row.student_id) ?? null,
          }
        : null,
    } as StudioApplicationSummary;
  });
};

export const useStudioApplications = (options: FetchOptions) =>
  useQuery({
    queryKey: [
      "studio-applications",
      options.studioId,
      options.academicYearId ?? null,
      options.status ?? null,
    ],
    queryFn: () => fetchStudioApplications(options),
    enabled: !!options.studioId,
  });

