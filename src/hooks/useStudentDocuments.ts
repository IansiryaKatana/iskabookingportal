import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type DocumentRow = Database["public"]["Tables"]["student_documents"]["Row"];

type StudentDocument = DocumentRow & {
  verified_by_profile: {
    first_name: string | null;
    last_name: string | null;
  } | null;
};

const fetchDocuments = async (
  applicationId: string,
): Promise<StudentDocument[]> => {
  if (import.meta.env.DEV) console.log(`Fetching documents for application ${applicationId}`);
  const { data: documents, error } = await supabase
    .from("student_documents")
    .select("*")
    .eq("application_id", applicationId)
    .order("uploaded_at", { ascending: false });

  if (error) {
    console.error(`Error fetching documents for ${applicationId}:`, error);
    throw error;
  }
  
  if (import.meta.env.DEV) console.log(`Found ${documents?.length || 0} documents for application ${applicationId}`, documents);
  if (!documents || documents.length === 0) return [];

  // Fetch profiles for verified_by users
  const verifiedByUserIds = documents
    .map((doc) => doc.verified_by)
    .filter((id): id is string => Boolean(id));

  let profilesMap: Record<string, { first_name: string | null; last_name: string | null }> = {};

  if (verifiedByUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", verifiedByUserIds);

    if (profiles) {
      profilesMap = profiles.reduce(
        (acc, profile) => {
          acc[profile.id] = {
            first_name: profile.first_name,
            last_name: profile.last_name,
          };
          return acc;
        },
        {} as Record<string, { first_name: string | null; last_name: string | null }>,
      );
    }
  }

  // Map documents with profile data
  return documents.map((doc) => ({
    ...doc,
    verified_by_profile: doc.verified_by ? profilesMap[doc.verified_by] ?? null : null,
  })) as StudentDocument[];
};

export const useStudentDocuments = (applicationId?: string) =>
  useQuery({
    queryKey: ["student-documents", applicationId],
    queryFn: () =>
      applicationId ? fetchDocuments(applicationId) : Promise.resolve([]),
    enabled: Boolean(applicationId),
  });

