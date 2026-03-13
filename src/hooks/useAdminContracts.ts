import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "@/utils/auditLog";

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

// Helper to generate a slug from contract name and academic year
const generateContractSlug = async (
  name: string | null,
  academicYearId: string | null,
): Promise<string | null> => {
  if (!name) return null;

  let academicYearName = "";
  if (academicYearId) {
    const { data: academicYear } = await supabase
      .from("academic_years")
      .select("name")
      .eq("id", academicYearId)
      .single();
    if (academicYear?.name) {
      const yearMatch = academicYear.name.match(/(\d{2})\/(\d{2})/);
      if (yearMatch) {
        academicYearName = `${yearMatch[1]}-${yearMatch[2]}`;
      } else {
        academicYearName = academicYear.name.replace(/\//g, "-");
      }
    }
  }

  let slug = name
    .toLowerCase()
    .replace(/\s*studio\s*·\s*/i, "-")
    .replace(/\s*weeks\s*·\s*/i, "-weeks-")
    .replace(/\s*\/\s*/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/(^-|-$)/g, "");

  if (academicYearName) {
    if (slug.match(/-\d{2}-\d{2}$/)) {
      slug = slug.replace(/-\d{2}-\d{2}$/, `-${academicYearName}`);
    } else {
      slug = `${slug}-${academicYearName}`;
    }
  }

  return slug;
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
        payment_plan_orders?: number[] | null;
      },
    ) => {
      const { payment_plan_ids, payment_plan_orders, ...contractData } = payload;
      let slug = contractData.slug;
      if (!slug && contractData.name) {
        slug = await generateContractSlug(
          contractData.name,
          contractData.academic_year_id ?? null,
        );
      }

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
          display_order: payment_plan_orders?.[index] ?? (index + 1),
        }));
        const { error: linkError } = await supabase
          .from("contract_payment_plans")
          .insert(insertPayload);
        if (linkError) throw linkError;

        // Always create contract_payment_schedule so instalments show (e.g. in Record Manual Payment)
        const { error: backfillError } = await supabase.rpc(
          "backfill_contract_payment_schedule_for_contract",
          {
            p_contract_id: contract.id,
            p_payment_plan_id: payment_plan_ids[0],
          },
        );
        if (backfillError) throw backfillError;
      }

      // Log contract creation
      await logActivity({
        action: "create",
        entityType: "contract",
        entityId: contract.id,
        payload: {
          name: contractData.name,
          slug: contract.slug,
          academic_year_id: contractData.academic_year_id,
          studio_grade_id: contractData.studio_grade_id,
          contract_start: contractData.contract_start,
          contract_end: contractData.contract_end,
          payment_plans_count: payment_plan_ids?.length || 0,
        },
      });

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
        payment_plan_orders?: number[] | null;
      },
    ) => {
      const { id, payment_plan_ids, payment_plan_orders, ...rest } = payload;
      
      // Get old contract data for logging
      const { data: oldContract } = await supabase
        .from("contracts")
        .select("name, is_active, weekly_price_override, deposit_override")
        .eq("id", id)
        .single();

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

      // Rebuild schedule when plans change: remove old schedule then backfill from first plan
      await supabase.from("contract_payment_schedule").delete().eq("contract_id", id);

      if (payment_plan_ids && payment_plan_ids.length) {
        const insertPayload = payment_plan_ids.map((planId, index) => ({
          contract_id: id,
          payment_plan_id: planId,
          display_order: payment_plan_orders?.[index] ?? (index + 1),
        }));
        const { error: linkError } = await supabase
          .from("contract_payment_plans")
          .insert(insertPayload);
        if (linkError) throw linkError;

        const { error: backfillError } = await supabase.rpc(
          "backfill_contract_payment_schedule_for_contract",
          {
            p_contract_id: id,
            p_payment_plan_id: payment_plan_ids[0],
          },
        );
        if (backfillError) throw backfillError;
      }

      // Log contract update
      await logActivity({
        action: "update",
        entityType: "contract",
        entityId: id,
        payload: {
          changes: {
            name: rest.name !== undefined ? { from: oldContract?.name, to: rest.name } : undefined,
            is_active: rest.is_active !== undefined
              ? { from: oldContract?.is_active, to: rest.is_active }
              : undefined,
            weekly_price_override: rest.weekly_price_override !== undefined
              ? { from: oldContract?.weekly_price_override, to: rest.weekly_price_override }
              : undefined,
            deposit_override: rest.deposit_override !== undefined
              ? { from: oldContract?.deposit_override, to: rest.deposit_override }
              : undefined,
          },
          payment_plans_count: payment_plan_ids?.length || 0,
        },
      });

      return { id, ...rest };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-contracts"] });
    },
  });
};

