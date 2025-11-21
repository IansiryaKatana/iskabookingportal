import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type StudioGrade = Database["public"]["Tables"]["studio_grades"]["Row"];
type StudioGradePrice =
  Database["public"]["Tables"]["studio_grade_prices"]["Row"];
type AcademicYear = Database["public"]["Tables"]["academic_years"]["Row"];

export type GradeWithPricing = StudioGrade & {
  price?: StudioGradePrice | null;
};

const fetchActiveAcademicYear = async (academicYearId?: string): Promise<AcademicYear | null> => {
  if (academicYearId) {
    const { data, error } = await supabase
      .from("academic_years")
      .select("*")
      .eq("id", academicYearId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    return data ?? null;
  }

  // If no ID provided, get most recent future year
  const { data, error } = await supabase
    .from("academic_years")
    .select("*")
    .eq("is_active", true)
    .order("start_date", { ascending: false });

  if (error) throw error;
  
  if (!data || data.length === 0) return null;

  // Find most recent future year, or most recent if none are future
  const now = new Date();
  const futureYear = data.find((y) => new Date(y.start_date) > now);
  return futureYear || data[0] || null;
};

const fetchStudioGrades = async (academicYearId?: string): Promise<{
  grades: GradeWithPricing[];
  academicYear: AcademicYear | null;
}> => {
  const academicYear = await fetchActiveAcademicYear(academicYearId);
  const yearId = academicYear?.id;

  const { data: grades, error: gradesError } = await supabase
    .from("studio_grades")
    .select("*")
    .order("display_order", { ascending: true });

  if (gradesError) throw gradesError;

  if (!yearId) {
    return {
      grades: grades ?? [],
      academicYear: null,
    };
  }

  const { data: prices, error: pricesError } = await supabase
    .from("studio_grade_prices")
    .select("*")
    .eq("academic_year_id", yearId);

  if (pricesError) throw pricesError;

  const priceMap = (prices ?? []).reduce<Record<string, StudioGradePrice>>(
    (acc, price) => {
      acc[price.studio_grade_id] = price;
      return acc;
    },
    {},
  );

  const merged: GradeWithPricing[] =
    grades?.map((grade) => ({
      ...grade,
      price: priceMap[grade.id] ?? null,
    })) ?? [];

  return {
    grades: merged,
    academicYear,
  };
};

export const useAdminStudioGrades = (academicYearId?: string) =>
  useQuery({
    queryKey: ["admin-studio-grades", academicYearId],
    queryFn: () => fetchStudioGrades(academicYearId),
  });

export const useUpdateStudioGrade = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<StudioGrade> & { id: string }) => {
      const { id, ...rest } = payload;
      const { data, error } = await supabase
        .from("studio_grades")
        .update(rest)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-studio-grades"] });
    },
  });
};

export const useUpdateStudioGradePrice = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id?: string;
      academic_year_id: string;
      studio_grade_id: string;
      weekly_price: number;
      deposit_amount_override: number | null;
    }) => {
      const { id, ...rest } = payload;
      if (id) {
        const { data, error } = await supabase
          .from("studio_grade_prices")
          .update(rest)
          .eq("id", id)
          .select("*")
          .single();
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase
        .from("studio_grade_prices")
        .insert(rest)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-studio-grades"] });
    },
  });
};

