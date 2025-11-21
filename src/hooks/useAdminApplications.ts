import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ApplicationRow = Database["public"]["Tables"]["student_applications"]["Row"];

export type AdminApplication = ApplicationRow & {
  student: {
    id: string;
    email?: string;
    first_name?: string;
    last_name?: string;
  } | null;
  contract: {
    id: string;
    name: string;
    weeks: number;
    studio_grade: {
      id: string;
      name: string;
    } | null;
  } | null;
  assigned_studio: Database["public"]["Tables"]["studios"]["Row"] | null;
};

const fetchApplications = async (academicYearId?: string): Promise<AdminApplication[]> => {
  // First, get contract IDs for the academic year if filtering
  let contractIds: string[] | undefined;
  if (academicYearId) {
    const { data: contracts, error: contractsError } = await supabase
      .from("contracts")
      .select("id")
      .eq("academic_year_id", academicYearId);

    if (contractsError) {
      console.error("Failed to fetch contracts for academic year:", contractsError);
      throw contractsError;
    }

    contractIds = contracts?.map((c) => c.id) || [];
    if (contractIds.length === 0) {
      // No contracts for this academic year, return empty
      return [];
    }
  }

  // Build query
  let query = supabase
    .from("student_applications")
    .select(
      `
        *,
        contract:contracts (
          id,
          name,
          weeks,
          academic_year_id,
          studio_grade:studio_grades ( id, name )
        ),
        assigned_studio:studios (*)
      `,
    );

  // Filter by contract IDs if academic year is specified
  if (contractIds && contractIds.length > 0) {
    query = query.in("contract_id", contractIds);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch applications:", error);
    throw error;
  }

  if (!data || data.length === 0) {
    console.info("No applications found");
    return [];
  }

  // Fetch student profiles separately since there's no direct FK relationship
  const studentIds = [...new Set(data.map((app) => app.student_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", studentIds);

  if (profilesError) {
    console.warn("Failed to fetch student profiles:", profilesError);
  }

  const profilesMap = new Map(
    (profiles ?? []).map((p) => [p.id, { id: p.id, first_name: p.first_name, last_name: p.last_name }]),
  );

  console.info("Fetched applications:", data.length, "applications");

  const enriched = data.map((row) => ({
    ...row,
    student: profilesMap.get(row.student_id) ?? {
      id: row.student_id,
      first_name: undefined,
      last_name: undefined,
    },
  }));

  return enriched as AdminApplication[];
};

export const useAdminApplications = (academicYearId?: string) =>
  useQuery({
    queryKey: ["admin-applications", academicYearId],
    queryFn: () => fetchApplications(academicYearId),
  });

export const useUpdateApplicationStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      status: ApplicationRow["status"];
      verified_by?: string | null;
    }) => {
      const { id, status, ...rest } = payload;
      
      // Get current application to check if status is changing to confirmed
      const { data: currentApp } = await supabase
        .from("student_applications")
        .select("status, student_id, contract:contracts(contract_start), assigned_studio:studios(studio_number)")
        .eq("id", id)
        .single();

      const { data, error } = await supabase
        .from("student_applications")
        .update({
          status,
          ...rest,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;

      // Send confirmation email if status changed to confirmed
      if (status === "confirmed" && currentApp?.status !== "confirmed") {
        try {
          // Get student name from Step 1
          const { data: step1 } = await supabase
            .from("student_application_steps")
            .select("payload")
            .eq("application_id", id)
            .eq("step_number", 1)
            .single();

          const step1Data = step1?.payload as any;
          const studentName = step1Data?.first_name && step1Data?.last_name
            ? `${step1Data.first_name} ${step1Data.last_name}`
            : "Student";

          await supabase.functions.invoke("send-transactional-email", {
            body: {
              user_id: currentApp.student_id,
              email_type: "application_confirmed",
              variables: {
                student_name: studentName,
                studio_number: (currentApp.assigned_studio as any)?.studio_number || "TBA",
                contract_start: currentApp.contract?.contract_start || "TBA",
              },
            },
          });
        } catch (emailError) {
          console.error("Error sending confirmation email:", emailError);
          // Don't fail the status update if email fails
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
    },
  });
};

