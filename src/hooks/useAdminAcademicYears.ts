import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "@/utils/auditLog";

type AcademicYear = Database["public"]["Tables"]["academic_years"]["Row"];

const fetchAcademicYears = async (): Promise<AcademicYear[]> => {
  const { data, error } = await supabase
    .from("academic_years")
    .select("*")
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
};

export const useAdminAcademicYears = () =>
  useQuery({
    queryKey: ["admin-academic-years"],
    queryFn: fetchAcademicYears,
  });

export const useCreateAcademicYear = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      start_date: string;
      end_date: string;
      is_active: boolean;
    }) => {
      const { data, error } = await supabase
        .from("academic_years")
        .insert(payload)
        .select("*")
        .single();

      if (error) throw error;

      // Log academic year creation
      await logActivity({
        action: "create",
        entityType: "academic_year",
        entityId: data.id,
        payload: {
          name: payload.name,
          start_date: payload.start_date,
          end_date: payload.end_date,
          is_active: payload.is_active,
        },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-academic-years"] });
    },
  });
};

export const useUpdateAcademicYear = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<AcademicYear> & { id: string }) => {
      const { id, ...rest } = payload;
      
      // Get old academic year data for logging
      let oldYear: { name?: string; is_active?: boolean; start_date?: string; end_date?: string } | null = null;
      try {
        const { data: oldYearData, error: oldYearError } = await supabase
          .from("academic_years")
          .select("name, is_active, start_date, end_date")
          .eq("id", id)
          .single();
        
        if (!oldYearError && oldYearData) {
          oldYear = oldYearData;
        } else if (oldYearError) {
          console.warn("Failed to fetch old academic year data for logging:", oldYearError);
        }
      } catch (fetchError) {
        console.warn("Error fetching old academic year data:", fetchError);
      }

      const { data, error } = await supabase
        .from("academic_years")
        .update(rest)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;

      // Log academic year update (don't let logging failure block the update)
      logActivity({
        action: "update",
        entityType: "academic_year",
        entityId: id,
        payload: {
          changes: {
            name: rest.name !== undefined ? { from: oldYear?.name, to: rest.name } : undefined,
            is_active: rest.is_active !== undefined
              ? { from: oldYear?.is_active, to: rest.is_active }
              : undefined,
            start_date: rest.start_date !== undefined ? { from: oldYear?.start_date, to: rest.start_date } : undefined,
            end_date: rest.end_date !== undefined ? { from: oldYear?.end_date, to: rest.end_date } : undefined,
          },
        },
      }).catch((logError) => {
        console.error("Failed to log academic year update:", logError);
        // Don't throw - allow the update to succeed even if logging fails
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-academic-years"] });
    },
  });
};

export const useSetActiveAcademicYear = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error: disableError } = await supabase
        .from("academic_years")
        .update({ is_active: false })
        .eq("is_active", true);
      if (disableError) throw disableError;

      // Get academic year name for logging
      const { data: yearData } = await supabase
        .from("academic_years")
        .select("name")
        .eq("id", id)
        .single();

      const { data, error } = await supabase
        .from("academic_years")
        .update({ is_active: true })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;

      // Log academic year activation
      await logActivity({
        action: "activate",
        entityType: "academic_year",
        entityId: id,
        payload: {
          name: yearData?.name,
        },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-academic-years"] });
    },
  });
};

