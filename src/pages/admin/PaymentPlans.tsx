import { useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  useAdminPaymentPlans,
  useCreatePaymentPlan,
  useUpdatePaymentPlan,
  useDeletePaymentPlan,
  type PaymentPlanWithInstallments,
} from "@/hooks/useAdminPaymentPlans";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

const installmentSchema = z
  .object({
    label: z.string().min(1, "Label required"),
    amount_type: z.enum(["percentage", "fixed"]),
    amount_value: z
      .preprocess(
        (val) => (val === "" || val === null || typeof val === "undefined" ? undefined : Number(val)),
        z
          .number({ invalid_type_error: "Enter an amount" })
          .min(0, "Amount must be positive"),
      ),
    due_date_offset_days: z
      .preprocess((val) => {
        if (val === "" || val === null || typeof val === "undefined") return null;
        return Number(val);
      }, z.number().int().nullable()),
    due_date: z
      .preprocess((val) => {
        if (val === "" || val === null || typeof val === "undefined") return null;
        return val;
      }, z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
        .nullable()),
  })
  .refine(
    (data) =>
      data.due_date !== null || data.due_date_offset_days !== null,
    {
      message: "Provide a due date or offset",
      path: ["due_date"],
    },
  )
  .refine(
    (data) =>
      data.amount_type === "percentage" ? data.amount_value <= 100 : true,
    {
      message: "Percentage cannot exceed 100",
      path: ["amount_value"],
    },
  );

const planSchema = z.object({
  name: z.string().min(1, "Name required"),
  description: z.string().optional(),
  deposit_amount: z
    .preprocess((val) => {
      if (val === "" || val === null || typeof val === "undefined") return null;
      return Number(val);
    }, z.number().min(0, "Deposit must be positive").nullable()),
  is_active: z.boolean().default(true),
  installments: z
    .array(installmentSchema)
    .min(1, "Add at least one installment"),
});

type PlanFormValues = z.infer<typeof planSchema>;

const emptyInstallment: PlanFormValues["installments"][number] = {
  label: "",
  amount_type: "percentage",
  amount_value: 0,
  due_date_offset_days: 0,
  due_date: null,
};

