import { useState, useEffect, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { useCreateManualPayment, useLinkManualPaymentById } from "@/hooks/useManualPayment";
import { useToast } from "@/hooks/use-toast";
import { useInstallmentBreakdown, usePaymentSummary, useUnifiedPayments } from "@/hooks/useUnifiedPayments";
import { getEffectiveWeeks } from "@/utils/contractDuration";
import { Loader2, Search, CheckCircle2, XCircle, Pencil, DoorOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";

type PendingRequestRow = {
  id: string;
  application_id: string;
  instalment_id: string;
  amount: number;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  submitted_at: string;
  student_name?: string | null;
  student_email?: string | null;
  contract_name?: string | null;
  student_applications?: { student_id: string; contract?: { name: string } | null } | null;
};

type ResolvedRequestRow = {
  id: string;
  application_id: string;
  amount: number;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  status: "approved" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  student_name?: string | null;
  student_email?: string | null;
  contract_name?: string | null;
};

type ApplicationLookupRow = {
  id: string;
  student_id: string | null;
  contract: { name: string | null } | null;
};

const enrichRequestsWithStudentInfo = async <T extends { application_id: string }>(
  requests: T[],
): Promise<(T & { student_name: string | null; student_email: string | null; contract_name: string | null })[]> => {
  if (!requests.length) return [];

  const applicationIds = [...new Set(requests.map((r) => r.application_id).filter(Boolean))] as string[];
  if (!applicationIds.length) {
    return requests.map((r) => ({ ...r, student_name: null, student_email: null, contract_name: null }));
  }

  const { data: applicationsData, error: appsError } = await supabase
    .from("student_applications")
    .select(
      `
        id,
        student_id,
        contract:contracts!contract_id (
          name
        )
      `,
    )
    .in("id", applicationIds);
  if (appsError) {
    return requests.map((r) => ({ ...r, student_name: null, student_email: null, contract_name: null }));
  }

  const apps = (applicationsData ?? []) as ApplicationLookupRow[];
  const appById = new Map(apps.map((a) => [a.id, a]));

  const studentIds = [...new Set(apps.map((a) => a.student_id).filter(Boolean))] as string[];

  const profilesMap = new Map<string, { first_name: string | null; last_name: string | null }>();
  if (studentIds.length) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", studentIds);
    (profilesData ?? []).forEach((p) => {
      profilesMap.set(String((p as any).id), {
        first_name: (p as any).first_name ?? null,
        last_name: (p as any).last_name ?? null,
      });
    });
  }

  const emailsMap = new Map<string, string>();
  if (studentIds.length) {
    try {
      const { data: emailData, error: emailsError } = await supabase.functions.invoke("get-user-emails", {
        body: { userIds: studentIds },
      });
      if (!emailsError && emailData?.emails && typeof emailData.emails === "object") {
        Object.entries(emailData.emails).forEach(([userId, email]) => {
          emailsMap.set(userId, String(email ?? ""));
        });
      }
    } catch {
      // ignore
    }
  }

  return requests.map((r) => {
    const app = appById.get(r.application_id);
    const studentId = app?.student_id ?? null;
    const profile = studentId ? profilesMap.get(studentId) : undefined;
    const fullName =
      profile?.first_name || profile?.last_name
        ? `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()
        : "";

    const email = studentId ? (emailsMap.get(studentId) ?? "") : "";
    const student_name = fullName || (email ? email.split("@")[0] : "") || null;
    const student_email = email || null;
    const contract_name = app?.contract?.name ?? null;

    return { ...r, student_name, student_email, contract_name };
  });
};

const panelCardClass = "rounded-3xl border border-border/60 !shadow-none";
const tabTriggerClass =
  "group rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none";

const ManualPaymentEntry = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createPayment = useCreateManualPayment();
  const [activeTab, setActiveTab] = useState("record");
  const [searchTerm, setSearchTerm] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectRequestId, setRejectRequestId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [paymentToDelete, setPaymentToDelete] = useState<{ id: string } | null>(null);

  // Form state
  const [paymentType, setPaymentType] = useState<"deposit" | "instalment">("deposit");
  const [amount, setAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bank_transfer" | "cheque">("cash");
  const [receiptNumber, setReceiptNumber] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState<string>("");
  // Optional link to application + instalment (when recording for a specific application)
  const [linkApplicationId, setLinkApplicationId] = useState<string>("");
  const [linkInstalmentId, setLinkInstalmentId] = useState<string>("");

  // Edit state for unlinked (orphaned) payments
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  const [editAmount, setEditAmount] = useState<string>("");
  const [editPaymentMethod, setEditPaymentMethod] = useState<"cash" | "card" | "bank_transfer" | "cheque">("cash");
  const [editReceiptNumber, setEditReceiptNumber] = useState<string>("");
  const [editPaymentDate, setEditPaymentDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [editNotes, setEditNotes] = useState<string>("");

  // Link-to-application dialog state (for existing unlinked payments)
  const [linkingPayment, setLinkingPayment] = useState<any | null>(null);
  const [linkDialogApplicationId, setLinkDialogApplicationId] = useState<string>("");
  const [linkDialogInstalmentId, setLinkDialogInstalmentId] = useState<string>("");
  const [linkDialogAppSearch, setLinkDialogAppSearch] = useState("");
  const [linkDialogAppOpen, setLinkDialogAppOpen] = useState(false);
  const [linkAppDropdownOpen, setLinkAppDropdownOpen] = useState(false);

  // Pending student manual payment requests (approve → create manual_payment)
  const { data: pendingRequests, isLoading: pendingLoading, refetch: refetchPending } = useQuery({
    queryKey: ["manual-payment-requests-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manual_payment_requests")
        .select("id, application_id, instalment_id, amount, payment_method, reference, notes, submitted_at")
        .eq("status", "pending")
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      const base = (data ?? []) as PendingRequestRow[];
      return await enrichRequestsWithStudentInfo(base);
    },
  });

  // Previously approved / rejected requests (so they don't just disappear)
  const { data: resolvedRequests, isLoading: resolvedLoading } = useQuery({
    queryKey: ["manual-payment-requests-resolved"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manual_payment_requests")
        .select("id, application_id, amount, payment_method, reference, notes, status, submitted_at, reviewed_at, rejection_reason")
        .in("status", ["approved", "rejected"])
        .order("reviewed_at", { ascending: false });
      if (error) throw error;
      const base = (data ?? []) as ResolvedRequestRow[];
      return await enrichRequestsWithStudentInfo(base);
    },
  });

  const approveRequest = useMutation({
    mutationFn: async (req: PendingRequestRow) => {
      const { data: { user } } = await supabase.auth.getUser();
      const receiptNumber = `REQ-${req.id}`;
      // manual_payments.instalment_id must reference contract_payment_schedule; student may have sent payment_plan_installments.id
      const { data: scheduleRow } = await supabase
        .from("contract_payment_schedule")
        .select("id")
        .eq("id", req.instalment_id)
        .maybeSingle();
      const instalmentIdForManual = scheduleRow?.id ?? null;
      const { data: inserted, error: insertErr } = await supabase
        .from("manual_payments")
        .insert({
          application_id: req.application_id,
          payment_type: "instalment",
          instalment_id: instalmentIdForManual,
          amount: req.amount,
          payment_method: req.payment_method,
          receipt_number: receiptNumber,
          payment_date: new Date().toISOString().split("T")[0],
          recorded_by: user?.id ?? null,
          notes: req.notes,
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;
      const { error: updateErr } = await supabase
        .from("manual_payment_requests")
        .update({ status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
        .eq("id", req.id);
      if (updateErr) throw updateErr;
      return inserted;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manual-payment-requests-pending"] });
      queryClient.invalidateQueries({ queryKey: ["manual-payment-requests"] });
      queryClient.invalidateQueries({ queryKey: ["manual-payment-requests-resolved"] });
      queryClient.invalidateQueries({ queryKey: ["unified-payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment-summary"] });
      refetchPending();
      setApprovingId(null);
      toast({ title: "Approved", description: "Payment recorded. Student will see the instalment as paid." });
    },
    onError: (err) => {
      setApprovingId(null);
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to approve.", variant: "destructive" });
    },
  });

  const rejectRequest = useMutation({
    mutationFn: async ({ requestId, rejectionReason }: { requestId: string; rejectionReason?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("manual_payment_requests")
        .update({
          status: "rejected",
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectionReason?.trim() || null,
        })
        .eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manual-payment-requests-pending"] });
      queryClient.invalidateQueries({ queryKey: ["manual-payment-requests"] });
      queryClient.invalidateQueries({ queryKey: ["manual-payment-requests-resolved"] });
      queryClient.invalidateQueries({ queryKey: ["manual-payment-request-history"] });
      refetchPending();
      setRejectingId(null);
      setRejectDialogOpen(false);
      setRejectRequestId(null);
      setRejectReason("");
      toast({ title: "Rejected", description: "Request declined. Student will see the rejection and reason if provided." });
    },
    onError: (err) => {
      setRejectingId(null);
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to reject.", variant: "destructive" });
    },
  });

  // Applications list for "link to application" (record form and link-dialog) – with student name/email for search
  const { data: applicationsForLink } = useQuery({
    queryKey: ["applications-for-manual-payment-link"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_applications_for_payment_link");
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        student_name: string | null;
        student_email: string | null;
        contract_slug: string | null;
        academic_year_name: string | null;
      };
    },
    enabled: activeTab === "record" || !!linkingPayment,
  });

  // Instalments for selected application (when linking and type is instalment). Use plan-based list when app has selected_plan_id so amounts/count match Application Detail and Record Manual Payment dialog.
  type LinkInstalment = { id: string; due_date: string; amount: number; sequence: number; instalment_number: number };
  const { data: linkInstalments } = useQuery({
    queryKey: ["application-instalments", linkApplicationId],
    queryFn: async (): Promise<LinkInstalment[]> => {
      if (!linkApplicationId) return [];
      const { data: app, error: appError } = await supabase
        .from("student_applications")
        .select("contract_id, selected_payment_plan_id")
        .eq("id", linkApplicationId)
        .single();
      if (appError || !app?.contract_id) return [];

      const roundCurrency = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

      if (app.selected_payment_plan_id) {
        const { data: contract, error: contractError } = await supabase
          .from("contracts")
          .select("id, contract_start, weeks, extra_days, weekly_price_override, deposit_override, academic_year_id, studio_grade_id")
          .eq("id", app.contract_id)
          .maybeSingle();
        if (contractError || !contract) return [];
        const { data: priceData } = await supabase
          .from("studio_grade_prices")
          .select("weekly_price")
          .eq("academic_year_id", contract.academic_year_id)
          .eq("studio_grade_id", contract.studio_grade_id)
          .eq("is_active", true)
          .maybeSingle();
        const weeklyPrice = contract.weekly_price_override ?? priceData?.weekly_price ?? 0;
        const installmentBase = weeklyPrice * getEffectiveWeeks(contract);
        const { data: allPlanRows, error: planErr } = await supabase
          .from("payment_plan_installments")
          .select("*")
          .eq("payment_plan_id", app.selected_payment_plan_id)
          .order("sequence", { ascending: true });
        if (planErr || !allPlanRows?.length) return [];
        const planInstalments = allPlanRows.filter((r) => !(r.label ?? "").toLowerCase().includes("deposit"));
        if (planInstalments.length === 0) return [];
        const planSchedule = planInstalments.map((inst) => {
          let amt = 0;
          if (inst.amount_type === "percentage") amt = roundCurrency((installmentBase * Number(inst.amount_value)) / 100);
          else if (inst.amount_type === "fixed") amt = Number(inst.amount_value);
          let dueDate: string;
          if (inst.due_date) dueDate = new Date(inst.due_date).toISOString().split("T")[0];
          else if (inst.due_date_offset_days != null) {
            const d = new Date(contract.contract_start);
            d.setDate(d.getDate() + inst.due_date_offset_days);
            dueDate = d.toISOString().split("T")[0];
          } else dueDate = contract.contract_start;
          return { amount: amt, due_date: dueDate, sequence: inst.sequence };
        });
        if (planSchedule.length > 0) {
          const lastIdx = planSchedule.length - 1;
          const sumPrev = planSchedule.slice(0, lastIdx).reduce((s, i) => s + i.amount, 0);
          planSchedule[lastIdx].amount = roundCurrency(installmentBase - sumPrev);
        }
        const { data: scheduleRows, error: schedErr } = await supabase
          .from("contract_payment_schedule")
          .select("id, sequence, label")
          .eq("contract_id", app.contract_id)
          .order("sequence", { ascending: true });
        if (schedErr) return [];
        const nonDepositRows = (scheduleRows ?? []).filter(
          (row) => !String((row as { label?: string }).label ?? "").toLowerCase().includes("deposit")
        );
        const firstN = nonDepositRows.slice(0, planSchedule.length);
        return firstN.map((row, i) => ({
          id: row.id,
          due_date: planSchedule[i].due_date,
          amount: planSchedule[i].amount,
          sequence: row.sequence,
          instalment_number: i + 1,
        }));
      }

      const { data, error } = await supabase
        .from("contract_payment_schedule")
        .select("id, due_date, amount, sequence")
        .eq("contract_id", app.contract_id)
        .order("sequence", { ascending: true });
      if (error) throw error;
      return (data || []).map((row) => ({
        id: row.id,
        due_date: row.due_date ?? "",
        amount: Number(row.amount) || 0,
        sequence: row.sequence ?? 0,
        instalment_number: row.sequence ?? 0,
      }));
    },
    enabled: activeTab === "record" && !!linkApplicationId && paymentType === "instalment",
  });
  const { data: linkPaymentSummary } = usePaymentSummary(linkApplicationId || null);
  const linkPaymentCount = Number(linkPaymentSummary?.payment_count ?? 0);
  const { data: linkAppPayments } = useUnifiedPayments(linkApplicationId || "");
  const paidSequencesForLink = useMemo(
    () =>
      new Set(
        (linkAppPayments ?? [])
          .filter((p) => p.installment_number != null)
          .map((p) => p.installment_number as number)
      ),
    [linkAppPayments]
  );
  const usedPlanBasedForLink = useMemo(
    () =>
      (linkInstalments ?? []).length > 0 &&
      (linkInstalments ?? []).every((r, i) => r.instalment_number === i + 1),
    [linkInstalments]
  );
  const { data: linkInstallmentBreakdown } = useInstallmentBreakdown(linkApplicationId || null);
  const unpaidInstalmentsForLink = useMemo(() => {
    const list = linkInstalments ?? [];
    if (!list.length) return [];
    // Prefer precise per-instalment breakdown when available: exclude only fully paid instalments.
    // Overlay remaining_amount so dropdown labels match autofill / waterfall (includes discount).
    if (linkInstallmentBreakdown && linkInstallmentBreakdown.length > 0) {
      const byId = new Map(linkInstallmentBreakdown.map((b) => [b.installment_id, b]));
      return list
        .filter((inst) => {
          const b = byId.get(inst.id);
          return !b || b.payment_status !== "paid";
        })
        .map((inst) => {
          const b = byId.get(inst.id);
          if (!b) return inst;
          const displayAmount =
            b.remaining_amount > 0 ? Number(b.remaining_amount) : Number(b.amount_due);
          return { ...inst, amount: displayAmount };
        });
    }
    // Fallback to existing behaviour when breakdown is not available.
    if (usedPlanBasedForLink) return list.filter((_, index) => index >= linkPaymentCount);
    return list.filter((inst) => !paidSequencesForLink.has(inst.sequence));
  }, [linkInstalments, paidSequencesForLink, linkPaymentCount, usedPlanBasedForLink, linkInstallmentBreakdown]);

  // Instalments for link-dialog (when linking an existing unlinked payment to an application)
  const { data: linkDialogInstalments } = useQuery({
    queryKey: ["application-instalments-link-dialog", linkDialogApplicationId],
    queryFn: async (): Promise<LinkInstalment[]> => {
      const appId = linkDialogApplicationId;
      if (!appId) return [];
      const { data: app, error: appError } = await supabase
        .from("student_applications")
        .select("contract_id, selected_payment_plan_id")
        .eq("id", appId)
        .single();
      if (appError || !app?.contract_id) return [];
      const roundCurrency = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
      if (app.selected_payment_plan_id) {
        const { data: contract, error: contractError } = await supabase
          .from("contracts")
          .select("id, contract_start, weeks, extra_days, weekly_price_override, deposit_override, academic_year_id, studio_grade_id")
          .eq("id", app.contract_id)
          .maybeSingle();
        if (contractError || !contract) return [];
        const { data: priceData } = await supabase
          .from("studio_grade_prices")
          .select("weekly_price")
          .eq("academic_year_id", contract.academic_year_id)
          .eq("studio_grade_id", contract.studio_grade_id)
          .eq("is_active", true)
          .maybeSingle();
        const weeklyPrice = contract.weekly_price_override ?? priceData?.weekly_price ?? 0;
        const installmentBase = weeklyPrice * getEffectiveWeeks(contract);
        const { data: allPlanRows, error: planErr } = await supabase
          .from("payment_plan_installments")
          .select("*")
          .eq("payment_plan_id", app.selected_payment_plan_id)
          .order("sequence", { ascending: true });
        if (planErr || !allPlanRows?.length) return [];
        const planInstalments = allPlanRows.filter((r) => !(r.label ?? "").toLowerCase().includes("deposit"));
        if (planInstalments.length === 0) return [];
        const planSchedule = planInstalments.map((inst) => {
          let amt = 0;
          if (inst.amount_type === "percentage") amt = roundCurrency((installmentBase * Number(inst.amount_value)) / 100);
          else if (inst.amount_type === "fixed") amt = Number(inst.amount_value);
          let dueDate: string;
          if (inst.due_date) dueDate = new Date(inst.due_date).toISOString().split("T")[0];
          else if (inst.due_date_offset_days != null) {
            const d = new Date(contract.contract_start);
            d.setDate(d.getDate() + inst.due_date_offset_days);
            dueDate = d.toISOString().split("T")[0];
          } else dueDate = contract.contract_start;
          return { amount: amt, due_date: dueDate, sequence: inst.sequence };
        });
        if (planSchedule.length > 0) {
          const lastIdx = planSchedule.length - 1;
          const sumPrev = planSchedule.slice(0, lastIdx).reduce((s, i) => s + i.amount, 0);
          planSchedule[lastIdx].amount = roundCurrency(installmentBase - sumPrev);
        }
        const { data: scheduleRows, error: schedErr } = await supabase
          .from("contract_payment_schedule")
          .select("id, sequence, label")
          .eq("contract_id", app.contract_id)
          .order("sequence", { ascending: true });
        if (schedErr) return [];
        const nonDepositRows = (scheduleRows ?? []).filter(
          (row) => !String((row as { label?: string }).label ?? "").toLowerCase().includes("deposit")
        );
        const firstN = nonDepositRows.slice(0, planSchedule.length);
        return firstN.map((row, i) => ({
          id: row.id,
          due_date: planSchedule[i].due_date,
          amount: planSchedule[i].amount,
          sequence: row.sequence,
          instalment_number: i + 1,
        }));
      }
      const { data, error } = await supabase
        .from("contract_payment_schedule")
        .select("id, due_date, amount, sequence")
        .eq("contract_id", app.contract_id)
        .order("sequence", { ascending: true });
      if (error) throw error;
      return (data || []).map((row) => ({
        id: row.id,
        due_date: row.due_date ?? "",
        amount: Number(row.amount) || 0,
        sequence: row.sequence ?? 0,
        instalment_number: row.sequence ?? 0,
      }));
    },
    enabled: !!linkingPayment && !!linkDialogApplicationId && linkingPayment?.payment_type === "instalment",
  });
  const { data: linkDialogPaymentSummary } = usePaymentSummary(linkDialogApplicationId || null);
  const linkDialogPaymentCount = Number(linkDialogPaymentSummary?.payment_count ?? 0);
  const { data: linkDialogPayments } = useUnifiedPayments(linkDialogApplicationId || "");
  const linkDialogPaidSequences = useMemo(
    () =>
      new Set(
        (linkDialogPayments ?? [])
          .filter((p) => p.installment_number != null)
          .map((p) => p.installment_number as number)
      ),
    [linkDialogPayments]
  );
  const linkDialogUsedPlanBased = useMemo(
    () =>
      (linkDialogInstalments ?? []).length > 0 &&
      (linkDialogInstalments ?? []).every((r, i) => r.instalment_number === i + 1),
    [linkDialogInstalments]
  );
  const { data: linkDialogInstallmentBreakdown } = useInstallmentBreakdown(linkDialogApplicationId || null);
  const unpaidInstalmentsForLinkDialog = useMemo(() => {
    const list = linkDialogInstalments ?? [];
    if (!list.length) return [];
    // Prefer precise per-instalment breakdown when available.
    // Overlay remaining_amount so dropdown labels match autofill / waterfall (includes discount).
    if (linkDialogInstallmentBreakdown && linkDialogInstallmentBreakdown.length > 0) {
      const byId = new Map(linkDialogInstallmentBreakdown.map((b) => [b.installment_id, b]));
      return list
        .filter((inst) => {
          const b = byId.get(inst.id);
          return !b || b.payment_status !== "paid";
        })
        .map((inst) => {
          const b = byId.get(inst.id);
          if (!b) return inst;
          const displayAmount =
            b.remaining_amount > 0 ? Number(b.remaining_amount) : Number(b.amount_due);
          return { ...inst, amount: displayAmount };
        });
    }
    // Fallback to previous logic when breakdown is missing.
    if (linkDialogUsedPlanBased) return list.filter((_, index) => index >= linkDialogPaymentCount);
    return list.filter((inst) => !linkDialogPaidSequences.has(inst.sequence));
  }, [linkDialogInstalments, linkDialogPaidSequences, linkDialogPaymentCount, linkDialogUsedPlanBased, linkDialogInstallmentBreakdown]);

  // Auto-fill amount when linking to an instalment
  useEffect(() => {
    if (paymentType === "instalment" && linkInstalmentId && unpaidInstalmentsForLink.length > 0) {
      const breakdown = linkInstallmentBreakdown?.find(
        (b) => b.installment_id === linkInstalmentId
      );
      if (breakdown && breakdown.remaining_amount > 0) {
        setAmount(String(breakdown.remaining_amount));
        return;
      }
      const inst = unpaidInstalmentsForLink.find((i) => i.id === linkInstalmentId);
      if (inst) setAmount(String(inst.amount));
    }
  }, [paymentType, linkInstalmentId, unpaidInstalmentsForLink, linkInstallmentBreakdown]);

  // Fetch orphaned payments (no application_id)
  const { data: orphanedPayments, isLoading, refetch } = useQuery({
    queryKey: ["orphaned-payments", searchTerm],
    queryFn: async () => {
      let query = supabase
        .from("manual_payments")
        .select("*")
        .is("application_id", null)
        .order("created_at", { ascending: false });

      if (searchTerm.trim()) {
        query = query.or(`receipt_number.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    },
  });

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid payment amount.",
        variant: "destructive",
      });
      return;
    }

    const linkingToApplication = !!linkApplicationId.trim();
    if (!linkingToApplication && !receiptNumber.trim()) {
      toast({
        title: "Receipt number required",
        description: "Receipt number is required when not linking to an application.",
        variant: "destructive",
      });
      return;
    }

    if (linkingToApplication && paymentType === "instalment" && !linkInstalmentId) {
      toast({
        title: "Instalment required",
        description: "Select an instalment when linking an instalment payment to an application.",
        variant: "destructive",
      });
      return;
    }

    const parsedAmount = parseFloat(amount);

    try {
      // When linking to an application instalment and we have a breakdown, mirror the
      // Application Detail dialog behaviour: allow one payment to top up the selected
      // instalment and then spill into later instalments (by sequence).
      if (
        linkingToApplication &&
        paymentType === "instalment" &&
        linkInstalmentId &&
        linkInstallmentBreakdown &&
        linkInstallmentBreakdown.length > 0
      ) {
        const ordered = [...linkInstallmentBreakdown].sort(
          (a, b) => a.sequence - b.sequence,
        );
        const startIdx = ordered.findIndex(
          (b) => b.installment_id === linkInstalmentId,
        );

        if (startIdx !== -1) {
          const targetSlice = ordered
            .slice(startIdx)
            .filter(
              (b) => b.payment_status !== "paid" && b.remaining_amount > 0,
            );

          const totalRemainingFromStart = targetSlice.reduce(
            (sum, row) => sum + Number(row.remaining_amount ?? 0),
            0,
          );

          if (parsedAmount > totalRemainingFromStart + 0.01) {
            toast({
              title: "Amount too high",
              description: `Total remaining from this instalment onwards is £${totalRemainingFromStart.toFixed(
                2,
              )}. Please enter an amount up to that total.`,
              variant: "destructive",
            });
            return;
          }

          const first = targetSlice[0];
          if (parsedAmount <= Number(first.remaining_amount) + 0.01) {
            // Single-instalment payment (partial or full)
            await createPayment.mutateAsync({
              applicationId: linkApplicationId,
              paymentType: "instalment",
              instalmentId: first.installment_id,
              amount: parsedAmount,
              paymentMethod,
              receiptNumber: receiptNumber.trim() || undefined,
              paymentDate,
              notes: notes.trim() || undefined,
            });
          } else {
            // Waterfall across multiple instalments. Only the first allocation carries
            // the receipt number to respect the unique constraint; subsequent allocations
            // omit it while still updating balances correctly.
            let remainingToAllocate = parsedAmount;
            let isFirstAllocation = true;

            for (const row of targetSlice) {
              if (remainingToAllocate <= 0.01) break;
              const remainingForRow = Number(row.remaining_amount ?? 0);
              if (remainingForRow <= 0.01) continue;

              const allocate = Math.min(remainingForRow, remainingToAllocate);
              await createPayment.mutateAsync({
                applicationId: linkApplicationId,
                paymentType: "instalment",
                instalmentId: row.installment_id,
                amount: allocate,
                paymentMethod,
                receiptNumber: isFirstAllocation ? receiptNumber.trim() || undefined : undefined,
                paymentDate,
                notes: notes.trim() || undefined,
              });
              remainingToAllocate -= allocate;
              isFirstAllocation = false;
            }
          }
        } else {
          // Fallback: selected instalment not in breakdown; record a single payment.
          await createPayment.mutateAsync({
            applicationId: linkApplicationId,
            paymentType: "instalment",
            instalmentId: linkInstalmentId,
            amount: parsedAmount,
            paymentMethod,
            receiptNumber: receiptNumber.trim() || undefined,
            paymentDate,
            notes: notes.trim() || undefined,
          });
        }
      } else {
        // Deposit, unlinked payments, or no breakdown available: single payment.
        await createPayment.mutateAsync({
          applicationId: linkingToApplication ? linkApplicationId : undefined,
          paymentType,
          instalmentId:
            paymentType === "instalment" && linkInstalmentId
              ? linkInstalmentId
              : undefined,
          amount: parsedAmount,
          paymentMethod,
          receiptNumber: receiptNumber.trim() || undefined,
          paymentDate,
          notes: notes.trim() || undefined,
        });
      }

      toast({
        title: "Payment recorded",
        description: `Successfully recorded ${paymentType} payment of £${amount}${
          receiptNumber.trim() ? ` with receipt number ${receiptNumber.trim()}` : ""
        }.`,
      });

      // Reset form
      setAmount("");
      setReceiptNumber("");
      setNotes("");
      setLinkApplicationId("");
      setLinkInstalmentId("");
      await refetch();
    } catch (error: any) {
      console.error("Failed to record payment:", error);
      
      // Check if it's a unique constraint violation
      if (error?.code === "23505" || error?.message?.includes("unique")) {
        toast({
          title: "Duplicate receipt number",
          description: "A payment with this receipt number already exists. Please use a different receipt number.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error?.message || "Failed to record payment. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      cash: "Cash",
      card: "Card",
      bank_transfer: "Bank Transfer",
      cheque: "Cheque",
    };
    return labels[method] || method;
  };

  // Populate edit fields when a payment is selected for editing
  useEffect(() => {
    if (!editingPayment) return;
    setEditAmount(String(editingPayment.amount ?? ""));
    setEditPaymentMethod(
      (editingPayment.payment_method as "cash" | "card" | "bank_transfer" | "cheque") ?? "cash",
    );
    setEditReceiptNumber(editingPayment.receipt_number ?? "");
    setEditPaymentDate(
      editingPayment.payment_date ?? new Date().toISOString().split("T")[0],
    );
    setEditNotes(editingPayment.notes ?? "");
  }, [editingPayment]);

  const updateOrphanedPayment = useMutation({
    mutationFn: async ({
      id,
      amount,
      paymentMethod,
      receiptNumber,
      paymentDate,
      notes,
    }: {
      id: string;
      amount: number;
      paymentMethod: "cash" | "card" | "bank_transfer" | "cheque";
      receiptNumber: string;
      paymentDate: string;
      notes?: string;
    }) => {
      const { error } = await supabase
        .from("manual_payments")
        .update({
          amount,
          payment_method: paymentMethod,
          receipt_number: receiptNumber || null,
          payment_date: paymentDate,
          notes: notes || null,
        })
        .eq("id", id)
        .is("application_id", null);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orphaned-payments"] });
      setEditingPayment(null);
      toast({
        title: "Payment updated",
        description: "The unlinked payment has been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update payment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const linkPaymentById = useLinkManualPaymentById();

  const deleteOrphanedPayment = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase
        .from("manual_payments")
        .delete()
        .eq("id", paymentId)
        .is("application_id", null);

      if (error) throw error;
    },
    onSuccess: () => {
      setPaymentToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["orphaned-payments"] });
      toast({
        title: "Payment deleted",
        description: "The unlinked payment has been removed.",
      });
    },
    onError: (error) => {
      setPaymentToDelete(null);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to delete payment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const pendingCount = pendingRequests?.length ?? 0;
  const unlinkedCount = orphanedPayments?.length ?? 0;

  const resetRecordForm = () => {
    setAmount("");
    setReceiptNumber("");
    setNotes("");
    setLinkApplicationId("");
    setLinkInstalmentId("");
  };

  return (
    <AdminLayout
      pageTitle="Manual Payment Entry"
      subtitle="Record payments made outside the system. Approve student payment requests or record unlinked payments."
    >
      <div className="flex flex-col gap-6">
        <Alert className="rounded-2xl border-amber-200 bg-amber-50 text-amber-950">
          <DoorOpen className="h-4 w-4" />
          <AlertTitle className="text-sm font-medium">Early check-in payments</AlertTitle>
          <AlertDescription className="text-sm text-amber-900/80">
            Deposit and instalment payments are recorded here. For early check-in charges, use{" "}
            <Link
              to="/admin/early-check-in-payments"
              className="font-medium underline underline-offset-2 hover:text-amber-950"
            >
              Early Check-in Payments
            </Link>{" "}
            or the Early check-in section on an application.
          </AlertDescription>
        </Alert>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 rounded-md bg-muted border border-border p-1 h-auto">
            <TabsTrigger value="record" className={tabTriggerClass}>
              Record payment
            </TabsTrigger>
            <TabsTrigger value="pending" className={tabTriggerClass}>
              Pending
              {pendingCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-2 text-xs group-data-[state=active]:bg-primary-foreground/20 group-data-[state=active]:text-primary-foreground group-data-[state=active]:border-primary-foreground/30"
                >
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className={tabTriggerClass}>
              History
            </TabsTrigger>
            <TabsTrigger value="unlinked" className={tabTriggerClass}>
              Unlinked
              {unlinkedCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-2 text-xs group-data-[state=active]:bg-primary-foreground/20 group-data-[state=active]:text-primary-foreground group-data-[state=active]:border-primary-foreground/30"
                >
                  {unlinkedCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

        <TabsContent value="pending" className="mt-4">
        <Card className={panelCardClass}>
          <CardHeader>
            <CardTitle
              className="text-lg font-display uppercase tracking-wide"
              tooltip="Students who said they paid by bank transfer or other. Approve to record the payment and mark the instalment as paid in the portal."
              tooltipLabel="About Pending student requests"
            >
              Pending student requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingLoading ? (
              <div className="py-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">Loading...</p>
              </div>
            ) : pendingRequests && pendingRequests.length > 0 ? (
              <div className="space-y-4">
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="rounded-2xl border border-border/60 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-foreground">
                          {req.student_name?.trim() || "Unknown student"}
                        </span>
                        {req.student_email && (
                          <span className="text-xs text-muted-foreground truncate max-w-[220px]">
                            {req.student_email}
                          </span>
                        )}
                        {req.contract_name && (
                          <span className="text-xs text-muted-foreground truncate max-w-[260px]">
                            • {req.contract_name}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{formatCurrency(Number(req.amount))}</span>
                        <Badge variant="outline" className="text-xs">
                          {getPaymentMethodLabel(req.payment_method)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Application #{req.application_id?.slice(0, 8)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span>Submitted {format(new Date(req.submitted_at), "d MMM yyyy, HH:mm")}</span>
                        {req.reference && <span>Ref: {req.reference}</span>}
                      </div>
                      {req.notes && (
                        <p className="text-xs text-muted-foreground italic">{req.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="rounded-md"
                        disabled={approvingId === req.id || rejectingId === req.id}
                        onClick={() => {
                          setApprovingId(req.id);
                          approveRequest.mutate(req);
                        }}
                      >
                        {approvingId === req.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Approve
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-md"
                        disabled={approvingId === req.id || rejectingId === req.id}
                        onClick={() => {
                          setRejectRequestId(req.id);
                          setRejectReason("");
                          setRejectDialogOpen(true);
                        }}
                      >
                        {rejectingId === req.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 mr-1" />
                            Reject
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No pending student requests.
              </div>
            )}
          </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
        <Card className={panelCardClass}>
          <CardHeader>
            <CardTitle
              className="text-lg font-display uppercase tracking-wide"
              tooltip="Recent student payment requests you approved or rejected. Sorted by review date."
              tooltipLabel="About Previously approved / rejected"
            >
              Previously approved / rejected
            </CardTitle>
          </CardHeader>
          <CardContent>
            {resolvedLoading ? (
              <div className="py-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">Loading...</p>
              </div>
            ) : resolvedRequests && resolvedRequests.length > 0 ? (
              <div className="space-y-4">
                {resolvedRequests.map((req) => (
                  <div
                    key={req.id}
                    className="rounded-2xl border border-border/60 px-4 py-3 flex flex-col gap-2"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-foreground">
                        {req.student_name?.trim() || "Unknown student"}
                      </span>
                      {req.student_email && (
                        <span className="text-xs text-muted-foreground truncate max-w-[220px]">
                          {req.student_email}
                        </span>
                      )}
                      {req.contract_name && (
                        <span className="text-xs text-muted-foreground truncate max-w-[260px]">
                          • {req.contract_name}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        • Application #{req.application_id?.slice(0, 8)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{formatCurrency(Number(req.amount))}</span>
                      <Badge variant="outline" className="text-xs">
                        {getPaymentMethodLabel(req.payment_method)}
                      </Badge>
                      {req.status === "approved" && (
                        <Badge className="bg-green-600 text-white text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Approved
                        </Badge>
                      )}
                      {req.status === "rejected" && (
                        <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 text-xs">
                          <XCircle className="h-3 w-3 mr-1" />
                          Rejected
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span>Submitted {format(new Date(req.submitted_at), "d MMM yyyy, HH:mm")}</span>
                      {req.reviewed_at && (
                        <span>
                          {req.status === "approved" ? "Approved" : "Rejected"}{" "}
                          {format(new Date(req.reviewed_at), "d MMM yyyy, HH:mm")}
                        </span>
                      )}
                      {req.reference && <span>Ref: {req.reference}</span>}
                    </div>
                    {req.status === "rejected" && req.rejection_reason && (
                      <p className="text-sm text-muted-foreground italic border-l-2 border-red-200 dark:border-red-800 pl-3">
                        {req.rejection_reason}
                      </p>
                    )}
                    {req.notes && (
                      <p className="text-xs text-muted-foreground italic">{req.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No approved or rejected requests yet.
              </div>
            )}
          </CardContent>
        </Card>
        </TabsContent>

        {/* Reject request dialog – optional reason shown to student */}
        <Dialog open={rejectDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setRejectDialogOpen(false);
            setRejectRequestId(null);
            setRejectReason("");
          }
        }}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>Reject payment request?</DialogTitle>
              <DialogDescription>
                The student will see that their request was declined. You can add a reason below (e.g. wrong amount, proof needed) so they know what to correct.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="reject-reason">Reason (optional)</Label>
              <Textarea
                id="reject-reason"
                placeholder="e.g. Please resubmit with proof of payment or correct amount."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="resize-none rounded-xl"
              />
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <Button
                variant="outline"
                className="rounded-md"
                onClick={() => {
                  setRejectDialogOpen(false);
                  setRejectRequestId(null);
                  setRejectReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="rounded-md"
                disabled={!rejectRequestId || rejectingId === rejectRequestId}
                onClick={() => {
                  if (!rejectRequestId) return;
                  setRejectingId(rejectRequestId);
                  rejectRequest.mutate({ requestId: rejectRequestId, rejectionReason: rejectReason || undefined });
                }}
              >
                {rejectingId === rejectRequestId ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                Reject request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <TabsContent value="record" className="mt-4">
        <Card className={panelCardClass}>
          <CardHeader>
            <CardTitle
              className="text-lg font-display uppercase tracking-wide"
              tooltip="Create a payment record that students can verify using the receipt/cheque number."
              tooltipLabel="About Record New Payment"
            >
              Record New Payment
            </CardTitle>
          </CardHeader>
          <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="payment-type">Payment Type</Label>
                  <Select
                    value={paymentType}
                    onValueChange={(value) => {
                      setPaymentType(value as "deposit" | "instalment");
                      setLinkInstalmentId("");
                    }}
                  >
                    <SelectTrigger id="payment-type" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deposit">Deposit</SelectItem>
                      <SelectItem value="instalment">Instalment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="payment-method">Payment Method</Label>
                  <Select
                    value={paymentMethod}
                    onValueChange={(value) =>
                      setPaymentMethod(value as "cash" | "card" | "bank_transfer" | "cheque")
                    }
                  >
                    <SelectTrigger id="payment-method" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor="link-application">Link to application (optional)</Label>
                  <Popover open={linkAppDropdownOpen} onOpenChange={setLinkAppDropdownOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="link-application"
                        variant="outline"
                        role="combobox"
                        aria-expanded={linkAppDropdownOpen}
                        className={cn(
                          "mt-2 w-full justify-between rounded-md font-normal",
                          !linkApplicationId && "text-muted-foreground"
                        )}
                      >
                        <span className="truncate">
                          {(() => {
                            if (!linkApplicationId) {
                              return "None – record as unlinked payment";
                            }
                            const app = applicationsForLink?.find((a) => a.id === linkApplicationId);
                            if (!app) return "Select application";
                            const name =
                              (app as { student_name?: string | null }).student_name ?? "—";
                            const email =
                              (app as { student_email?: string | null }).student_email ?? "";
                            const academicYear =
                              (app as { academic_year_name?: string | null }).academic_year_name ??
                              "";
                            const base = `${name}${email ? ` – ${email}` : ""}`;
                            return academicYear ? `${base} – ${academicYear}` : base;
                          })()}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] p-0 max-h-72"
                      align="start"
                    >
                      <Command>
                        <CommandInput
                          placeholder="Search student or email..."
                          className="h-9"
                        />
                        <CommandList>
                          <CommandEmpty>No applications found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="__none__"
                              onSelect={() => {
                                setLinkApplicationId("");
                                setLinkInstalmentId("");
                                setLinkAppDropdownOpen(false);
                              }}
                              className="cursor-pointer"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  !linkApplicationId ? "opacity-100" : "opacity-0"
                                )}
                              />
                              None – record as unlinked payment
                            </CommandItem>
                            {applicationsForLink?.map((app) => {
                              const name =
                                (app as { student_name?: string | null }).student_name ?? "—";
                              const email =
                                (app as { student_email?: string | null }).student_email ?? "";
                              const academicYear =
                                (app as { academic_year_name?: string | null }).academic_year_name ??
                                "";
                              const label = `${name}${email ? ` – ${email}` : ""}`;
                              return (
                                <CommandItem
                                  key={app.id}
                                  value={academicYear ? `${label} ${academicYear}` : label}
                                  onSelect={() => {
                                    setLinkApplicationId(app.id);
                                    setLinkInstalmentId("");
                                    setLinkAppDropdownOpen(false);
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      linkApplicationId === app.id
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                  <div className="flex w-full items-center justify-between gap-2">
                                    <span className="truncate">{label}</span>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {app.contract_slug && (
                                        <Badge
                                          variant="outline"
                                          className="px-2 py-0 text-[10px] rounded-md"
                                        >
                                          {(app as { contract_slug?: string | null }).contract_slug}
                                        </Badge>
                                      )}
                                      {academicYear && (
                                        <Badge
                                          className="px-2 py-0 text-[10px] rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100"
                                        >
                                          {academicYear}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Link this payment to an application and (for instalments) a specific instalment.
                    Leave empty for unlinked payments (student verifies by receipt).
                  </p>
                </div>

                {linkApplicationId && paymentType === "instalment" && (
                  <div className="sm:col-span-2">
                    <Label htmlFor="link-instalment">Instalment (required when linking) *</Label>
                    <Select value={linkInstalmentId} onValueChange={setLinkInstalmentId}>
                      <SelectTrigger id="link-instalment" className="mt-2">
                        <SelectValue placeholder="Select instalment left to pay" />
                      </SelectTrigger>
                      <SelectContent>
                        {unpaidInstalmentsForLink.map((inst) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            Instalment {inst.instalment_number} – £{Number(inst.amount).toFixed(2)} (Due:{" "}
                            {new Date(inst.due_date).toLocaleDateString("en-GB")})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {unpaidInstalmentsForLink.length === 0 && (linkInstalments?.length ?? 0) > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">All installments for this application are already paid.</p>
                    )}
                  </div>
                )}

                <div>
                  <Label htmlFor="amount">Amount (£) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-2"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <Label htmlFor="receipt-number">
                    Receipt/Cheque Number {!linkApplicationId ? "*" : "(optional when linked)"}
                  </Label>
                  <Input
                    id="receipt-number"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    placeholder="Enter receipt or cheque number"
                    className="mt-2"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {linkApplicationId
                      ? "Optional when linked to an application. Must be unique if provided."
                      : "Required for unlinked payments. Students use this to verify their payment."}
                  </p>
                </div>

                <div>
                  <Label htmlFor="payment-date">Payment Date</Label>
                  <Input
                    id="payment-date"
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="mt-2"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any additional notes..."
                    className="mt-2"
                    rows={3}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
                  <Button
                    variant="outline"
                    onClick={resetRecordForm}
                    className="rounded-md uppercase tracking-wide"
                  >
                    Clear
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={createPayment.isPending}
                    className="rounded-md uppercase tracking-wide"
                  >
                    {createPayment.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Recording...
                      </>
                    ) : (
                      "Record Payment"
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="unlinked" className="mt-4">
        <Card className={panelCardClass}>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle
                  className="text-lg font-display uppercase tracking-wide"
                  tooltip="Payments waiting to be verified and linked by students."
                  tooltipLabel="About Unlinked Payments"
                >
                  Unlinked Payments
                </CardTitle>
              </div>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by receipt number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 rounded-md"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading && !orphanedPayments ? (
              <div className="py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">Loading payments...</p>
              </div>
            ) : orphanedPayments && orphanedPayments.length > 0 ? (
              <div className="space-y-4">
                {orphanedPayments.map((payment) => (
                  <div
                    key={payment.id}
                    className="rounded-2xl border border-border/60 px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge
                          className={`uppercase rounded-md px-2.5 py-0.5 text-xs font-medium ${
                            payment.payment_type === "deposit"
                              ? "bg-blue-500 hover:bg-blue-600 text-white"
                              : "bg-purple-500 hover:bg-purple-600 text-white"
                          }`}
                        >
                          {payment.payment_type}
                        </Badge>
                        <span className="text-lg font-semibold">
                          {formatCurrency(Number(payment.amount))}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {getPaymentMethodLabel(payment.payment_method)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <span>
                          <strong>Receipt:</strong> {payment.receipt_number || "—"}
                        </span>
                        <span>
                          <strong>Date:</strong>{" "}
                          {format(new Date(payment.payment_date), "dd MMM yyyy")}
                        </span>
                        <span>
                          <strong>Recorded:</strong>{" "}
                          {format(new Date(payment.created_at), "dd MMM yyyy")}
                        </span>
                      </div>
                      {payment.notes && (
                        <p className="text-xs text-muted-foreground italic">{payment.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 md:ml-4">
                      <Button
                        variant="outline"
                        size="icon"
                        className="rounded-md bg-primary/10 hover:bg-primary/20 text-primary"
                        onClick={() => {
                          setLinkingPayment(payment);
                          setLinkDialogApplicationId("");
                          setLinkDialogInstalmentId("");
                          setLinkDialogAppSearch("");
                        }}
                        disabled={linkPaymentById.isPending}
                        aria-label="Link to application"
                        title="Link to application"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="rounded-md bg-muted/80 hover:bg-muted text-foreground"
                        onClick={() => setEditingPayment(payment)}
                        disabled={
                          updateOrphanedPayment.isPending &&
                          editingPayment?.id === payment.id
                        }
                        aria-label="Edit payment"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="rounded-md bg-red-50 hover:bg-red-100 text-red-600"
                        disabled={deleteOrphanedPayment.isPending}
                        onClick={() => setPaymentToDelete({ id: payment.id })}
                        aria-label="Delete payment"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center space-y-2">
                <p className="text-muted-foreground">
                  {searchTerm
                    ? "No payments found matching your search."
                    : "No unlinked payments. All payments have been verified by students."}
                </p>
                {searchTerm && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchTerm("")}
                    className="rounded-md uppercase tracking-wide"
                  >
                    Clear Search
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        </TabsContent>
        </Tabs>

        {/* Link payment to application dialog */}
        <Dialog
          open={!!linkingPayment}
          onOpenChange={(open) => {
            if (!open) {
              setLinkingPayment(null);
              setLinkDialogApplicationId("");
              setLinkDialogInstalmentId("");
              setLinkDialogAppSearch("");
            }
          }}
        >
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>Link payment to application</DialogTitle>
              <DialogDescription>
                Assign this unlinked payment to an application. For instalments, choose which instalment it pays.
              </DialogDescription>
            </DialogHeader>
            {linkingPayment && (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge
                    className={`uppercase rounded-md px-2.5 py-0.5 text-xs font-medium ${
                      linkingPayment.payment_type === "deposit"
                        ? "bg-blue-500 hover:bg-blue-600 text-white"
                        : "bg-purple-500 hover:bg-purple-600 text-white"
                    }`}
                  >
                    {linkingPayment.payment_type}
                  </Badge>
                  <span className="font-semibold">{formatCurrency(Number(linkingPayment.amount))}</span>
                </div>
                <div>
                  <Label htmlFor="link-dialog-application">Application *</Label>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">Search by student name or email.</p>
                  {(() => {
                    const search = linkDialogAppSearch.trim().toLowerCase();
                    const filtered =
                      !search
                        ? applicationsForLink ?? []
                        : (applicationsForLink ?? []).filter((app) => {
                            const year =
                              (app as { academic_year_name?: string | null }).academic_year_name ??
                              "";
                            return (
                              (app.student_name ?? "").toLowerCase().includes(search) ||
                              (app.student_email ?? "").toLowerCase().includes(search) ||
                              year.toLowerCase().includes(search)
                            );
                          });
                    const selectedApp = applicationsForLink?.find((a) => a.id === linkDialogApplicationId);
                    return (
                      <Popover open={linkDialogAppOpen} onOpenChange={setLinkDialogAppOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={linkDialogAppOpen}
                            className={cn(
                              "w-full justify-between rounded-xl font-normal mt-0",
                              !linkDialogApplicationId && "text-muted-foreground"
                            )}
                          >
                            <span className="truncate">
                              {selectedApp
                                ? (() => {
                                    const year =
                                      (selectedApp as {
                                        academic_year_name?: string | null;
                                      }).academic_year_name ?? "";
                                    const base = `${selectedApp.student_name ?? "Unknown"} – ${
                                      selectedApp.student_email ?? ""
                                    }`;
                                    return year ? `${base} – ${year}` : base;
                                  })()
                                : "Select application"}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                          <Command>
                            <CommandInput
                              placeholder="Search by name or email..."
                              value={linkDialogAppSearch}
                              onValueChange={setLinkDialogAppSearch}
                            />
                            <CommandList>
                              <CommandEmpty>No application found.</CommandEmpty>
                              <CommandGroup>
                                {filtered.map((app) => {
                                  const academicYear =
                                    (app as { academic_year_name?: string | null }).academic_year_name ??
                                    "";
                                  const baseValue = `${app.student_name ?? ""} ${
                                    app.student_email ?? ""
                                  } ${academicYear} ${app.id}`;
                                  return (
                                    <CommandItem
                                      key={app.id}
                                      value={baseValue}
                                      onSelect={() => {
                                        setLinkDialogApplicationId(app.id);
                                        setLinkDialogInstalmentId("");
                                        setLinkDialogAppOpen(false);
                                        setLinkDialogAppSearch("");
                                      }}
                                      className="cursor-pointer"
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          linkDialogApplicationId === app.id
                                            ? "opacity-100"
                                            : "opacity-0"
                                        )}
                                      />
                                      <div className="flex w-full items-center justify-between gap-2">
                                        <span className="truncate">
                                          {app.student_name ?? "Unknown"} –{" "}
                                          {app.student_email || "—"}
                                        </span>
                                        <div className="flex items-center gap-1 shrink-0">
                                          {app.contract_slug && (
                                            <Badge
                                              variant="outline"
                                              className="px-2 py-0 text-[10px] rounded-md"
                                            >
                                              {app.contract_slug}
                                            </Badge>
                                          )}
                                          {academicYear && (
                                            <Badge
                                              className="px-2 py-0 text-[10px] rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100"
                                            >
                                              {academicYear}
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                    </CommandItem>
                                  );
                                })}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    );
                  })()}
                </div>
                {linkingPayment.payment_type === "instalment" && linkDialogApplicationId && (
                  <div>
                    <Label htmlFor="link-dialog-instalment">Instalment (required) *</Label>
                    <Select value={linkDialogInstalmentId || "__none__"} onValueChange={(v) => setLinkDialogInstalmentId(v === "__none__" ? "" : v)}>
                      <SelectTrigger id="link-dialog-instalment" className="mt-2">
                        <SelectValue placeholder="Select instalment" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select instalment</SelectItem>
                        {unpaidInstalmentsForLinkDialog.map((inst) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            Instalment {inst.instalment_number} – £{Number(inst.amount).toFixed(2)} (Due: {new Date(inst.due_date).toLocaleDateString("en-GB")})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {unpaidInstalmentsForLinkDialog.length === 0 && (linkDialogInstalments?.length ?? 0) > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">All installments for this application are already paid.</p>
                    )}
                  </div>
                )}
              </div>
            )}
            <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <Button variant="outline" className="rounded-md" onClick={() => { setLinkingPayment(null); setLinkDialogApplicationId(""); setLinkDialogInstalmentId(""); setLinkDialogAppSearch(""); }}>
                Cancel
              </Button>
              <Button
                className="rounded-md"
                disabled={
                  !linkingPayment ||
                  !linkDialogApplicationId ||
                  (linkingPayment?.payment_type === "instalment" && !linkDialogInstalmentId) ||
                  (linkingPayment?.payment_type === "instalment" && (unpaidInstalmentsForLinkDialog?.length ?? 0) === 0) ||
                  linkPaymentById.isPending
                }
                onClick={async () => {
                  if (!linkingPayment || !linkDialogApplicationId) return;
                  if (linkingPayment.payment_type === "instalment" && !linkDialogInstalmentId) {
                    toast({ title: "Instalment required", description: "Select an instalment when linking an instalment payment.", variant: "destructive" });
                    return;
                  }
                  try {
                    await linkPaymentById.mutateAsync({
                      paymentId: linkingPayment.id,
                      applicationId: linkDialogApplicationId,
                      instalmentId: linkingPayment.payment_type === "instalment" ? linkDialogInstalmentId || undefined : undefined,
                    });
                    toast({ title: "Payment linked", description: "Payment has been linked to the application." });
                    setLinkingPayment(null);
                    setLinkDialogApplicationId("");
                    setLinkDialogInstalmentId("");
                    setLinkDialogAppSearch("");
                  } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : "Failed to link payment.";
                    toast({ title: "Error", description: msg, variant: "destructive" });
                  }
                }}
              >
                {linkPaymentById.isPending ? "Linking…" : "Link payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit unlinked payment dialog */}
        <Dialog
          open={!!editingPayment}
          onOpenChange={(open) => {
            if (!open) {
              setEditingPayment(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>Edit unlinked payment</DialogTitle>
              <DialogDescription>
                Adjust the details of this payment before it is linked to any application.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {editingPayment && (
                <>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge
                      className={`uppercase rounded-md px-2.5 py-0.5 text-xs font-medium ${
                        editingPayment.payment_type === "deposit"
                          ? "bg-blue-500 hover:bg-blue-600 text-white"
                          : "bg-purple-500 hover:bg-purple-600 text-white"
                      }`}
                    >
                      {editingPayment.payment_type}
                    </Badge>
                    <span>
                      Created{" "}
                      {format(
                        new Date(editingPayment.created_at),
                        "dd MMM yyyy",
                      )}
                    </span>
                  </div>
                  <div>
                    <Label htmlFor="edit-amount">Amount (£) *</Label>
                    <Input
                      id="edit-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-payment-method">Payment Method</Label>
                    <Select
                      value={editPaymentMethod}
                      onValueChange={(value) =>
                        setEditPaymentMethod(
                          value as "cash" | "card" | "bank_transfer" | "cheque",
                        )
                      }
                    >
                      <SelectTrigger id="edit-payment-method" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="bank_transfer">
                          Bank Transfer
                        </SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="edit-receipt">Receipt/Cheque Number</Label>
                    <Input
                      id="edit-receipt"
                      value={editReceiptNumber}
                      onChange={(e) => setEditReceiptNumber(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-payment-date">Payment Date</Label>
                    <Input
                      id="edit-payment-date"
                      type="date"
                      value={editPaymentDate}
                      onChange={(e) => setEditPaymentDate(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-notes">Notes (Optional)</Label>
                    <Textarea
                      id="edit-notes"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={3}
                      className="mt-2 resize-none rounded-xl"
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <Button
                variant="outline"
                className="rounded-md"
                onClick={() => setEditingPayment(null)}
              >
                Cancel
              </Button>
              <Button
                className="rounded-md"
                disabled={
                  updateOrphanedPayment.isPending ||
                  !editingPayment ||
                  !editAmount ||
                  parseFloat(editAmount) <= 0
                }
                onClick={() => {
                  if (!editingPayment) return;
                  if (!editAmount || parseFloat(editAmount) <= 0) {
                    toast({
                      title: "Invalid amount",
                      description: "Please enter a valid payment amount.",
                      variant: "destructive",
                    });
                    return;
                  }
                  updateOrphanedPayment.mutate({
                    id: editingPayment.id,
                    amount: parseFloat(editAmount),
                    paymentMethod: editPaymentMethod,
                    receiptNumber: editReceiptNumber.trim(),
                    paymentDate: editPaymentDate,
                    notes: editNotes.trim() || undefined,
                  });
                }}
              >
                {updateOrphanedPayment.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!paymentToDelete} onOpenChange={(open) => !open && setPaymentToDelete(null)}>
          <AlertDialogContent className="rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display uppercase tracking-wide">
                Delete payment?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This unlinked payment will be permanently removed. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="rounded-md uppercase tracking-wide" onClick={() => setPaymentToDelete(null)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="rounded-md uppercase tracking-wide bg-destructive hover:bg-destructive/90"
                onClick={() => {
                  if (paymentToDelete) {
                    deleteOrphanedPayment.mutate(paymentToDelete.id);
                  }
                }}
              >
                {deleteOrphanedPayment.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
};

export default ManualPaymentEntry;

