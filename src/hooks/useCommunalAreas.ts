import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type CommunalArea = Database["public"]["Tables"]["communal_areas"]["Row"];

export type CommunalAreaWithRelations = CommunalArea & {
  created_by_profile?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export const useCommunalAreas = (filters?: { isActive?: boolean }) => {
  return useQuery({
    queryKey: ["communal-areas", filters],
    queryFn: async () => {
      let query = supabase
        .from("communal_areas")
        .select(`
          *,
          created_by_profile:profiles!created_by(id, first_name, last_name)
        `)
        .order("name", { ascending: true });

      if (filters?.isActive !== undefined) {
        query = query.eq("is_active", filters.isActive);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CommunalAreaWithRelations[];
    },
  });
};

export const useCreateCommunalArea = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (area: {
      name: string;
      location?: string;
      description?: string;
      cleaning_schedule_type: "daily" | "weekly" | "biweekly" | "monthly" | "custom";
      cleaning_schedule_days?: number[];
      cleaning_schedule_time?: string;
      is_active?: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Ensure cleaning_schedule_days is null if empty array (PostgreSQL prefers null for empty arrays)
      const insertData: any = {
        ...area,
        created_by: user.id,
        is_active: area.is_active ?? true,
        cleaning_schedule_days: area.cleaning_schedule_days && area.cleaning_schedule_days.length > 0 
          ? area.cleaning_schedule_days 
          : null,
      };

      const { data: createdArea, error } = await supabase
        .from("communal_areas")
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new Error(error.message || "Failed to create communal area");
      }

      // Auto-create housekeeping record for the new area
      if (createdArea) {
        // Calculate next_clean_due_at based on schedule
        let nextCleanDueAt: string | null = null;
        const today = new Date();
        
        if (createdArea.cleaning_schedule_type === "daily") {
          // Next day
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          nextCleanDueAt = tomorrow.toISOString().split('T')[0];
        } else if (createdArea.cleaning_schedule_type === "weekly" && createdArea.cleaning_schedule_days && createdArea.cleaning_schedule_days.length > 0) {
          // Find next scheduled day
          const currentDay = today.getDay() === 0 ? 7 : today.getDay(); // Convert Sunday (0) to 7
          const sortedDays = [...createdArea.cleaning_schedule_days].sort((a, b) => a - b);
          const nextDay = sortedDays.find(d => d > currentDay) || sortedDays[0];
          const daysUntilNext = nextDay > currentDay ? nextDay - currentDay : (7 - currentDay + nextDay);
          const nextDate = new Date(today);
          nextDate.setDate(nextDate.getDate() + daysUntilNext);
          nextCleanDueAt = nextDate.toISOString().split('T')[0];
        } else if (createdArea.cleaning_schedule_type === "biweekly" && createdArea.cleaning_schedule_days && createdArea.cleaning_schedule_days.length > 0) {
          // Find next scheduled day (2 weeks from now)
          const currentDay = today.getDay() === 0 ? 7 : today.getDay();
          const sortedDays = [...createdArea.cleaning_schedule_days].sort((a, b) => a - b);
          const nextDay = sortedDays.find(d => d > currentDay) || sortedDays[0];
          const daysUntilNext = nextDay > currentDay ? nextDay - currentDay : (7 - currentDay + nextDay);
          const nextDate = new Date(today);
          nextDate.setDate(nextDate.getDate() + daysUntilNext + 7); // Add extra week for biweekly
          nextCleanDueAt = nextDate.toISOString().split('T')[0];
        } else if (createdArea.cleaning_schedule_type === "monthly") {
          // Next month, same day
          const nextDate = new Date(today);
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextCleanDueAt = nextDate.toISOString().split('T')[0];
        }

        // Create housekeeping record
        const { error: housekeepingError } = await supabase
          .from("communal_area_housekeeping")
          .insert({
            communal_area_id: createdArea.id,
            status: "clean",
            next_clean_due_at: nextCleanDueAt,
          });

        if (housekeepingError) {
          // Don't throw - area was created successfully, housekeeping can be created later
          // Log silently - user can manually create housekeeping record if needed
        }
      }

      return createdArea;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communal-areas"] });
      queryClient.invalidateQueries({ queryKey: ["communal-area-housekeeping"] });
    },
  });
};

export const useUpdateCommunalArea = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<CommunalArea>;
    }) => {
      // Ensure cleaning_schedule_days is null if empty array
      const updateData: any = {
        ...updates,
        cleaning_schedule_days: updates.cleaning_schedule_days && updates.cleaning_schedule_days.length > 0
          ? updates.cleaning_schedule_days
          : updates.cleaning_schedule_days === undefined
          ? undefined
          : null,
      };

      const { data, error } = await supabase
        .from("communal_areas")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        throw new Error(error.message || "Failed to update communal area");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communal-areas"] });
    },
  });
};

export const useDeleteCommunalArea = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Delete housekeeping record first (due to foreign key constraint)
      const { error: housekeepingError } = await supabase
        .from("communal_area_housekeeping")
        .delete()
        .eq("communal_area_id", id);

      if (housekeepingError) {
        console.error("Failed to delete housekeeping record:", housekeepingError);
        // Continue anyway - might not exist
      }

      const { error } = await supabase
        .from("communal_areas")
        .delete()
        .eq("id", id);

      if (error) {
        throw new Error(error.message || "Failed to delete communal area");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communal-areas"] });
    },
  });
};

