import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type UtilityPayment = Database["public"]["Tables"]["utility_payments"]["Row"];

export type UtilityPaymentWithRelations = UtilityPayment & {
  academic_year?: {
    id: string;
    name: string;
  } | null;
};

export const useUtilityPayments = (filters?: {
  academicYearId?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
}) => {
  return useQuery({
    queryKey: ["utility-payments", filters],
    queryFn: async () => {
      let query = supabase
        .from("utility_payments")
        .select(`
          *,
          academic_year:academic_years(id, name)
        `)
        .order("payment_date", { ascending: false });

      if (filters?.academicYearId) {
        query = query.eq("academic_year_id", filters.academicYearId);
      }
      if (filters?.category) {
        query = query.eq("expense_category", filters.category);
      }
      if (filters?.startDate) {
        query = query.gte("payment_date", filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte("payment_date", filters.endDate);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as UtilityPaymentWithRelations[];
    },
  });
};

export const useCreateUtilityPayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payment: {
      academic_year_id: string;
      expense_category: string;
      description: string;
      amount: number;
      payment_date: string;
      vendor_name?: string;
      invoice_number?: string;
      receipt_path?: string;
      notes?: string;
      created_by: string;
    }) => {
      const { data, error } = await supabase
        .from("utility_payments")
        .insert(payment)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["utility-payments"] });
    },
  });
};

export const useUpdateUtilityPayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<UtilityPayment>;
    }) => {
      const { data, error } = await supabase
        .from("utility_payments")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["utility-payments"] });
    },
  });
};

export const useDeleteUtilityPayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("utility_payments")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["utility-payments"] });
    },
  });
};

