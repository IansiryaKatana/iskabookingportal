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
  effective_check_in_date: string | null;
  effective_check_out_date: string | null;
  actual_check_in_date: string | null;
  actual_check_out_date: string | null;
  check_in_notes: string | null;
  check_out_notes: string | null;
  checked_in_by: string | null;
  checked_out_by: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  academic_year_id: string | null;
  academic_year_name: string | null;
  application_created_at: string | null;
  submitted_at: string | null;
  cancelled_at: string | null;
};

export type StudioCalendarGroup = {
  studio_id: string;
  studio_number: string;
  studio_grade_id: string;
  studio_grade_name: string;
  allocation: string | null;
  studio_status: string;
  bookings: BookingCalendarItem[];
};

export type BookingCalendarFilters = {
  allocation?: string | null;
  studio_grade_id?: string | null;
  academic_year_id?: string | null;
};

export function groupBookingCalendarByStudio(
  items: BookingCalendarItem[],
): StudioCalendarGroup[] {
  const grouped = new Map<string, StudioCalendarGroup>();

  for (const item of items) {
    let studio = grouped.get(item.studio_id);
    if (!studio) {
      studio = {
        studio_id: item.studio_id,
        studio_number: item.studio_number,
        studio_grade_id: item.studio_grade_id,
        studio_grade_name: item.studio_grade_name,
        allocation: item.allocation,
        studio_status: item.studio_status,
        bookings: [],
      };
      grouped.set(item.studio_id, studio);
    }

    if (item.application_id) {
      studio.bookings.push(item);
    }
  }

  return Array.from(grouped.values()).sort((a, b) => {
    if (a.studio_grade_name !== b.studio_grade_name) {
      return a.studio_grade_name.localeCompare(b.studio_grade_name);
    }
    return a.studio_number.localeCompare(b.studio_number);
  });
}

export const useBookingCalendar = (filters?: BookingCalendarFilters) => {
  return useQuery<StudioCalendarGroup[], Error>({
    queryKey: ["booking-calendar", filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_booking_calendar_data", {
        p_allocation: filters?.allocation ?? null,
        p_studio_grade_id: filters?.studio_grade_id ?? null,
        p_academic_year_id: filters?.academic_year_id ?? null,
      });

      if (error) {
        console.error("Error fetching booking calendar data:", error);
        throw error;
      }

      return groupBookingCalendarByStudio((data || []) as BookingCalendarItem[]);
    },
  });
};