/**
 * Duplicate a single contract (including its payment plans) within the same academic year.
 */
export const useDuplicateContractById = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contractId: string) => {
      const { data: source, error: sourceError } = await supabase
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
        .eq("id", contractId)
        .single();

      if (sourceError) throw sourceError;
      if (!source) throw new Error("Source contract not found");

      const src: any = source;

      // Build new name and slug
      const baseName: string = src.name || "Contract";
      const newName = `${baseName} (Copy)`;
      const newSlug = await generateContractSlug(
        newName,
        src.academic_year_id ?? null,
      );

      const { data: newContract, error: insertError } = await supabase
        .from("contracts")
        .insert({
          academic_year_id: src.academic_year_id,
          studio_grade_id: src.studio_grade_id,
          name: newName,
          slug: newSlug,
          contract_start: src.contract_start,
          contract_end: src.contract_end,
          weeks: src.weeks,
          weekly_price_override: src.weekly_price_override,
          deposit_override: src.deposit_override,
          summary: src.summary,
          display_order: src.display_order,
          cta_label: src.cta_label,
          visible_on_portal: src.visible_on_portal,
          is_custom_duration_placeholder: src.is_custom_duration_placeholder,
          is_active: src.is_active,
        })
        .select("*")
        .single();

      if (insertError) throw insertError;

      const links: any[] = src.contract_payment_plans ?? [];
      if (links.length > 0 && newContract) {
        const insertPayload = links.map((link: any, index: number) => ({
          contract_id: newContract.id,
          payment_plan_id: link.payment_plan_id,
          display_order: link.display_order ?? index + 1,
        }));

        const { error: linkError } = await supabase
          .from("contract_payment_plans")
          .insert(insertPayload);
        if (linkError) throw linkError;

        const firstPlanId = insertPayload[0]?.payment_plan_id;
        if (firstPlanId) {
          const { error: backfillError } = await supabase.rpc(
            "backfill_contract_payment_schedule_for_contract",
            {
              p_contract_id: newContract.id,
              p_payment_plan_id: firstPlanId,
            },
          );
          if (backfillError) throw backfillError;
        }
      }

      await logActivity({
        action: "create",
        entityType: "contract",
        entityId: newContract.id,
        payload: {
          source_contract_id: contractId,
          name: newContract.name,
          slug: newContract.slug,
          academic_year_id: newContract.academic_year_id,
          studio_grade_id: newContract.studio_grade_id,
        },
      });

      return newContract;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-contracts"] });
    },
  });
};

/**
 * Delete a contract. Only superadmin can delete (enforced by RLS).
 * Fails if any student applications reference this contract (DB ON DELETE RESTRICT).
 */
export const useDeleteContract = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contractId: string) => {
      const { data: contract, error: fetchError } = await supabase
        .from("contracts")
        .select("id, name, slug, student_application_id")
        .eq("id", contractId)
        .single();

      if (fetchError || !contract) throw fetchError ?? new Error("Contract not found");

      if ((contract as { student_application_id?: string | null }).student_application_id) {
        throw new Error(
          "Cannot delete a custom (per-application) contract. Edit the application's payment schedule from the application review page instead."
        );
      }

      const { count, error: countError } = await supabase
        .from("student_applications")
        .select("*", { count: "exact", head: true })
        .eq("contract_id", contractId);

      if (countError) throw countError;
      if ((count ?? 0) > 0) {
        throw new Error(
          "Cannot delete this contract because it has existing applications. Remove or reassign applications first."
        );
      }

      const { error } = await supabase.from("contracts").delete().eq("id", contractId);

      if (error) throw error;

      await logActivity({
        action: "delete",
        entityType: "contract",
        entityId: contractId,
        payload: { name: contract.name, slug: contract.slug },
      });

      return contractId;
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
          weeks = Math.round(diffDays / 7);
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

