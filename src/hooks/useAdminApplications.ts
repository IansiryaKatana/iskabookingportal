import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "@/utils/auditLog";
import {
  hasRecordedDeposit,
  isEnteringDepositRequiredStatus,
  isStatusRequiringDeposit,
} from "@/utils/depositStatus";
import { syncPaymentPlanFromStep5 } from "@/utils/syncPaymentPlanFromStep5";

type ApplicationRow = Database["public"]["Tables"]["student_applications"]["Row"];

export type AdminApplication = ApplicationRow & {
  student: {
    id: string;
    email?: string;
    first_name?: string;
    last_name?: string;
  } | null;
  contract: {
    id: string;
    name: string;
    weeks: number;
    student_application_id?: string | null;
    contract_start?: string | null;
    contract_end?: string | null;
    studio_grade: {
      id: string;
      name: string;
    } | null;
  } | null;
  assigned_studio: Database["public"]["Tables"]["studios"]["Row"] | null;
};

const fetchApplications = async (academicYearId?: string): Promise<AdminApplication[]> => {
  // First, get contract IDs for the academic year if filtering
  let contractIds: string[] | undefined;
  if (academicYearId) {
    const { data: contracts, error: contractsError } = await supabase
      .from("contracts")
      .select("id")
      .eq("academic_year_id", academicYearId);

    if (contractsError) {
      console.error("Failed to fetch contracts for academic year:", contractsError);
      throw contractsError;
    }

    contractIds = contracts?.map((c) => c.id) || [];
    if (contractIds.length === 0) {
      // No contracts for this academic year, return empty
      return [];
    }
  }

  // Build query
  let query = supabase
    .from("student_applications")
    .select(
      `
        *,
        contract:contracts!contract_id (
          id,
          name,
          weeks,
          student_application_id,
          academic_year_id,
          contract_start,
          contract_end,
          studio_grade:studio_grades ( id, name )
        ),
        assigned_studio:studios (*)
      `,
    );

  // Filter by contract IDs if academic year is specified
  if (contractIds && contractIds.length > 0) {
    query = query.in("contract_id", contractIds);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch applications:", error);
    throw error;
  }

  if (!data || data.length === 0) {
    if (import.meta.env.DEV) {
      console.info("No applications found");
    }
    return [];
  }

  // Fetch student profiles separately since there's no direct FK relationship
  const studentIds = [
    ...new Set(
      data.map((app) => app.student_id).filter((id): id is string => Boolean(id)),
    ),
  ];

  let profiles: any[] = [];
  if (studentIds.length > 0) {
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", studentIds);

    if (profilesError) {
      console.warn("Failed to fetch student profiles:", profilesError);
    }

    profiles = profilesData || [];
  }

  // Fetch emails from auth.users via Edge Function (respects RLS)
  const emailsMap = new Map<string, string>();
  if (studentIds.length > 0) {
    try {
      const { data: emailData, error: emailsError } = await supabase.functions.invoke("get-user-emails", {
        body: { userIds: studentIds },
      });

      if (!emailsError && emailData?.emails) {
        Object.entries(emailData.emails).forEach(([userId, email]) => {
          emailsMap.set(userId, email as string);
        });
      }
    } catch (error) {
      console.warn("Could not fetch user emails for admin applications:", error);
    }
  }

  // Try to get student names from step 1 if profile doesn't have them
  const applicationsWithoutNames = data.filter(
    (app) => !profiles?.find((p) => p.id === app.student_id && (p.first_name || p.last_name))
  );
  
  if (applicationsWithoutNames.length > 0) {
    const appIds = applicationsWithoutNames.map((app) => app.id);
    const { data: steps } = await supabase
      .from("student_application_steps")
      .select("application_id, payload")
      .eq("step_number", 1)
      .in("application_id", appIds);
    
    if (steps) {
      steps.forEach((step) => {
        const app = applicationsWithoutNames.find((a) => a.id === step.application_id);
        if (app) {
          const payload = step.payload as any;
          const profile = profiles?.find((p) => p.id === app.student_id);
          if (profile && !profile.first_name && !profile.last_name) {
            profile.first_name = payload.first_name || undefined;
            profile.last_name = payload.last_name || undefined;
          }
        }
      });
    }
  }

  const profilesMap = new Map(
    (profiles ?? []).map((p) => [
      p.id,
      {
        id: p.id,
        email: emailsMap.get(p.id) || "",
        first_name: p.first_name,
        last_name: p.last_name,
      },
    ]),
  );

  if (import.meta.env.DEV) {
    console.info("Fetched applications:", data.length, "applications");
  }

  const enriched = data.map((row) => ({
    ...row,
    student: profilesMap.get(row.student_id) ?? {
      id: row.student_id,
      email: emailsMap.get(row.student_id) || "",
      first_name: undefined,
      last_name: undefined,
    },
  }));

  return enriched as AdminApplication[];
};

export const useAdminApplications = (academicYearId?: string) =>
  useQuery({
    queryKey: ["admin-applications", academicYearId],
    queryFn: () => fetchApplications(academicYearId),
  });

