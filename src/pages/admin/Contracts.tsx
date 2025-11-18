import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  useAdminContracts,
  useUpdateContract,
  useContractPaymentPlans,
} from "@/hooks/useAdminContracts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
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
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";

const schema = z.object({
  contract_start: z.string().min(1, "Start date required"),
  contract_end: z.string().min(1, "End date required"),
  weekly_price_override: z.coerce.number().min(1, "Weekly price required"),
  deposit_override: z.coerce.number().min(0, "Deposit cannot be negative"),
  summary: z.string().optional(),
  display_order: z.coerce.number().min(1),
});

const Contracts = () => {
  const { data, isLoading } = useAdminContracts();
  const { data: activePlans } = useContractPaymentPlans();
  const updateContract = useUpdateContract();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedPlans, setSelectedPlans] = useState<
    Record<string, { selected: boolean; order: number }>
  >({});

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      contract_start: "",
      contract_end: "",
      weekly_price_override: 0,
      deposit_override: 99,
      summary: "",
      display_order: 1,
    },
  });

  const grouped = useMemo(() => {
    const groups: Record<string, typeof data> = {};
    data?.forEach((contract) => {
      const gradeName = contract.studio_grade?.name ?? "Unknown grade";
      if (!groups[gradeName]) {
        groups[gradeName] = [];
      }
      groups[gradeName]?.push(contract);
    });
    return groups;
  }, [data]);

  useEffect(() => {
    if (!open || !editingId) return;
    const contract = data?.find((item) => item.id === editingId);
    if (!contract) return;

    const initial: Record<string, { selected: boolean; order: number }> = {};
    (activePlans ?? []).forEach((plan, index) => {
      const match =
        contract.contract_payment_plans?.find(
          (link) => link.payment_plan_id === plan.id,
        ) ?? null;
      initial[plan.id] = {
        selected: Boolean(match),
        order:
          typeof match?.display_order === "number"
            ? match.display_order
            : index + 1,
      };
    });
    setSelectedPlans(initial);
  }, [open, editingId, data, activePlans]);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setSelectedPlans({});
    }
  }, [open]);

  const handleEdit = (id: string) => {
    const contract = data?.find((item) => item.id === id);
    if (!contract) return;
    form.reset({
      contract_start: contract.contract_start
        ? contract.contract_start.slice(0, 10)
        : "",
      contract_end: contract.contract_end
        ? contract.contract_end.slice(0, 10)
        : "",
      weekly_price_override: contract.weekly_price_override ?? 0,
      deposit_override: contract.deposit_override ?? 99,
      summary: contract.summary ?? "",
      display_order: contract.display_order ?? 1,
    });
    setEditingId(id);
    setOpen(true);
  };

  const resetState = () => {
    setOpen(false);
    setEditingId(null);
    setTimeout(() => {
      setSelectedPlans({});
    }, 200);
  };

  const handlePlanToggle = (planId: string, checked: boolean) => {
    setSelectedPlans((prev) => ({
      ...prev,
      [planId]: { selected: checked, order: prev[planId]?.order ?? 1 },
    }));
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!editingId) return;
    const orderedPlans = Object.entries(selectedPlans)
      .filter(([, value]) => value.selected)
      .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
      .map(([planId]) => planId);

    try {
      await updateContract.mutateAsync({
        id: editingId,
        ...values,
        payment_plan_ids: orderedPlans,
      });
      toast({ title: "Contract updated" });
      resetState();
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Unable to update contract",
        description: "Please check dates and pricing.",
      });
    }
  });

  return (
    <AdminLayout
      pageTitle="Contracts"
      subtitle="Manage tenancy lengths, pricing overrides and instalment plans."
    >
      <Card className="rounded-3xl border border-border/60 shadow-xl">
        <CardHeader>
          <CardTitle className="text-lg font-display uppercase tracking-wide">
            Contract catalogue
          </CardTitle>
          <CardDescription>
            Contracts are generated per studio grade and academic year. Update dates, weekly price, deposit override, and instalment plans here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            Object.entries(grouped).map(([grade, contracts]) => (
              <div key={grade} className="space-y-3">
                <h3 className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                  {grade}
                </h3>
                <div className="grid gap-4">
                  {contracts?.map((contract) => (
                    <div
                      key={contract.id}
                      className="rounded-2xl border border-border/60 px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                    >
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                          {contract.academic_year?.name ?? "Academic year"}
                        </p>
                        <h4 className="text-lg font-display font-semibold uppercase tracking-wide">
                          {contract.name}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {(contract.contract_start
                            ? contract.contract_start.slice(0, 10)
                            : "TBC"
                          ).toString()}{" "}
                          –{" "}
                          {(contract.contract_end
                            ? contract.contract_end.slice(0, 10)
                            : "TBC"
                          ).toString()}{" "}
                          · {contract.weeks ?? "?"} weeks
                        </p>
                        <p className="text-sm text-primary font-semibold">
                          £
                          {(contract.weekly_price_override ?? 0).toLocaleString(
                            "en-GB",
                          )}{" "}
                          PP/PW
                        </p>
                        {(contract.contract_payment_plans?.length ?? 0) > 0 && (
                          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mt-2">
                            {contract.contract_payment_plans
                              ?.slice()
                              .sort(
                                (a, b) =>
                                  (a.display_order ?? 0) -
                                  (b.display_order ?? 0),
                              )
                              .map(
                                (link) => link.payment_plan?.name ?? "Plan",
                              )
                              .join(" • ")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-full uppercase tracking-wide gap-2"
                          onClick={() => handleEdit(contract.id)}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (value) {
            setOpen(true);
          } else {
            resetState();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-display uppercase tracking-wide">
              Update contract
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="contract_start"
                  render={({ field }) => (
                    <FormItem>
                    <FormLabel>Start date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contract_end"
                  render={({ field }) => (
                    <FormItem>
                    <FormLabel>End date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
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
                          value={field.value ?? ""}
                          onChange={(event) =>
                            field.onChange(
                              event.target.value === ""
                                ? ""
                                : Number(event.target.value),
                            )
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
                          value={field.value ?? ""}
                          onChange={(event) =>
                            field.onChange(
                              event.target.value === ""
                                ? ""
                                : Number(event.target.value),
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="space-y-3">
                <div>
                  <FormLabel className="block">Available payment plans</FormLabel>
                  <p className="text-xs text-muted-foreground">
                    Choose which plans appear for this contract and define the order they will be shown to students.
                  </p>
                </div>
                <div className="space-y-2">
                  {(activePlans ?? []).map((plan, index) => {
                    const planState = selectedPlans[plan.id] ?? {
                      selected: false,
                      order: index + 1,
                    };
                    return (
                      <div
                        key={plan.id}
                        className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl border border-border/60 px-4 py-3 bg-muted/40"
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            id={`plan-${plan.id}`}
                            checked={planState.selected}
                            onCheckedChange={(checked) =>
                              handlePlanToggle(plan.id, Boolean(checked))
                            }
                          />
                          <div>
                            <label
                              htmlFor={`plan-${plan.id}`}
                              className="text-sm font-semibold uppercase tracking-wide"
                            >
                              {plan.name}
                            </label>
                            {plan.description && (
                              <p className="text-xs text-muted-foreground max-w-sm">
                                {plan.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                            Order
                          </span>
                          <Input
                            type="number"
                            min={1}
                            className="w-20"
                            value={planState.order}
                            onChange={(event) =>
                              setSelectedPlans((prev) => ({
                                ...prev,
                                [plan.id]: {
                                  selected: planState.selected,
                                  order: Number(event.target.value) || 1,
                                },
                              }))
                            }
                            disabled={!planState.selected}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {(activePlans?.length ?? 0) === 0 && (
                    <p className="text-xs text-muted-foreground italic">
                      No active payment plans available. Create at least one plan to associate with this contract.
                    </p>
                  )}
                </div>
              </div>
              <FormField
                control={form.control}
                name="display_order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display order</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        value={field.value ?? ""}
                        onChange={(event) =>
                          field.onChange(
                            event.target.value === ""
                              ? ""
                              : Number(event.target.value),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="summary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Summary (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value ?? ""}
                        placeholder="Short description shown on studio page."
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full uppercase tracking-wide"
                  onClick={resetState}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="rounded-full uppercase tracking-wide"
                  disabled={updateContract.isPending}
                >
                  {updateContract.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving
                    </>
                  ) : (
                    "Save changes"
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

export default Contracts;

