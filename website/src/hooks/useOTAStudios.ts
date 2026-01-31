import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OTAStudioGradeSummary = {
  studio_grade_id: string;
  studio_grade_name: string;
  studio_grade_slug: string;
  count: number;
};

/**
 * Fetches studios assigned to OTA (short-term) grouped by studio grade.
 * Used on About page Short-term section.
 */
export function useOTAStudios() {
  return useQuery({
    queryKey: ["website-ota-studios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studios")
        .select("studio_grade_id, studio_grades(id, name, slug)")
        .eq("allocation", "OTA")
        .eq("is_active", true);

      if (error) throw error;

      const byGrade = new Map<string, OTAStudioGradeSummary>();
      for (const row of data || []) {
        const grade = row.studio_grades as { id: string; name: string; slug: string } | null;
        if (!grade) continue;
        const id = grade.id;
        if (!byGrade.has(id)) {
          byGrade.set(id, {
            studio_grade_id: id,
            studio_grade_name: grade.name,
            studio_grade_slug: grade.slug,
            count: 0,
          });
        }
        byGrade.get(id)!.count += 1;
      }
      return Array.from(byGrade.values()).sort((a, b) =>
        a.studio_grade_name.localeCompare(b.studio_grade_name)
      );
    },
    staleTime: 60 * 1000,
  });
}