export const useUpdateApplicationStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      status: ApplicationRow["status"];
      verified_by?: string | null;
      /** Staff override when advancing without a deposit; always audited. */
      allowWithoutDeposit?: boolean;
    }) => {
      const { id, status, allowWithoutDeposit, verified_by } = payload;
      
      // Get current application state and payment marker before changing status.
      const { data: currentApp } = await supabase
        .from("student_applications")
        .select("status, student_id, deposit_payment_intent_id, selected_payment_plan_id, contract:contracts!contract_id(contract_start), assigned_studio:studios(studio_number)")
        .eq("id", id)
        .single();

      const oldStatus = currentApp?.status;
      const nextStatus = status;

      // Guard rails: workflow status must align with real deposit records.
      // We intentionally do not auto-create or auto-delete financial records from status changes.
      const { data: manualDeposit } = await supabase
        .from("manual_payments")
        .select("id")
        .eq("application_id", id)
        .eq("payment_type", "deposit")
        .limit(1)
        .maybeSingle();

      const { data: stripeDeposit } = await supabase
        .from("stripe_payments")
        .select("id")
        .eq("student_application_id", id)
        .eq("payment_type", "deposit")
        .in("status", ["succeeded", "completed"])
        .limit(1)
        .maybeSingle();

      const depositRecorded = hasRecordedDeposit({
        depositPaymentIntentId: currentApp?.deposit_payment_intent_id,
        hasManualDepositRow: Boolean(manualDeposit?.id),
        hasStripeDepositRow: Boolean(stripeDeposit?.id),
      });

      // Block entering post-deposit statuses from draft/expired/awaiting_deposit/etc.
      // without a real payment marker. Moves within advanced statuses stay allowed
      // so legacy apps are not frozen mid-pipeline.
      if (
        isEnteringDepositRequiredStatus(oldStatus, nextStatus) &&
        !depositRecorded &&
        !allowWithoutDeposit
      ) {
        throw new Error(
          "Cannot advance past deposit: no deposit payment record exists yet. Record a deposit first (or force advance with audit)."
        );
      }

      if (nextStatus === "awaiting_deposit" && depositRecorded) {
        throw new Error(
          "This application already has a recorded deposit. Reverse/refund the deposit first, then move back to Awaiting Deposit."
        );
      }

      // Post-deposit statuses need a payment plan so finance totals stay correct.
      // Sync from step 5 if present; do not invent a plan. Block if still missing.
      if (isStatusRequiringDeposit(nextStatus)) {
        let planId = currentApp?.selected_payment_plan_id ?? null;
        if (!planId) {
          const syncResult = await syncPaymentPlanFromStep5(id);
          planId = syncResult.planId;
        }
        if (!planId) {
          throw new Error(
            "Cannot advance: no payment plan selected. Choose a plan on the application (or complete step 5 with a plan) first."
          );
        }
      }

      const { data, error } = await supabase
        .from("student_applications")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;

      // Log status change
      if (oldStatus !== status) {
        await logActivity({
          action: "update",
          entityType: "student_application",
          entityId: id,
          payload: {
            status_change: {
              from: oldStatus,
              to: status,
            },
            student_id: currentApp?.student_id,
            verified_by: verified_by || null,
            ...(allowWithoutDeposit
              ? {
                  force_advance_without_deposit: true,
                  deposit_payment_intent_id:
                    currentApp?.deposit_payment_intent_id ?? null,
                }
              : {}),
          },
        });
      }

      // Send confirmation email if status changed to confirmed
      if (status === "confirmed" && currentApp?.status !== "confirmed") {
        try {
          // Get student name from Step 1
          const { data: step1 } = await supabase
            .from("student_application_steps")
            .select("payload")
            .eq("application_id", id)
            .eq("step_number", 1)
            .single();

          const step1Data = step1?.payload as any;
          const studentName = step1Data?.first_name && step1Data?.last_name
            ? `${step1Data.first_name} ${step1Data.last_name}`
            : "Student";

          await supabase.functions.invoke("send-transactional-email", {
            body: {
              user_id: currentApp.student_id,
              email_type: "application_confirmed",
              variables: {
                student_name: studentName,
                studio_number: (currentApp.assigned_studio as any)?.studio_number || "TBA",
                contract_start: currentApp.contract?.contract_start || "TBA",
              },
            },
          });
        } catch (emailError) {
          console.error("Error sending confirmation email:", emailError);
          // Don't fail the status update if email fails
        }
      }

      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      if (variables?.id) {
        queryClient.invalidateQueries({ queryKey: ["student-application", variables.id] });
        queryClient.invalidateQueries({ queryKey: ["application-has-deposit", variables.id] });
        queryClient.invalidateQueries({ queryKey: ["payment-summary", variables.id] });
        queryClient.invalidateQueries({ queryKey: ["deposit-installment-breakdown"] });
        queryClient.invalidateQueries({ queryKey: ["early-check-in"] });
        queryClient.invalidateQueries({ queryKey: ["early-check-in-summary", variables.id] });
        queryClient.invalidateQueries({ queryKey: ["early-check-in-payments", variables.id] });
        queryClient.invalidateQueries({ queryKey: ["early-check-in-nightly-rate", variables.id] });
      }

      // Application status transitions affect accounting views (AR/outstanding/paid-in-full/upcoming).
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable-report"] });
      queryClient.invalidateQueries({ queryKey: ["outstanding-balances-report"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-paid-installments-report"] });
      queryClient.invalidateQueries({ queryKey: ["fully-paid-students-report"] });
      queryClient.invalidateQueries({ queryKey: ["revenue-summary"] });
    },
  });
};

