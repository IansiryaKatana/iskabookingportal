import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BookingCalendarItem = {
  studio_id: string;
  studio_number: string;
  studio_grade_id: string;
  studio_grade_name: string;
  allocation: string | null;
  studio_status: string;
  application_id: string | null;
  application_status: string | null;
  student_id: string | null;
  student_name: string | null;
  student_email: string | null;
  contract_id: string | null;
  contract_name: string | null;
  contract_start: string | null;
  contract_end: string | null;
  academic_year_id: string | null;
  academic_year_name: string | null;
  application_created_at: string | null;
  submitted_at: string | null;
  cancelled_at: string | null;
};

export type BookingCalendarFilters = {
  allocation?: string | null; // 'Student', 'OTA', 'Keyworkers', null for all
  studio_grade_id?: string | null;
  academic_year_id?: string | null;
  start_date?: string | null; // Filter studios visible in date range
  end_date?: string | null;
};

export const useBookingCalendar = (filters?: BookingCalendarFilters) => {
  return useQuery<BookingCalendarItem[], Error>({
    queryKey: ["booking-calendar", filters],
    queryFn: async () => {
      // Use the function to get data with email
      // Pass null explicitly for optional parameters (Supabase RPC handles this)
      const { data, error } = await supabase.rpc("get_booking_calendar_data", {
        p_allocation: filters?.allocation ?? null,
        p_studio_grade_id: filters?.studio_grade_id ?? null,
        p_academic_year_id: filters?.academic_year_id ?? null,
      });

      if (error) {
        console.error("Error fetching booking calendar data:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        console.error("Error details:", error.details);
        console.error("Error hint:", error.hint);
        console.error("Parameters passed:", {
          p_allocation: filters?.allocation ?? null,
          p_studio_grade_id: filters?.studio_grade_id ?? null,
          p_academic_year_id: filters?.academic_year_id ?? null,
        });
        throw error;
      }

      // Filter by date range if provided (client-side)
      let filtered = (data || []) as BookingCalendarItem[];

      if (filters?.start_date || filters?.end_date) {
        filtered = filtered.filter((item) => {
          // Include studio if:
          // 1. Has no booking (always show)
          // 2. Has booking that overlaps with date range
          if (!item.contract_start || !item.contract_end) {
            return true; // Show unbooked studios
          }

          const bookingStart = new Date(item.contract_start);
          const bookingEnd = new Date(item.contract_end);
          const filterStart = filters.start_date ? new Date(filters.start_date) : null;
          const filterEnd = filters.end_date ? new Date(filters.end_date) : null;

          // Check if booking overlaps with filter range
          if (filterStart && bookingEnd < filterStart) return false;
          if (filterEnd && bookingStart > filterEnd) return false;

          return true;
        });
      }

      // Sort by studio grade and studio number
      filtered.sort((a, b) => {
        if (a.studio_grade_name !== b.studio_grade_name) {
          return a.studio_grade_name.localeCompare(b.studio_grade_name);
        }
        return a.studio_number.localeCompare(b.studio_number);
      });

      return filtered;
    },
  });
};

