import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Progress } from "@/components/ui/progress";
import { useCreateContract, useContractPaymentPlans } from "@/hooks/useAdminContracts";
import { useCreatePaymentPlan } from "@/hooks/useAdminPaymentPlans";
import { useAdminAcademicYears } from "@/hooks/useAdminAcademicYears";
import { useAdminStudioGrades } from "@/hooks/useAdminStudioGrades";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const schema = z.object({
  academic_year_id: z.string().min(1, "Academic year required"),
  studio_grade_id: z.string().min(1, "Studio grade required"),
  name: z.string().min(1, "Contract name required"),
  contract_weeks: z.coerce.number().min(1, "Enter at least 1 week"),
  contract_extra_days: z.coerce.number().min(0, "Extra days must be 0–6").max(6, "Extra days must be 0–6"),
  contract_start: z.string().min(1, "Start date required"),
  contract_end: z.string().min(1, "End date required"),
  weekly_price_override: z.coerce.number().min(1, "Weekly price required"),
  deposit_override: z.coerce.number().min(0, "Deposit cannot be negative"),
  display_order: z.coerce.number().min(1),
});

type FormValues = z.infer<typeof schema>;

const TOTAL_STEPS = 3;

const getDefaultPaymentPlanOrder = (planName: string): number => {
  const orderMap: Record<string, number> = {
    "Pay in Full": 1,
    "3 Instalments": 2,
    "4 Instalments": 3,
    "10 Instalments": 4,
  };
  return orderMap[planName] ?? 999;
};

export type GeneratedInstallment = {
  label: string;
  due_date_offset_days: number;
  amount_type: "percentage";
  amount_value: number;
};

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDueDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th";
  const month = d.toLocaleDateString("en-GB", { month: "long" });
  const year = d.getFullYear();
  return `${day}${suffix} ${month} ${year}`;
}

interface CreateCustomContractSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (contractId: string) => void;
}