const PaymentPlans = () => {
  const { data, isLoading } = useAdminPaymentPlans();
  const createPlan = useCreatePaymentPlan();
  const updatePlan = useUpdatePaymentPlan();
  const deletePlan = useDeletePaymentPlan();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PaymentPlanWithInstallments | null>(null);

  const academicYear = data?.academicYear ?? null;
  const plans = useMemo(() => data?.plans ?? [], [data]);

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: "",
      description: "",
      deposit_amount: 0,
      is_active: true,
      installments: [emptyInstallment],
    },
  });

  const installmentsFieldArray = useFieldArray({
    control: form.control,
    name: "installments",
  });

  const resetForm = (plan?: PaymentPlanWithInstallments) => {
    if (!plan) {
      form.reset({
        name: "",
        description: "",
        deposit_amount: 0,
        is_active: true,
        installments: [emptyInstallment],
      });
      setEditingPlan(null);
      return;
    }

    form.reset({
      name: plan.name,
      description: plan.description ?? "",
      deposit_amount: plan.deposit_amount ?? 0,
      is_active: Boolean(plan.is_active),
      installments:
        plan.installments.length > 0
          ? plan.installments.map((installment) => ({
              label: installment.label ?? "",
              amount_type: installment.amount_type ?? "percentage",
              amount_value: Number(installment.amount_value ?? 0),
              due_date_offset_days: installment.due_date_offset_days,
              due_date: installment.due_date,
            }))
          : [emptyInstallment],
    });
    setEditingPlan(plan);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setTimeout(() => {
      resetForm();
    }, 200);
  };

  const handleCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleEdit = (plan: PaymentPlanWithInstallments) => {
    resetForm(plan);
    setDialogOpen(true);
  };

  const handleDelete = async (plan: PaymentPlanWithInstallments) => {
    if (!window.confirm(`Delete payment plan "${plan.name}"?`)) return;
    try {
      await deletePlan.mutateAsync(plan.id);
      toast({ title: "Payment plan deleted" });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Unable to delete payment plan",
        description: "Try again or contact support.",
      });
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (!academicYear) {
      toast({
        variant: "destructive",
        title: "No active academic year",
        description: "Activate an academic year before managing payment plans.",
      });
      return;
    }

    const payload = {
      id: editingPlan?.id,
      academic_year_id: academicYear.id,
      name: values.name,
      description: values.description ?? null,
      deposit_amount: values.deposit_amount ?? null,
      is_active: values.is_active,
      installments: values.installments.map((installment) => ({
        label: installment.label,
        amount_type: installment.amount_type,
        amount_value: installment.amount_value,
        due_date_offset_days: installment.due_date_offset_days,
        due_date: installment.due_date,
      })),
    };

    try {
      if (editingPlan) {
        await updatePlan.mutateAsync(payload);
        toast({ title: "Payment plan updated" });
      } else {
        await createPlan.mutateAsync(payload);
        toast({ title: "Payment plan created" });
      }
      closeDialog();
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Unable to save payment plan",
        description: "Check the details and try again.",
      });
    }
  });

  return (
    <AdminLayout
      pageTitle="Payment Plans"
      subtitle="Manage deposit amounts and instalment schedules for the active academic year."
    >
      <Card className="rounded-3xl border border-border/60 shadow-xl">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-display uppercase tracking-wide">
              Instalment schedules
            </CardTitle>
            <CardDescription>
              Plans apply to the active academic year ({academicYear?.name ?? "none active"}). Students will choose one plan during their booking journey.
            </CardDescription>
          </div>
          <Button onClick={handleCreate} disabled={!academicYear}>
            <Plus className="h-4 w-4 mr-2" />
            New plan
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : plans.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 px-6 py-10 text-center space-y-3">
              <h3 className="text-lg font-semibold">No payment plans yet</h3>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                Create instalment schedules customised for {academicYear?.name ?? "the active academic year"}. Students will see these options before starting their application.
              </p>
              <Button onClick={handleCreate} disabled={!academicYear}>
                Create payment plan
              </Button>
            </div>
          ) : (
            plans.map((plan) => (
              <div
                key={plan.id}
                className="rounded-2xl border border-border/60 px-6 py-5 space-y-4 bg-background/60"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-display font-bold uppercase tracking-wide">
                        {plan.name}
                      </h3>
                      <Badge variant={plan.is_active ? "default" : "secondary"}>
                        {plan.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    {plan.description && (
                      <p className="text-sm text-muted-foreground max-w-2xl">
                        {plan.description}
                      </p>
                    )}
                    <p className="text-sm font-semibold">
                      Deposit: £{(plan.deposit_amount ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(plan)}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(plan)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Instalment breakdown
                  </h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    {plan.installments.map((installment) => (
                      <div
                        key={installment.id}
                        className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 space-y-2"
                      >
                        <p className="text-sm font-semibold uppercase tracking-wide">
                          {installment.label ?? `Instalment ${installment.sequence}`}
                        </p>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>
                            Amount:{" "}
                            {installment.amount_type === "percentage"
                              ? `${installment.amount_value}% of balance`
                              : `£${installment.amount_value.toLocaleString("en-GB", {
                                  minimumFractionDigits: 2,
                                })}`}
                          </p>
                          {installment.due_date ? (
                            <p>Due on: {installment.due_date}</p>
                          ) : (
                            <p>
                              Due {installment.due_date_offset_days} days after contract start
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-display uppercase tracking-wide">
              {editingPlan ? "Edit payment plan" : "New payment plan"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form className="space-y-6" onSubmit={onSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 3 instalments" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deposit_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Deposit amount (£)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Optional description shown on the contract page."
                        className="min-h-[80px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
                    <div>
                      <FormLabel className="text-sm font-semibold uppercase tracking-wide">
                        Active plan
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Inactive plans stay hidden from students but remain editable.
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold uppercase tracking-wide">
                    Instalments
                  </h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      installmentsFieldArray.append({
                        label: "",
                        amount_type: "percentage",
                        amount_value: 0,
                        due_date_offset_days: 0,
                        due_date: null,
                      })
                    }
                  >
                    Add instalment
                  </Button>
                </div>
                <div className="space-y-3">
                  {installmentsFieldArray.fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="rounded-2xl border border-border/60 px-4 py-4 space-y-4 bg-muted/40"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold uppercase tracking-wide">
                          Instalment {index + 1}
                        </p>
                        {installmentsFieldArray.fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => installmentsFieldArray.remove(index)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <FormField
                          control={form.control}
                          name={`installments.${index}.label`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Label</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g. Instalment 1" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`installments.${index}.amount_type`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Amount type</FormLabel>
                              <FormControl>
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="percentage">Percentage of remaining balance</SelectItem>
                                    <SelectItem value="fixed">Fixed amount (£)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <FormField
                          control={form.control}
                          name={`installments.${index}.amount_value`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                {form.watch(`installments.${index}.amount_type`) === "percentage"
                                  ? "Percentage"
                                  : "Amount (£)"}
                              </FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" min="0" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`installments.${index}.due_date_offset_days`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Due offset (days)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="e.g. 90"
                                  {...field}
                                  value={field.value ?? ""}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name={`installments.${index}.due_date`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fixed due date (optional)</FormLabel>
                            <FormControl>
                              <Input
                                type="date"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                            <p className="text-xs text-muted-foreground">
                              Provide either a due date or an offset in days after contract start.
                            </p>
                          </FormItem>
                        )}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createPlan.isPending || updatePlan.isPending}
                >
                  {createPlan.isPending || updatePlan.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Saving
                    </>
                  ) : (
                    "Save payment plan"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default PaymentPlans;


