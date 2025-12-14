import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type OTABooking = Database["public"]["Tables"]["ota_bookings"]["Row"];

export type OTABookingWithRelations = OTABooking & {
  studio?: {
    id: string;
    studio_number: string;
    studio_grade_id: string;
    floor: string | null;
  } | null;
  created_by_user?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export const useOTABookings = (filters?: {
  status?: string;
  channel?: string;
  studio_id?: string;
  check_in_start?: string;
  check_in_end?: string;
  check_out_start?: string;
  check_out_end?: string;
}) => {
  return useQuery({
    queryKey: ["ota-bookings", filters],
    queryFn: async () => {
      let query = supabase
        .from("ota_bookings")
        .select(`
          *,
          studio:studios(id, studio_number, studio_grade_id, floor)
        `)
        .order("check_in", { ascending: true });

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.channel) {
        query = query.eq("channel", filters.channel);
      }
      if (filters?.studio_id) {
        query = query.eq("studio_id", filters.studio_id);
      }
      if (filters?.check_in_start) {
        query = query.gte("check_in", filters.check_in_start);
      }
      if (filters?.check_in_end) {
        query = query.lte("check_in", filters.check_in_end);
      }
      if (filters?.check_out_start) {
        query = query.gte("check_out", filters.check_out_start);
      }
      if (filters?.check_out_end) {
        query = query.lte("check_out", filters.check_out_end);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      if (!data || data.length === 0) {
        return [] as OTABookingWithRelations[];
      }

      // Fetch created_by profiles separately
      const createdByIds = data
        .map((b) => b.created_by)
        .filter((id): id is string => Boolean(id));
      
      let profilesMap: Record<string, { id: string; first_name: string | null; last_name: string | null }> = {};
      
      if (createdByIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", createdByIds);
        
        if (profiles) {
          profiles.forEach((profile) => {
            profilesMap[profile.id] = profile;
          });
        }
      }

      // Map OTA bookings with created_by_user profile
      return data.map((booking) => ({
        ...booking,
        created_by_user: booking.created_by 
          ? (profilesMap[booking.created_by] || null)
          : null,
      })) as OTABookingWithRelations[];
    },
  });
};

export const useCreateOTABooking = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (booking: {
      external_ref: string;
      channel: "airbnb" | "booking" | "agoda" | "expedia" | "other";
      guest_name: string;
      guest_phone?: string;
      guest_email?: string;
      studio_id?: string;
      check_in: string;
      check_out: string;
      status?: string;
      notes?: string;
      internal_notes?: string;
      price_per_night?: number;
      commission_amount?: number;
      currency?: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("ota_bookings")
        .insert({
          external_ref: booking.external_ref,
          channel: booking.channel,
          guest_name: booking.guest_name,
          guest_phone: booking.guest_phone,
          guest_email: booking.guest_email,
          studio_id: booking.studio_id,
          check_in: booking.check_in,
          check_out: booking.check_out,
          status: booking.status || "arriving",
          notes: booking.notes,
          internal_notes: booking.internal_notes,
          price_per_night: booking.price_per_night,
          commission_amount: booking.commission_amount,
          currency: booking.currency || "GBP",
          created_by: userData.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ota-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["housekeeping-status"] });
    },
  });
};

export const useUpdateOTABooking = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<OTABooking>;
    }) => {
      const { data, error } = await supabase
        .from("ota_bookings")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ota-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["housekeeping-status"] });
    },
  });
};

export const useBulkUpdateOTABookings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ids,
      updates,
    }: {
      ids: string[];
      updates: Partial<OTABooking>;
    }) => {
      const { data, error } = await supabase
        .from("ota_bookings")
        .update(updates)
        .in("id", ids)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ota-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["housekeeping-status"] });
    },
  });
};