export function CreateCustomContractSheet({
  open,
  onOpenChange,
  onSuccess,
}: CreateCustomContractSheetProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { data: academicYears } = useAdminAcademicYears();
  const { data: studioGradesData } = useAdminStudioGrades();
  const createContract = useCreateContract();
  const createPaymentPlan = useCreatePaymentPlan();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string | null>(null);
  const { data: activePlans } = useContractPaymentPlans(selectedAcademicYearId);
  const [selectedPlans, setSelectedPlans] = useState<Record<string, { selected: boolean; order: number }>>({});
  const [planSource, setPlanSource] = useState<"existing" | "new">("existing");
  const [newPlanName, setNewPlanName] = useState("");
  const [numInstallments, setNumInstallments] = useState(5);
  const [firstDueDaysBeforeStart, setFirstDueDaysBeforeStart] = useState(14);
  const [intervalWeeks, setIntervalWeeks] = useState(4);
  const [generatedInstallments, setGeneratedInstallments] = useState<GeneratedInstallment[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      academic_year_id: "",
      studio_grade_id: "",
      name: "",
      contract_weeks: 21,
      contract_extra_days: 0,
      contract_start: "",
      contract_end: "",
      weekly_price_override: 0,
      deposit_override: 99,
      display_order: 999,
    },
  });

  const watchStart = form.watch("contract_start");
  const watchWeeks = form.watch("contract_weeks");
  const watchExtraDays = form.watch("contract_extra_days");

  // Computed end date so it always shows in UI (for both "just weeks" and "weeks + days")
  const computedEndDate = (() => {
    if (!watchStart || watchWeeks == null || Number(watchWeeks) < 1) return "";
    const extra = Math.min(6, Math.max(0, Number(watchExtraDays) || 0));
    const totalDays = Number(watchWeeks) * 7 + extra;
    return addDays(watchStart, totalDays);
  })();

  useEffect(() => {
    if (computedEndDate) {
      form.setValue("contract_end", computedEndDate);
    }
  }, [computedEndDate, form]);

  useEffect(() => {
    if (!open) return;
    const firstYear = academicYears?.find((y) => y.is_active) || academicYears?.[0];
    if (firstYear) {
      setSelectedAcademicYearId(firstYear.id);
      form.reset({
        academic_year_id: firstYear.id,
        studio_grade_id: "",
        name: "",
        contract_weeks: 21,
        contract_extra_days: 0,
        contract_start: "",
        contract_end: "",
        weekly_price_override: 0,
        deposit_override: 99,
        display_order: 999,
      });
    } else {
      setSelectedAcademicYearId(null);
    }
    setSelectedPlans({});
    setCurrentStep(1);
    setPlanSource("existing");
    setGeneratedInstallments([]);
  }, [open, academicYears, form]);

  useEffect(() => {
    if (!activePlans?.length) return;
    const initial: Record<string, { selected: boolean; order: number }> = {};
    activePlans.forEach((plan, index) => {
      initial[plan.id] = {
        selected: false,
        order: getDefaultPaymentPlanOrder(plan.name) < 999
          ? getDefaultPaymentPlanOrder(plan.name)
          : index + 1,
      };
    });
    setSelectedPlans((prev) => (Object.keys(prev).length ? prev : initial));
  }, [activePlans]);

  const sortedActivePlans = useMemo(() => {
    if (!activePlans) return [];
    return [...activePlans].sort(
      (a, b) => getDefaultPaymentPlanOrder(a.name) - getDefaultPaymentPlanOrder(b.name)
    );
  }, [activePlans]);

  const progressValue = (currentStep / TOTAL_STEPS) * 100;

  const handleGenerateInstallments = () => {
    const start = form.getValues("contract_start");
    const weeks = form.getValues("contract_weeks") || 0;
    const extraDays = Math.min(6, Math.max(0, Number(form.getValues("contract_extra_days")) || 0));
    if (!start || numInstallments < 1) {
      toast({ variant: "destructive", title: "Set start date and number of instalments first." });
      return;
    }
    const rows: GeneratedInstallment[] = [];
    const pctEach = Math.floor(100 / numInstallments);
    const remainder = 100 - pctEach * (numInstallments - 1);
    const durationLabel = extraDays > 0 ? `${weeks} weeks ${extraDays} days` : `${weeks} weeks`;
    const labelPrefix = `${durationLabel} plan `;
    for (let i = 0; i < numInstallments; i++) {
      let offset: number;
      if (i === 0) {
        offset = -firstDueDaysBeforeStart;
      } else {
        offset = (i - 1) * intervalWeeks * 7;
      }
      rows.push({
        label: `${labelPrefix}Installment ${i + 1}`,
        due_date_offset_days: offset,
        amount_type: "percentage",
        amount_value: i === numInstallments - 1 ? remainder : pctEach,
      });
    }
    setGeneratedInstallments(rows);
    toast({ title: "Instalments generated. You can edit below." });
  };

  const updateGeneratedInstallment = (index: number, field: keyof GeneratedInstallment, value: number) => {
    setGeneratedInstallments((prev) => {
      const next = [...prev];
      if (index < 0 || index >= next.length) return prev;
      (next[index] as any)[field] = value;
      return next;
    });
  };

  const handleSubmit = form.handleSubmit(
    async (values) => {
      const weeks = values.contract_weeks;
      const extraDays = Math.min(6, Math.max(0, Number(values.contract_extra_days) || 0));
      let paymentPlanIds: string[] = [];
      let paymentPlanOrders: number[] = [];

      if (planSource === "new" && generatedInstallments.length > 0) {
        try {
          const plan = await createPaymentPlan.mutateAsync({
            academic_year_id: values.academic_year_id,
            name: newPlanName.trim() || `${values.name} – ${numInstallments} inst`,
            description: null,
            deposit_amount: values.deposit_override != null ? Number(values.deposit_override) : null,
            is_active: true,
            installments: generatedInstallments.map((inst) => ({
              label: inst.label,
              due_date_offset_days: inst.due_date_offset_days,
              due_date: null,
              amount_type: inst.amount_type,
              amount_value: inst.amount_value,
            })),
          });
          paymentPlanIds = [plan.id];
          paymentPlanOrders = [1];
          queryClient.invalidateQueries({ queryKey: ["admin-payment-plans"] });
        } catch (err) {
          console.error(err);
          toast({
            variant: "destructive",
            title: "Could not create payment plan",
            description: "Check instalment details and try again.",
          });
          return;
        }
      } else {
        const ordered = Object.entries(selectedPlans)
          .filter(([, v]) => v.selected)
          .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));
        paymentPlanIds = ordered.map(([id]) => id);
        paymentPlanOrders = ordered.map(([, v]) => v.order);
      }

      if (paymentPlanIds.length === 0) {
        toast({
          variant: "destructive",
          title: "Select or create a payment plan",
          description: "Use existing plans or generate a new one.",
        });
        return;
      }

      try {
        const contract = await createContract.mutateAsync({
          academic_year_id: values.academic_year_id,
          studio_grade_id: values.studio_grade_id,
          name: values.name,
          contract_start: values.contract_start,
          contract_end: values.contract_end,
          weeks,
          extra_days: extraDays,
          weekly_price_override: values.weekly_price_override,
          deposit_override: values.deposit_override,
          display_order: values.display_order,
          visible_on_portal: false,
          is_active: true,
          payment_plan_ids: paymentPlanIds,
          payment_plan_orders: paymentPlanOrders,
        });
        toast({ title: "Custom contract created" });
        onSuccess(contract.id);
        onOpenChange(false);
      } catch (err) {
        console.error(err);
        toast({
          variant: "destructive",
          title: "Could not create contract",
          description: "Check dates and pricing, then try again.",
        });
      }
    },
    (errors) => {
      const firstMessage = Object.values(errors)[0]?.message;
      toast({
        variant: "destructive",
        title: "Please fix the form",
        description: typeof firstMessage === "string" ? firstMessage : "Complete all steps and check required fields (Step 1: details, Step 2: price & deposit, Step 3: payment plan).",
      });
      setCurrentStep(1);
      const firstErrorField = Object.keys(errors)[0] as keyof FormValues | undefined;
      if (firstErrorField) {
        const stepForField: Record<string, number> = {
          academic_year_id: 1,
          studio_grade_id: 1,
          name: 1,
          contract_weeks: 1,
          contract_extra_days: 1,
          contract_start: 1,
          contract_end: 1,
          weekly_price_override: 2,
          deposit_override: 2,
          display_order: 1,
        };
        const step = stepForField[firstErrorField];
        if (step) setCurrentStep(step);
      }
    }
  );

  const handlePlanToggle = (planId: string, checked: boolean) => {
    setSelectedPlans((prev) => {
      const plan = sortedActivePlans.find((p) => p.id === planId);
      const defaultOrder = plan ? getDefaultPaymentPlanOrder(plan.name) : 999;
      return {
        ...prev,
        [planId]: { selected: checked, order: prev[planId]?.order ?? defaultOrder },
      };
    });
  };

  const canGoNext = () => {
    const values = form.getValues();
    if (currentStep === 1) {
      return !!(
        values.academic_year_id &&
        values.studio_grade_id &&
        values.name &&
        values.contract_weeks >= 1 &&
        values.contract_start &&
        values.contract_end
      );
    }
    if (currentStep === 2) {
      return values.weekly_price_override >= 1 && values.deposit_override >= 0;
    }
    if (currentStep === 3) {
      if (planSource === "existing") {
        return Object.entries(selectedPlans).some(([, v]) => v.selected);
      }
      return generatedInstallments.length >= 1;
    }
    return false;
  };

  const step1 = (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2">
        This contract will only be available to staff. It won’t show on the room grade page for students.
      </p>
      <FormField
        control={form.control}
        name="academic_year_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Academic year</FormLabel>
            <Select
              value={field.value}
              onValueChange={(v) => {
                field.onChange(v);
                setSelectedAcademicYearId(v);
              }}
            >
              <FormControl>
                <SelectTrigger className="rounded-full">
                  <SelectValue placeholder="Select academic year" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {academicYears?.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="studio_grade_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Studio grade</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className="rounded-full">
                  <SelectValue placeholder="Select studio grade" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {studioGradesData?.grades?.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Contract name</FormLabel>
            <FormControl>
              <Input placeholder="e.g. Silver 21 weeks (custom)" className="rounded-full px-3 min-w-0" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="contract_weeks"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Weeks</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  className="rounded-full px-3 min-w-0"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="contract_extra_days"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Extra days (0–6)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  max={6}
                  className="rounded-full px-3 min-w-0"
                  value={field.value ?? 0}
                  onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="contract_start"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Start date</FormLabel>
              <FormControl>
                <Input type="date" className="rounded-full px-3 min-w-0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="contract_end"
        render={({ field }) => (
          <FormItem>
            <FormLabel>End date (auto from weeks + start)</FormLabel>
            <FormControl>
              <Input
                type="date"
                className="rounded-full bg-muted/50 px-3 min-w-0"
                readOnly
                value={computedEndDate || field.value || ""}
                onChange={() => {}}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {watchWeeks >= 1 && watchStart && (
        <p className="text-xs text-muted-foreground">
          Duration: <strong>{watchWeeks} weeks{Number(watchExtraDays) > 0 ? ` ${watchExtraDays} days` : ""}</strong>
          {computedEndDate && (
            <span className="block text-muted-foreground/80">
              End date: {new Date(computedEndDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
        </p>
      )}
    </div>
  );

  const step2 = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="weekly_price_override"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Weekly price (£)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  className="rounded-full px-3 min-w-0"
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="deposit_override"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Deposit (£)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  className="rounded-full px-3 min-w-0"
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );

  const step3 = (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={planSource === "existing" ? "default" : "outline"}
          size="sm"
          className="rounded-full flex-1"
          onClick={() => setPlanSource("existing")}
        >
          Use existing plans
        </Button>
        <Button
          type="button"
          variant={planSource === "new" ? "default" : "outline"}
          size="sm"
          className="rounded-full flex-1"
          onClick={() => setPlanSource("new")}
        >
          Create new plan here
        </Button>
      </div>

      {planSource === "existing" ? (
        <div className="space-y-2">
          <Label>Payment plans</Label>
          <p className="text-xs text-muted-foreground">
            Select at least one plan for this contract.
          </p>
          <div className="space-y-2">
            {sortedActivePlans.map((plan) => {
              const state = selectedPlans[plan.id] ?? { selected: false, order: 1 };
              return (
                <div
                  key={plan.id}
                  className="flex items-center gap-3 rounded-xl border border-border/60 px-4 py-2 bg-muted/40"
                >
                  <Checkbox
                    id={`custom-plan-${plan.id}`}
                    checked={state.selected}
                    onCheckedChange={(c) => handlePlanToggle(plan.id, Boolean(c))}
                  />
                  <Label htmlFor={`custom-plan-${plan.id}`} className="flex-1 text-sm font-medium">
                    {plan.name}
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    className="w-16 h-8"
                    value={state.order}
                    onChange={(e) =>
                      setSelectedPlans((prev) => ({
                        ...prev,
                        [plan.id]: { selected: state.selected, order: Number(e.target.value) || 1 },
                      }))
                    }
                    disabled={!state.selected}
                  />
                </div>
              );
            })}
            {sortedActivePlans.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                Select an academic year first. Or create a new plan below.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Instalment due dates are defined here. Deposit is separate (set in Step 2).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Plan name</Label>
              <Input
                className="rounded-full px-3 min-w-0"
                placeholder="e.g. 21 weeks plan 5 inst"
                value={newPlanName}
                onChange={(e) => setNewPlanName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Number of instalments</Label>
              <Input
                type="number"
                min={1}
                className="rounded-full px-3 min-w-0"
                value={numInstallments}
                onChange={(e) => setNumInstallments(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>First instalment due (days before start)</Label>
              <Input
                type="number"
                min={0}
                className="rounded-full px-3 min-w-0"
                value={firstDueDaysBeforeStart}
                onChange={(e) =>
                  setFirstDueDaysBeforeStart(Math.max(0, Number(e.target.value) || 0))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Remaining every (weeks from start)</Label>
              <Input
                type="number"
                min={1}
                className="rounded-full px-3 min-w-0"
                value={intervalWeeks}
                onChange={(e) => setIntervalWeeks(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="rounded-full w-full bg-amber-400 hover:bg-amber-500 text-amber-950 border-amber-500/50"
            onClick={handleGenerateInstallments}
          >
            Generate instalments
          </Button>
          {generatedInstallments.length > 0 && (
            <div className="space-y-2">
              <Label>Edit instalments (then create contract)</Label>
              <div className="rounded-xl border border-border/60 overflow-x-auto">
                <table className="w-full text-sm min-w-[420px]">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border/60">
                      <th className="text-left p-2 pl-3">Label</th>
                      <th className="text-left p-2">Due (days)</th>
                      <th className="text-left p-2">Due date</th>
                      <th className="text-left p-2">Amount %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generatedInstallments.map((row, i) => {
                      const contractStart = form.watch("contract_start");
                      const dueDateStr = contractStart
                        ? addDays(contractStart, row.due_date_offset_days)
                        : "";
                      const dueDateLabel = dueDateStr ? formatDueDateLabel(dueDateStr) : "—";
                      return (
                        <tr key={i} className="border-b border-border/40 last:border-0">
                          <td className="p-2 pl-3">
                            <Input
                              className="h-8 rounded-full text-xs px-3 min-w-0 w-full"
                              value={row.label}
                              onChange={(e) => {
                                setGeneratedInstallments((prev) => {
                                  const n = [...prev];
                                  n[i] = { ...n[i], label: e.target.value };
                                  return n;
                                });
                              }}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              className="h-8 w-20 rounded-full text-xs px-3"
                              value={row.due_date_offset_days}
                              onChange={(e) =>
                                updateGeneratedInstallment(
                                  i,
                                  "due_date_offset_days",
                                  Number(e.target.value) || 0
                                )
                              }
                            />
                          </td>
                          <td className="p-2 text-xs text-muted-foreground align-middle">
                            {dueDateLabel}
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              className="h-8 w-16 rounded-full text-xs px-3"
                              value={row.amount_value}
                              onChange={(e) =>
                                updateGeneratedInstallment(
                                  i,
                                  "amount_value",
                                  Number(e.target.value) || 0
                                )
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const stepContent = currentStep === 1 ? step1 : currentStep === 2 ? step2 : step3;

  const footer = (
    <div className="flex items-center justify-between gap-2 pt-4 border-t border-border/60">
      <div className="flex gap-2">
        {currentStep > 1 && (
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => setCurrentStep((s) => s - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        )}
        {currentStep < TOTAL_STEPS && (
          <Button
            type="button"
            className="rounded-full"
            onClick={() => setCurrentStep((s) => s + 1)}
            disabled={!canGoNext()}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        {currentStep === TOTAL_STEPS && (
          <div className="flex flex-col items-end gap-1">
            <Button
              type="button"
              className="rounded-full"
              onClick={handleSubmit}
              disabled={
                createContract.isPending ||
                createPaymentPlan.isPending ||
                (planSource === "new"
                  ? generatedInstallments.length < 1
                  : !Object.entries(selectedPlans).some(([, v]) => v.selected))
              }
              title={
                createContract.isPending || createPaymentPlan.isPending
                  ? "Creating…"
                  : planSource === "new"
                    ? generatedInstallments.length < 1
                      ? "Generate or add at least one instalment in Step 3"
                      : undefined
                    : !Object.entries(selectedPlans).some(([, v]) => v.selected)
                      ? "Select at least one payment plan in Step 3"
                      : undefined
              }
            >
              {(createContract.isPending || createPaymentPlan.isPending) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create & use contract"
              )}
            </Button>
            {!createContract.isPending && !createPaymentPlan.isPending && (
              planSource === "new" && generatedInstallments.length < 1 ? (
                <p className="text-xs text-muted-foreground">Generate instalments above to enable</p>
              ) : planSource === "existing" && !Object.entries(selectedPlans).some(([, v]) => v.selected) ? (
                <p className="text-xs text-muted-foreground">Select at least one payment plan to enable</p>
              ) : null
            )}
          </div>
        )}
      </div>
    </div>
  );

  const body = (
    <Form {...form}>
      <form onSubmit={(e) => e.preventDefault()} className="space-y-4 px-1 min-w-0">
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Step {currentStep} of {TOTAL_STEPS}</span>
          </div>
          <Progress value={progressValue} className="h-2" />
        </div>
        {stepContent}
        {footer}
      </form>
    </Form>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh] rounded-t-[28px]">
          <DrawerHeader className="text-left px-4 pt-6 pb-2">
            <DrawerTitle className="text-xl font-display uppercase tracking-wide">
              Create custom contract
            </DrawerTitle>
            <DrawerDescription>
              Add a staff-only contract. Weeks + start → end date. Optionally create an instalment plan here.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-5 pb-6 overflow-y-auto flex-1 min-w-0">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col pr-6 pl-6">
        <SheetHeader>
          <SheetTitle className="text-xl font-display uppercase tracking-wide">
            Create custom contract
          </SheetTitle>
          <SheetDescription>
            Add a staff-only contract. Weeks + start → end date. Optionally create an instalment plan here.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 flex-1 overflow-y-auto min-w-0">{body}</div>
      </SheetContent>
    </Sheet>
  );
}
