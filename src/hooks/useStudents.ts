import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ApplicationRow = Database["public"]["Tables"]["student_applications"]["Row"];

export type Student = {
  id: string;
  student_id: string;
  application_id: string;
  status: ApplicationRow["status"];
  contract: {
    id: string;
    name: string;
    weeks: number;
    contract_start: string;
    contract_end: string;
    studio_grade: {
      id: string;
      name: string;
    } | null;
  } | null;
  assigned_studio: Database["public"]["Tables"]["studios"]["Row"] | null;
  profile: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  total_contract_value: number | null;
  created_at: string;
};

const fetchStudents = async (filters?: {
  search?: string;
  academicYearId?: string;
  studioGradeId?: string;
  status?: string;
  paymentStatus?: string;
}): Promise<Student[]> => {
  let query = supabase
    .from("student_applications")
    .select(
      `
      id,
      student_id,
      status,
      total_contract_value,
      created_at,
      contract:contracts!contract_id(
        id,
        name,
        weeks,
        contract_start,
        contract_end,
        studio_grade:studio_grades(id, name)
      ),
      assigned_studio:studios(*)
    `,
    )
    .eq("status", "confirmed")
    .order("created_at", { ascending: false });

  // Apply filters
  if (filters?.academicYearId) {
    query = query.eq("contract.academic_year_id", filters.academicYearId);
  }

  if (filters?.studioGradeId) {
    query = query.eq("studio_grade_id", filters.studioGradeId);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch students:", error);
    throw error;
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Fetch student profiles separately
  const studentIds = [...new Set(data.map((app) => app.student_id).filter((id): id is string => Boolean(id)))];
  const applicationIds = data.map((app) => app.id);
  
  // Fetch profiles from profiles table
  let profiles: any[] = [];
  if (studentIds.length > 0) {
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, phone")
      .in("id", studentIds);
    
    if (profilesError) {
      console.error("Failed to fetch student profiles:", profilesError);
    } else {
      profiles = profilesData || [];
    }
  }

  // Fetch names from application Step 1 (Personal Information) as fallback
  const { data: step1Data, error: step1Error } = await supabase
    .from("student_application_steps")
    .select("application_id, payload")
    .eq("step_number", 1)
    .in("application_id", applicationIds);

  if (step1Error) {
    console.warn("Failed to fetch application step 1 data:", step1Error);
  }

  // Create a map of application_id -> step1 payload
  const step1Map = new Map(
    (step1Data ?? []).map((step) => [
      step.application_id,
      step.payload as { first_name?: string; last_name?: string; phone?: string },
    ]),
  );

  // Fetch emails from auth.users using Edge Function (non-blocking)
  const emailsMap = new Map<string, string>();
  try {
    const { data: emailData, error: emailsError } = await supabase.functions.invoke("get-user-emails", {
      body: { userIds: studentIds },
    });

    if (!emailsError && emailData?.emails) {
      Object.entries(emailData.emails).forEach(([userId, email]) => {
        emailsMap.set(userId, email as string);
      });
    } else if (emailsError) {
      console.warn("Could not fetch user emails (Edge Function may not be deployed):", emailsError);
    }
  } catch (error) {
    // Edge Function might not be deployed yet, that's okay
    console.warn("Could not fetch user emails:", error);
  }

  // Build profiles map from profiles table
  const profilesMap = new Map(
    (profiles ?? []).map((p) => [
      p.id,
      {
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        phone: p.phone,
        email: emailsMap.get(p.id) || null,
      },
    ]),
  );

  // Enrich applications with profile data, using Step 1 as fallback
  const enriched = data.map((app) => {
    // Try to get profile from profiles table first
    let profile = profilesMap.get(app.student_id);
    
    // If no profile found, use Step 1 data as fallback
    if (!profile) {
      const step1Payload = step1Map.get(app.id);
      if (step1Payload) {
        profile = {
          id: app.student_id,
          first_name: step1Payload.first_name || null,
          last_name: step1Payload.last_name || null,
          phone: step1Payload.phone || null,
          email: emailsMap.get(app.student_id) || null,
        };
      }
    }

    return {
      ...app,
      application_id: app.id,
      profile: profile || null,
    };
  }) as Student[];

  // Apply search filter if provided
  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    return enriched.filter((student) => {
      const name = `${student.profile?.first_name || ""} ${student.profile?.last_name || ""}`.toLowerCase();
      const email = student.profile?.email?.toLowerCase() || "";
      const phone = student.profile?.phone?.toLowerCase() || "";
      return name.includes(searchLower) || email.includes(searchLower) || phone.includes(searchLower);
    });
  }

  return enriched;
};

export const useStudents = (filters?: {
  search?: string;
  academicYearId?: string;
  studioGradeId?: string;
  status?: string;
  paymentStatus?: string;
}) => {
  return useQuery({
    queryKey: ["students", filters],
    queryFn: () => fetchStudents(filters),
  });
};

