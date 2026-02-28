import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "@/utils/auditLog";

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
  floor?: string;
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

    if (options?.floor) {
      query = query.eq("floor", options.floor);
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

  if (options?.floor) {
    query = query.eq("floor", options.floor);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as AdminStudio[]) ?? [];
};

export const useAdminStudios = (options?: { 
  gradeId?: string; 
  status?: string; 
  allocation?: string;
  floor?: string;
  academicYearId?: string;
}) =>
  useQuery({
    queryKey: ["admin-studios", options],
    queryFn: () => fetchStudios(options),
  });

/** When set with status 'maintenance', write to per-year override only (no global). When clearing maintenance, delete override and update global. */
export type UpdateStudioPayload = Partial<StudioRow> & {
  id: string;
  academicYearId?: string | null;
};

export const useUpdateStudio = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateStudioPayload) => {
      const { id, academicYearId, ...rest } = payload;

      const { data: oldStudio } = await supabase
        .from("studios")
        .select("studio_number, status, allocation, is_active, studio_grade_id")
        .eq("id", id)
        .single();

      const isMaintenance = rest.status === "maintenance";
      const hasYear = Boolean(academicYearId);

      if (rest.status !== undefined && hasYear) {
        if (isMaintenance) {
          await supabase.from("studio_maintenance_by_academic_year").upsert(
            { studio_id: id, academic_year_id: academicYearId! },
            { onConflict: "studio_id,academic_year_id" }
          );
          const { status: _s, ...restWithoutStatus } = rest;
          if (Object.keys(restWithoutStatus).length === 0) {
            await logActivity({
              action: "update",
              entityType: "studio",
              entityId: id,
              payload: {
                studio_number: oldStudio?.studio_number,
                changes: { status: { from: oldStudio?.status, to: "maintenance", scope: "academic_year", academic_year_id: academicYearId } },
              },
            });
            return (await supabase.from("studios").select("*").eq("id", id).single()).data as StudioRow;
          }
          rest = restWithoutStatus as Partial<StudioRow>;
        } else {
          await supabase
            .from("studio_maintenance_by_academic_year")
            .delete()
            .eq("studio_id", id)
            .eq("academic_year_id", academicYearId!);
        }
      }

      const { data, error } = await supabase
        .from("studios")
        .update(rest)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;

      await logActivity({
        action: "update",
        entityType: "studio",
        entityId: id,
        payload: {
          studio_number: oldStudio?.studio_number,
          changes: {
            status: rest.status !== undefined ? { from: oldStudio?.status, to: rest.status } : undefined,
            allocation: rest.allocation !== undefined ? { from: oldStudio?.allocation, to: rest.allocation } : undefined,
            is_active: rest.is_active !== undefined ? { from: oldStudio?.is_active, to: rest.is_active } : undefined,
            studio_grade_id: rest.studio_grade_id !== undefined ? { from: oldStudio?.studio_grade_id, to: rest.studio_grade_id } : undefined,
          },
        },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-studios"] });
    },
  });
};

export type BulkUpdateStudiosPayload = {
  studioIds: string[];
  updates: Partial<StudioRow>;
  academicYearId?: string | null;
};

export const useBulkUpdateStudios = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BulkUpdateStudiosPayload) => {
      const { studioIds, updates, academicYearId } = payload;

      const { data: oldStudios } = await supabase
        .from("studios")
        .select("id, studio_number, status, allocation, studio_grade_id")
        .in("id", studioIds);

      const isMaintenance = updates.status === "maintenance";
      const hasYear = Boolean(academicYearId);

      let updatesToApply = { ...updates };
      if (updates.status !== undefined && hasYear) {
        if (isMaintenance) {
          const rows = studioIds.map((studio_id) => ({
            studio_id,
            academic_year_id: academicYearId!,
          }));
          await supabase.from("studio_maintenance_by_academic_year").upsert(rows, {
            onConflict: "studio_id,academic_year_id",
          });
          const { status: _s, ...rest } = updates;
          if (Object.keys(rest).length === 0) {
            await logActivity({
              action: "update",
              entityType: "studio",
              entityId: null,
              payload: {
                bulk_update: true,
                studios_count: studioIds.length,
                studio_ids: studioIds,
                changes: { status: { to: "maintenance", scope: "academic_year", academic_year_id: academicYearId } },
              },
            });
            return (await supabase.from("studios").select("*").in("id", studioIds))?.data ?? [];
          }
          updatesToApply = rest;
        } else {
          await supabase
            .from("studio_maintenance_by_academic_year")
            .delete()
            .in("studio_id", studioIds)
            .eq("academic_year_id", academicYearId!);
        }
      }

      const { data, error } = await supabase
        .from("studios")
        .update(updatesToApply)
        .in("id", studioIds)
        .select("*");

      if (error) throw error;

      await logActivity({
        action: "update",
        entityType: "studio",
        entityId: null,
        payload: {
          bulk_update: true,
          studios_count: studioIds.length,
          studio_ids: studioIds,
          changes: {
            status: updates.status !== undefined ? { from: oldStudios?.map((s) => s.status), to: updates.status } : undefined,
            allocation: updates.allocation !== undefined ? { from: oldStudios?.map((s) => s.allocation), to: updates.allocation } : undefined,
            is_active: updates.is_active !== undefined ? { from: oldStudios?.map((s) => s.is_active), to: updates.is_active } : undefined,
            studio_grade_id: updates.studio_grade_id !== undefined ? { from: oldStudios?.map((s) => s.studio_grade_id), to: updates.studio_grade_id } : undefined,
          },
        },
      });

      return data ?? [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-studios"] });
    },
  });
};

