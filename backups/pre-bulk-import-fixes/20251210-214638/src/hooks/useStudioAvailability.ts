import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StudioAvailability = {
  studio_grade_id: string;
  studio_grade_name: string;
  studio_grade_slug: string;
  contract_id: string | null;
  contract_name: string | null;
  academic_year_id: string | null;
  academic_year_name: string | null;
  total_capacity: number;
  available_count: number;
  reserved_count: number;
  occupied_count: number;
  maintenance_count: number;
  availability_percentage: number;
};

export type AvailabilityTag = {
  label: string;
  className: string;
  showCount?: boolean;
  count?: number;
};

/**
 * Get availability for a specific studio grade and contract
 */
export const useStudioAvailability = (studioGradeId: string, contractId?: string) => {
  return useQuery({
    queryKey: ["studio-availability", studioGradeId, contractId],
    queryFn: async () => {
      if (contractId) {
        const { data, error } = await supabase
          .from("studio_grade_availability")
          .select("*")
          .eq("studio_grade_id", studioGradeId)
          .eq("contract_id", contractId)
          .maybeSingle();

        if (error) throw error;
        return data as StudioAvailability | null;
      } else {
        // Get availability for active contract (first one found)
        const { data, error } = await supabase
          .from("studio_grade_availability")
          .select("*")
          .eq("studio_grade_id", studioGradeId)
          .order("academic_year_name", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        return data as StudioAvailability | null;
      }
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000, // Refresh every 30 seconds
  });
};

/**
 * Get availability for all studio grades filtered by academic year (for catalog page)
 * Uses the academic year-specific view to show aggregated availability per grade per year
 */
export const useAllStudioAvailability = (academicYearId?: string) => {
  return useQuery({
    queryKey: ["all-studio-availability", academicYearId],
    queryFn: async () => {
      if (!academicYearId) {
        console.warn("useAllStudioAvailability called without academicYearId");
        return [];
      }

      const { data, error } = await supabase
        .from("studio_grade_availability_by_year")
        .select("*")
        .eq("academic_year_id", academicYearId)
        .order("studio_grade_name", { ascending: true });

      if (error) {
        console.error("Error fetching studio availability by year:", error);
        // If view doesn't exist, return empty array
        if (error.code === "42P01" || error.message.includes("does not exist")) {
          console.warn("studio_grade_availability_by_year view not found. Please run the migration.");
          return [];
        }
        throw error;
      }

      // Map to match StudioAvailability type (contract fields will be null)
      return (data || []).map((item) => ({
        ...item,
        contract_id: null,
        contract_name: null,
      })) as StudioAvailability[];
    },
    enabled: !!academicYearId, // Only run query when academicYearId is provided
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000, // Refresh every 30 seconds
  });
};

/**
 * Generate dynamic availability tag based on availability
 */
export const getAvailabilityTag = (availability: StudioAvailability | null): AvailabilityTag | null => {
  if (!availability) return null;

  const { available_count, total_capacity, availability_percentage } = availability;

  // Fully booked
  if (available_count === 0) {
    return {
      label: "Fully Booked",
      className: "bg-red-500 text-white",
    };
  }

  // Very low availability (≤ 5 studios)
  if (available_count <= 5) {
    return {
      label: `${available_count} Left`,
      className: "bg-rose-500 text-white",
      showCount: true,
      count: available_count,
    };
  }

  // Low availability (< 20%)
  if (availability_percentage < 20) {
    return {
      label: "Going Fast",
      className: "bg-amber-400 text-black",
    };
  }

  // Normal availability
  return null;
};

/**
 * Check if studio grade is fully booked
 */
export const isFullyBooked = (availability: StudioAvailability | null): boolean => {
  return availability?.available_count === 0;
};

