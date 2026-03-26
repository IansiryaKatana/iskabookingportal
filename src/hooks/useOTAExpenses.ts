import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OTAExpense = {
  id: string;
  ota_booking_id: string | null;
  channel: "airbnb" | "booking" | "agoda" | "expedia" | "other" | null;
  expense_category: "commission" | "cleaning" | "maintenance" | "supplies" | "tax" | "refund" | "other";
  description: string;
  amount: number;
  expense_date: string;
  vendor_name: string | null;
  invoice_number: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type OTAExpenseWithRelations = OTAExpense & {
  ota_booking?: {
    id: string;
    external_ref: string;
    guest_name: string;
    channel: string;
  } | null;
};

type OTAExpenseFilters = {
  channel?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
};

export const useOTAExpenses = (filters?: OTAExpenseFilters) => {
  return useQuery({
    queryKey: ["ota-expenses", filters],
    queryFn: async () => {
      let query = supabase
        .from("ota_expenses")
        .select(`
          *,
          ota_booking:ota_bookings(id, external_ref, guest_name, channel)
        `)
        .order("expense_date", { ascending: false });

      if (filters?.channel) {
        query = query.eq("channel", filters.channel);
      }
      if (filters?.category) {
        query = query.eq("expense_category", filters.category);
      }
      if (filters?.startDate) {
        query = query.gte("expense_date", filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte("expense_date", filters.endDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as OTAExpenseWithRelations[];
    },
  });
};

export const useCreateOTAExpense = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      ota_booking_id?: string | null;
      channel?: "airbnb" | "booking" | "agoda" | "expedia" | "other" | null;
      expense_category: "commission" | "cleaning" | "maintenance" | "supplies" | "tax" | "refund" | "other";
      description: string;
      amount: number;
      expense_date: string;
      vendor_name?: string | null;
      invoice_number?: string | null;
      notes?: string | null;
      created_by: string;
    }) => {
      const { data, error } = await supabase.from("ota_expenses").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ota-expenses"] });
    },
  });
};

export const useUpdateOTAExpense = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<OTAExpense> }) => {
      const { data, error } = await supabase
        .from("ota_expenses")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ota-expenses"] });
    },
  });
};

export const useDeleteOTAExpense = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ota_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ota-expenses"] });
    },
  });
};
