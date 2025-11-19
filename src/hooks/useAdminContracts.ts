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

export const useCreateContract = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Omit<ContractRow, "id" | "created_at" | "updated_at"> & {
        payment_plan_ids?: string[] | null;
      },
    ) => {
      const { payment_plan_ids, ...contractData } = payload;
      
      // Generate slug from name if not provided
      const slug = contractData.slug || 
        contractData.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

      const { data: contract, error } = await supabase
        .from("contracts")
        .insert({
          ...contractData,
          slug,
        })
        .select("*")
        .single();

      if (error) throw error;

      // Link payment plans if provided
      if (payment_plan_ids && payment_plan_ids.length && contract) {
        const insertPayload = payment_plan_ids.map((planId, index) => ({
          contract_id: contract.id,
          payment_plan_id: planId,
          display_order: index,
        }));
        const { error: linkError } = await supabase
          .from("contract_payment_plans")
          .insert(insertPayload);
        if (linkError) throw linkError;
      }

      return contract;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-contracts"] });
    },
  });
};

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

export const useContractPaymentPlans = (academicYearId?: string | null) =>
  useQuery({
    queryKey: ["admin-payment-plans-active", academicYearId],
    queryFn: async (): Promise<PaymentPlanRow[]> => {
      let query = supabase
        .from("payment_plans")
        .select("*")
        .eq("is_active", true);
      
      // If academicYearId is provided, filter by it
      if (academicYearId) {
        query = query.eq("academic_year_id", academicYearId);
      }
      
      const { data, error } = await query.order("name", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    enabled: true, // Always enabled, but filters by academic year if provided
  });

/**
 * Duplicate contracts from one academic year to another
 * Adds 1 year to contract dates, recalculates weeks, links to payment plans by name
 */
export const useDuplicateContracts = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      sourceAcademicYearId: string;
      targetAcademicYearId: string;
    }) => {
      const { sourceAcademicYearId, targetAcademicYearId } = payload;

      // Fetch source contracts with payment plan links
      const { data: sourceContracts, error: sourceError } = await supabase
        .from("contracts")
        .select(
          `
          *,
          contract_payment_plans:contract_payment_plans (
            *,
            payment_plan:payment_plans ( id, name )
          )
        `,
        )
        .eq("academic_year_id", sourceAcademicYearId)
        .order("display_order", { ascending: true });

      if (sourceError) throw sourceError;
      if (!sourceContracts || sourceContracts.length === 0) {
        throw new Error("No contracts found in source academic year");
      }

      // Fetch target year payment plans for name matching
      const { data: targetPlans, error: plansError } = await supabase
        .from("payment_plans")
        .select("id, name")
        .eq("academic_year_id", targetAcademicYearId)
        .eq("is_active", true);

      if (plansError) throw plansError;

      // Create a map of payment plan names to IDs for the target year
      const targetPlanMap = new Map(
        (targetPlans ?? []).map((plan) => [plan.name, plan.id]),
      );

      // Duplicate each contract
      let duplicatedCount = 0;
      for (const sourceContract of sourceContracts) {
        const contractData = sourceContract as any;
        const paymentPlanLinks = contractData.contract_payment_plans ?? [];

        // Add 1 year to contract dates
        let contractStart: string | null = null;
        let contractEnd: string | null = null;
        let weeks: number | null = null;

        if (contractData.contract_start) {
          const startDate = new Date(contractData.contract_start);
          startDate.setFullYear(startDate.getFullYear() + 1);
          contractStart = startDate.toISOString().split("T")[0];
        }

        if (contractData.contract_end) {
          const endDate = new Date(contractData.contract_end);
          endDate.setFullYear(endDate.getFullYear() + 1);
          contractEnd = endDate.toISOString().split("T")[0];
        }

        // Recalculate weeks from new dates
        if (contractStart && contractEnd) {
          const start = new Date(contractStart);
          const end = new Date(contractEnd);
          const diffTime = Math.abs(end.getTime() - start.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          weeks = Math.ceil(diffDays / 7);
        } else {
          weeks = contractData.weeks; // Fallback to original weeks if dates missing
        }

        // Generate new slug
        const newSlug =
          contractData.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "") +
          "-" +
          targetAcademicYearId.slice(0, 8); // Add year ID suffix for uniqueness

        // Create new contract
        const { data: newContract, error: contractError } = await supabase
          .from("contracts")
          .insert({
            academic_year_id: targetAcademicYearId,
            studio_grade_id: contractData.studio_grade_id,
            name: contractData.name,
            slug: newSlug,
            contract_start: contractStart,
            contract_end: contractEnd,
            weeks: weeks ?? contractData.weeks,
            weekly_price_override: contractData.weekly_price_override,
            deposit_override: contractData.deposit_override,
            summary: contractData.summary,
            display_order: contractData.display_order,
            cta_label: contractData.cta_label,
            is_active: contractData.is_active,
          })
          .select("*")
          .single();

        if (contractError) throw contractError;

        // Link payment plans by matching names
        if (paymentPlanLinks.length > 0 && newContract) {
          const linksToCreate: Array<{
            contract_id: string;
            payment_plan_id: string;
            display_order: number;
          }> = [];

          paymentPlanLinks.forEach((link: any, index: number) => {
            const planName = link.payment_plan?.name;
            if (planName && targetPlanMap.has(planName)) {
              linksToCreate.push({
                contract_id: newContract.id,
                payment_plan_id: targetPlanMap.get(planName)!,
                display_order: link.display_order ?? index,
              });
            }
          });

          if (linksToCreate.length > 0) {
            const { error: linkError } = await supabase
              .from("contract_payment_plans")
              .insert(linksToCreate);

            if (linkError) {
              console.warn("Error linking payment plans:", linkError);
              // Don't throw - contract was created, just payment plan links failed
            }
          }
        }

        duplicatedCount++;
      }

      return { count: duplicatedCount };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-contracts"] });
    },
  });
};

