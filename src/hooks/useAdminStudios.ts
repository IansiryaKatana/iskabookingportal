import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type StudioRow = Database["public"]["Tables"]["studios"]["Row"];

export type AdminStudio = StudioRow & {
  studio_grade: {
    id: string;
    name: string;
    slug: string;
  } | null;
  effective_status?: string; // Status for selected academic year
};

const fetchStudios = async (options?: { 
  gradeId?: string; 
  status?: string; 
  allocation?: string;
  academicYearId?: string;
}) => {
  // If academic year is provided, use the status view
  if (options?.academicYearId) {
    let query = supabase
      .from("studio_status_by_academic_year")
      .select(
        `
          studio_id,
          studio_number,
          studio_grade_id,
          floor,
          allocation,
          is_active,
          effective_status,
          global_status,
          reservation_expires_at,
          studio_grade:studio_grades!studio_grade_id ( id, name, slug )
        `,
      )
      .eq("academic_year_id", options.academicYearId)
      .order("studio_number", { ascending: true });

    if (options?.gradeId) {
      query = query.eq("studio_grade_id", options.gradeId);
    }

    if (options?.status) {
      query = query.eq("effective_status", options.status);
    }

    if (options?.allocation) {
      if (options.allocation === "unallocated") {
        query = query.is("allocation", null);
      } else {
        query = query.eq("allocation", options.allocation);
      }
    }

    const { data, error } = await query;
    if (error) {
      // If view doesn't exist, fall back to regular studios query
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        console.warn("studio_status_by_academic_year view not found. Please run the migration. Falling back to regular query.");
        // Fall through to regular query below
      } else {
        throw error;
      }
    } else if (data) {
      // Map to AdminStudio format
      return data.map((item) => ({
        id: item.studio_id,
        studio_number: item.studio_number,
        studio_grade_id: item.studio_grade_id,
        floor: item.floor,
        status: item.effective_status as StudioRow["status"],
        allocation: item.allocation,
        is_active: item.is_active,
        reservation_expires_at: item.reservation_expires_at,
        created_at: null,
        updated_at: null,
        effective_status: item.effective_status,
        studio_grade: item.studio_grade,
      })) as unknown as AdminStudio[];
    }
    // If we get here, view doesn't exist or no data - fall through to regular query
  }

  // Fallback to original query if no academic year
  let query = supabase
    .from("studios")
    .select(
      `
        *,
        studio_grade:studio_grades ( id, name, slug )
      `,
    )
    .order("studio_number", { ascending: true });

  if (options?.gradeId) {
    query = query.eq("studio_grade_id", options.gradeId);
  }

  if (options?.status) {
    query = query.eq("status", options.status);
  }

  if (options?.allocation) {
    if (options.allocation === "unallocated") {
      query = query.is("allocation", null);
    } else {
      query = query.eq("allocation", options.allocation);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as AdminStudio[]) ?? [];
};

export const useAdminStudios = (options?: { 
  gradeId?: string; 
  status?: string; 
  allocation?: string;
  academicYearId?: string;
}) =>
  useQuery({
    queryKey: ["admin-studios", options],
    queryFn: () => fetchStudios(options),
  });

export const useUpdateStudio = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<StudioRow> & { id: string }) => {
      const { id, ...rest } = payload;
      const { data, error } = await supabase
        .from("studios")
        .update(rest)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-studios"] });
    },
  });
};

