import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ContractRow = Database["public"]["Tables"]["contracts"]["Row"];
type PaymentPlanRow = Database["public"]["Tables"]["payment_plans"]["Row"];
type ContractPaymentPlanRow =
  Database["public"]["Tables"]["contract_payment_plans"]["Row"];

export type AdminContract = ContractRow & {
  studio_grade: {
    id: string;
    name: string;
    slug: string;
  } | null;
  contract_payment_plans: (ContractPaymentPlanRow & {
    payment_plan: {
      id: string;
      name: string;
    } | null;
  })[];
  academic_year: {
    id: string;
    name: string;
  } | null;
};

const fetchContracts = async (): Promise<AdminContract[]> => {
  const { data, error } = await supabase
    .from("contracts")
    .select(
      `
        *,
        studio_grade:studio_grades ( id, name, slug ),
        contract_payment_plans:contract_payment_plans (
          *,
          payment_plan:payment_plans ( id, name )
        ),
        academic_year:academic_years ( id, name )
      `,
    )
    .order("display_order", { ascending: true });

  if (error) throw error;
  return (data as unknown as AdminContract[]) ?? [];
};

export const useAdminContracts = () =>
  useQuery({
    queryKey: ["admin-contracts"],
    queryFn: fetchContracts,
  });

export const useUpdateContract = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Partial<ContractRow> & {
        id: string;
        payment_plan_ids?: string[] | null;
      },
    ) => {
      const { id, payment_plan_ids, ...rest } = payload;
      const { error } = await supabase
        .from("contracts")
        .update({
          ...rest,
          payment_plan_id: null,
        })
        .eq("id", id);
      if (error) throw error;

      await supabase
        .from("contract_payment_plans")
        .delete()
        .eq("contract_id", id);

      if (payment_plan_ids && payment_plan_ids.length) {
        const insertPayload = payment_plan_ids.map((planId, index) => ({
          contract_id: id,
          payment_plan_id: planId,
          display_order: index,
        }));
        const { error: linkError } = await supabase
          .from("contract_payment_plans")
          .insert(insertPayload);
        if (linkError) throw linkError;
      }

      return { id, ...rest };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-contracts"] });
    },
  });
};

export const useContractPaymentPlans = () =>
  useQuery({
    queryKey: ["admin-payment-plans-active"],
    queryFn: async (): Promise<PaymentPlanRow[]> => {
      const { data, error } = await supabase
        .from("payment_plans")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

