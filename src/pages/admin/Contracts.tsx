import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  useAdminContracts,
  useCreateContract,
  useUpdateContract,
  useDeleteContract,
  useContractPaymentPlans,
  useDuplicateContracts,
} from "@/hooks/useAdminContracts";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminAcademicYears } from "@/hooks/useAdminAcademicYears";
import { useAdminStudioGrades } from "@/hooks/useAdminStudioGrades";
import { useAllAcademicYears } from "@/hooks/useAdminPaymentPlans";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Plus, Copy, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
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
import { formatContractDuration } from "@/utils/contractDuration";
import { Checkbox } from "@/components/ui/checkbox";
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

const schema = z.object({
  academic_year_id: z.string().min(1, "Academic year required"),
  studio_grade_id: z.string().min(1, "Studio grade required"),
  name: z.string().min(1, "Contract name required"),
  slug: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^[a-z0-9\/]+(?:[-/][a-z0-9\/]+)*$/.test(v),
      "Slug: lowercase letters, numbers, hyphens and slashes (e.g. platinum-45-weeks-26/27)"
    ),
  contract_start: z.string().min(1, "Start date required"),
  contract_end: z.string().min(1, "End date required"),
  weekly_price_override: z.coerce.number().min(1, "Weekly price required"),
  deposit_override: z.coerce.number().min(0, "Deposit cannot be negative"),
  summary: z.string().optional(),
  display_order: z.coerce.number().min(1),
  cta_label: z.string().optional(),
  visible_on_portal: z.boolean(),
});

// Default order for payment plans
const getDefaultPaymentPlanOrder = (planName: string): number => {
  const orderMap: Record<string, number> = {
    "Pay in Full": 1,
    "3 Instalments": 2,
    "4 Instalments": 3,
    "10 Instalments": 4,
  };
  // For plans not in map, use a high number (append to end)
  return orderMap[planName] ?? 999;
};

const Contracts = () => {
  const { role } = useAuth();
  const { data, isLoading } = useAdminContracts();
  const { data: academicYears } = useAdminAcademicYears();
  const { data: studioGradesData } = useAdminStudioGrades();
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();
  const deleteContract = useDeleteContract();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string | null>(null);
  const [filterAcademicYearId, setFilterAcademicYearId] = useState<string | null>(null);
  const { data: activePlans } = useContractPaymentPlans(selectedAcademicYearId);
  const [selectedPlans, setSelectedPlans] = useState<
    Record<string, { selected: boolean; order: number }>
  >({});
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [sourceYearId, setSourceYearId] = useState<string>("");
  const [targetYearId, setTargetYearId] = useState<string>("");
  const [contractToDelete, setContractToDelete] = useState<{ id: string; name: string } | null>(null);
  const [showCustomContracts, setShowCustomContracts] = useState(false);

  const { data: allAcademicYears } = useAllAcademicYears();
  const duplicateContracts = useDuplicateContracts();
  const isSuperadmin = role === "superadmin";

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      academic_year_id: "",
      studio_grade_id: "",
      name: "",
      slug: "",
      contract_start: "",
      contract_end: "",
      weekly_price_override: 0,
      deposit_override: 99,
      summary: "",
      display_order: 1,
      cta_label: "",
      visible_on_portal: true,
    },
  });

  // Filter contracts: optionally exclude student-specific (custom) contracts; then by academic year
  const filteredData = useMemo(() => {
    if (!data) return [];
    const list = showCustomContracts
      ? data
      : data.filter(
          (contract) => !(contract as { student_application_id?: string | null }).student_application_id
        );
    if (!filterAcademicYearId) return list;
    return list.filter((contract) => contract.academic_year_id === filterAcademicYearId);
  }, [data, filterAcademicYearId, showCustomContracts]);

  // Set default filter to active year on mount
  useEffect(() => {
    if (!filterAcademicYearId && academicYears && academicYears.length > 0) {
      const activeYear = academicYears.find((y) => y.is_active) || academicYears[0];
      if (activeYear) {
        setFilterAcademicYearId(activeYear.id);
      }
    }
  }, [filterAcademicYearId, academicYears]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof filteredData> = {};
    filteredData?.forEach((contract) => {
      const gradeName = contract.studio_grade?.name ?? "Unknown grade";
      if (!groups[gradeName]) {
        groups[gradeName] = [];
      }
      groups[gradeName]?.push(contract);
    });
    return groups;
  }, [filteredData]);

  // Sort activePlans by default order, then by saved order
  const sortedActivePlans = useMemo(() => {
    if (!activePlans) return [];
    // Create a copy and sort by default order first, then by name
    return [...activePlans].sort((a, b) => {
      const orderA = getDefaultPaymentPlanOrder(a.name);
      const orderB = getDefaultPaymentPlanOrder(b.name);
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      // If same default order, sort alphabetically
      return a.name.localeCompare(b.name);
    });
  }, [activePlans]);

  useEffect(() => {
    if (!open) return;
    
    if (editingId) {
      const contract = data?.find((item) => item.id === editingId);
      if (!contract) return;
      
      setSelectedAcademicYearId(contract.academic_year_id);
      
      // Create a map of saved orders from the contract
      const savedOrders = new Map<string, number>();
      contract.contract_payment_plans?.forEach((link) => {
        if (link.payment_plan_id && typeof link.display_order === "number") {
          savedOrders.set(link.payment_plan_id, link.display_order);
        }
      });
      
      // Initialize plans with saved order if exists, otherwise use default order
      const initial: Record<string, { selected: boolean; order: number }> = {};
      sortedActivePlans.forEach((plan, index) => {
        const match =
          contract.contract_payment_plans?.find(
            (link) => link.payment_plan_id === plan.id,
          ) ?? null;
        
        // Use saved order if exists, otherwise use default order based on plan name
        const savedOrder = savedOrders.get(plan.id);
        const defaultOrder = getDefaultPaymentPlanOrder(plan.name);
        const finalOrder = savedOrder ?? (defaultOrder < 999 ? defaultOrder : index + 1);
        
        initial[plan.id] = {
          selected: Boolean(match),
          order: finalOrder,
        };
      });
      
      // Also include any plans from contract that might not be in activePlans (edge case)
      contract.contract_payment_plans?.forEach((link) => {
        if (link.payment_plan_id && !initial[link.payment_plan_id]) {
          initial[link.payment_plan_id] = {
            selected: true,
            order: typeof link.display_order === "number" ? link.display_order : 999,
          };
        }
      });
      
      setSelectedPlans(initial);
    } else {
      // For create, set first academic year (prefer active, but show all)
      const firstYear = academicYears?.find(y => y.is_active) || academicYears?.[0];
      if (firstYear) {
        setSelectedAcademicYearId(firstYear.id);
        form.setValue("academic_year_id", firstYear.id);
      }
      
      // Initialize plans with default order for new contracts
      const initial: Record<string, { selected: boolean; order: number }> = {};
      sortedActivePlans.forEach((plan) => {
        initial[plan.id] = {
          selected: false,
          order: getDefaultPaymentPlanOrder(plan.name) < 999 
            ? getDefaultPaymentPlanOrder(plan.name) 
            : sortedActivePlans.indexOf(plan) + 1,
        };
      });
      setSelectedPlans(initial);
    }
  }, [open, editingId, data, sortedActivePlans, academicYears, form]);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setSelectedPlans({});
    }
  }, [open]);

  const handleCreate = () => {
    const firstYear = academicYears?.find(y => y.is_active) || academicYears?.[0];
    form.reset({
      academic_year_id: firstYear?.id ?? "",
      studio_grade_id: "",
      name: "",
      slug: "",
      contract_start: "",
      contract_end: "",
      weekly_price_override: 0,
      deposit_override: 99,
      summary: "",
      display_order: 1,
      cta_label: "",
      visible_on_portal: true,
    });
    setEditingId(null);
    setOpen(true);
  };

  const handleEdit = (id: string) => {
    const contract = data?.find((item) => item.id === id);
    if (!contract) return;
    form.reset({
      academic_year_id: contract.academic_year_id,
      studio_grade_id: contract.studio_grade_id,
      name: contract.name,
      slug: contract.slug ?? "",
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
      cta_label: contract.cta_label ?? "",
      visible_on_portal: contract.visible_on_portal ?? true,
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
    setSelectedPlans((prev) => {
      const plan = sortedActivePlans.find((p) => p.id === planId);
      const defaultOrder = plan ? getDefaultPaymentPlanOrder(plan.name) : 999;
      return {
        ...prev,
        [planId]: { 
          selected: checked, 
          order: prev[planId]?.order ?? (defaultOrder < 999 ? defaultOrder : Object.keys(prev).length + 1),
        },
      };
    });
  };

  // Calculate weeks from dates
  const calculateWeeks = (start: string, end: string): number => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.round(diffDays / 7);
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    // Get selected plans with their order values, sorted by order
    const orderedPlans = Object.entries(selectedPlans)
      .filter(([, value]) => value.selected)
      .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
      .map(([planId, value]) => ({ planId, order: value.order }));

    const weeks = calculateWeeks(values.contract_start, values.contract_end);

    try {
      if (editingId) {
        await updateContract.mutateAsync({
          id: editingId,
          name: values.name,
          slug: values.slug?.trim() || null,
          contract_start: values.contract_start,
          contract_end: values.contract_end,
          weeks,
          weekly_price_override: values.weekly_price_override,
          deposit_override: values.deposit_override,
          summary: values.summary ?? null,
          display_order: values.display_order,
          cta_label: values.cta_label ?? null,
          visible_on_portal: values.visible_on_portal,
          payment_plan_ids: orderedPlans.map(p => p.planId),
          payment_plan_orders: orderedPlans.map(p => p.order),
        });
        toast({ title: "Contract updated" });
      } else {
        await createContract.mutateAsync({
          academic_year_id: values.academic_year_id,
          studio_grade_id: values.studio_grade_id,
          name: values.name,
          slug: values.slug?.trim() || undefined,
          contract_start: values.contract_start,
          contract_end: values.contract_end,
          weeks,
          weekly_price_override: values.weekly_price_override,
          deposit_override: values.deposit_override,
          summary: values.summary ?? null,
          display_order: values.display_order,
          cta_label: values.cta_label ?? null,
          visible_on_portal: values.visible_on_portal,
          is_active: true,
          payment_plan_ids: orderedPlans.map(p => p.planId),
          payment_plan_orders: orderedPlans.map(p => p.order),
        });
        toast({ title: "Contract created" });
      }
      resetState();
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: editingId ? "Unable to update contract" : "Unable to create contract",
        description: "Please check dates and pricing.",
      });
    }
  });

  return (
    <AdminLayout
      pageTitle="Contracts"
      subtitle="Manage tenancy lengths, pricing overrides and instalment plans."
      mobileActionButton={
        <div className="flex items-center gap-2 flex-shrink-0">
          {academicYears && academicYears.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full uppercase tracking-wide gap-2 flex-shrink-0 h-7 px-2 text-xs"
              onClick={() => setDuplicateDialogOpen(true)}
              disabled={duplicateContracts.isPending}
            >
              <Copy className="h-4 w-4" />
            </Button>
          )}
          <Dialog open={open} onOpenChange={(value) => {
            if (value) {
              setOpen(true);
            } else {
              resetState();
            }
          }}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="rounded-full uppercase tracking-wide gap-2 flex-shrink-0 h-7 px-2 text-xs"
                onClick={handleCreate}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
          </Dialog>
        </div>
      }
    >
      <div className="hidden lg:flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-black uppercase tracking-wide">
            Contracts
          </h2>
          <p className="text-muted-foreground text-sm">
            Manage tenancy contracts for studio grades across academic years.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {academicYears && academicYears.length > 1 && (
            <Button
              variant="outline"
              onClick={() => setDuplicateDialogOpen(true)}
              disabled={duplicateContracts.isPending}
              className="rounded-full uppercase tracking-wide gap-2"
            >
              <Copy className="h-4 w-4" />
              Duplicate from year
            </Button>
          )}
          <Dialog open={open} onOpenChange={(value) => {
            if (value) {
              setOpen(true);
            } else {
              resetState();
            }
          }}>
            <DialogTrigger asChild>
              <Button
                className="rounded-full uppercase tracking-wide"
                onClick={handleCreate}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Contract
              </Button>
            </DialogTrigger>
          </Dialog>
        </div>
      </div>
      <Card className="rounded-3xl border border-border/60 shadow-xl">
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <CardTitle className="text-lg font-display uppercase tracking-wide">
              Contract catalogue
            </CardTitle>
            {academicYears && academicYears.length > 1 && (
              <div className="flex items-center gap-2">
                <Label htmlFor="year-filter" className="text-sm text-muted-foreground whitespace-nowrap">
                  Filter by year:
                </Label>
                <Select
                  value={filterAcademicYearId || "all"}
                  onValueChange={(value) => setFilterAcademicYearId(value === "all" ? null : value)}
                >
                  <SelectTrigger id="year-filter" className="w-full lg:w-[180px]">
                    <SelectValue placeholder="All Years" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Years</SelectItem>
                    {academicYears.map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="show-custom-contracts"
                  checked={showCustomContracts}
                  onCheckedChange={(checked) => setShowCustomContracts(!!checked)}
                />
                <Label htmlFor="show-custom-contracts" className="text-sm text-muted-foreground cursor-pointer">
                  Show custom (per-application) contracts
                </Label>
              </div>
              {showCustomContracts && (
                <p className="text-xs text-muted-foreground">
                  Custom contracts are per-application; edit from application review only.
                </p>
              )}
            </div>
          </div>
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                            {contract.academic_year?.name ?? "Academic year"}
                          </p>
                          {(contract as { student_application_id?: string | null }).student_application_id && (
                            <Badge variant="secondary" className="rounded-full text-[10px] uppercase">
                              Custom
                            </Badge>
                          )}
                        </div>
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
                          · {formatContractDuration(contract)}
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
                        {(contract as { student_application_id?: string | null }).student_application_id ? (
                          <span className="text-xs text-muted-foreground italic">Edit from application review</span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-full uppercase tracking-wide gap-2"
                            onClick={() => handleEdit(contract.id)}
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </Button>
                        )}
                        {isSuperadmin && !(contract as { student_application_id?: string | null }).student_application_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-full uppercase tracking-wide gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setContractToDelete({ id: contract.id, name: contract.name })}
                            disabled={deleteContract.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        )}
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-display uppercase tracking-wide">
              {editingId ? "Update contract" : "Create contract"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form className="space-y-4" onSubmit={handleSubmit}>
              {!editingId && (
                <>
                  <FormField
                    control={form.control}
                    name="academic_year_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Academic Year</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);
                            setSelectedAcademicYearId(value);
                          }}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select academic year" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {academicYears?.map((year) => (
                              <SelectItem key={year.id} value={year.id}>
                                {year.name}
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
                        <FormLabel>Studio Grade</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select studio grade" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {studioGradesData?.grades?.map((grade) => (
                              <SelectItem key={grade.id} value={grade.id}>
                                {grade.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contract Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 45 Week Contract" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. platinum-45-weeks-25-26"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value.toLowerCase().trim())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
              <FormField
                control={form.control}
                name="visible_on_portal"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border/60 px-4 py-3 bg-muted/40">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-semibold uppercase tracking-wide">
                        Visible on room grade (student-facing)
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        When on, this contract appears on the studio grade page for students. Turn off for custom/finance/staff-only contracts.
                      </p>
                    </div>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="space-y-3">
                <div>
                  <FormLabel className="block">Available payment plans</FormLabel>
                  <p className="text-xs text-muted-foreground">
                    Choose which plans appear for this contract and define the order they will be shown to students.
                  </p>
                </div>
                <div className="space-y-2">
                  {sortedActivePlans.map((plan) => {
                    const defaultOrder = getDefaultPaymentPlanOrder(plan.name);
                    const planState = selectedPlans[plan.id] ?? {
                      selected: false,
                      order: defaultOrder < 999 ? defaultOrder : sortedActivePlans.indexOf(plan) + 1,
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
                  disabled={createContract.isPending || updateContract.isPending}
                >
                  {(createContract.isPending || updateContract.isPending) ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {editingId ? "Saving" : "Creating"}
                    </>
                  ) : (
                    editingId ? "Save changes" : "Create contract"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Duplicate Contracts Dialog */}
      <AlertDialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-display uppercase tracking-wide">
              Duplicate Contracts
            </AlertDialogTitle>
            <AlertDialogDescription>
              Copy all contracts from one academic year to another. 
              Contract dates will be adjusted by adding 1 year, and weeks will be recalculated automatically.
              Payment plans will be linked by matching names from the target year.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="source-year" className="text-sm font-medium">
                Copy from academic year
              </label>
              <Select
                value={sourceYearId}
                onValueChange={setSourceYearId}
              >
                <SelectTrigger id="source-year">
                  <SelectValue placeholder="Select source academic year" />
                </SelectTrigger>
                <SelectContent>
                  {allAcademicYears
                    ?.filter((year) => year.id !== targetYearId)
                    .map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="target-year" className="text-sm font-medium">
                Copy to academic year
              </label>
              <Select
                value={targetYearId}
                onValueChange={setTargetYearId}
              >
                <SelectTrigger id="target-year">
                  <SelectValue placeholder="Select target academic year" />
                </SelectTrigger>
                <SelectContent>
                  {allAcademicYears
                    ?.filter((year) => year.id !== sourceYearId)
                    .map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {sourceYearId && targetYearId && (
              <div className="rounded-xl bg-muted/40 p-4 space-y-2">
                <p className="text-sm font-semibold">What will be duplicated:</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>All contracts from the source year</li>
                  <li>Contract dates (start and end) will have 1 year added automatically</li>
                  <li>Weeks will be recalculated from the new dates</li>
                  <li>Pricing, summaries, and other settings will be preserved</li>
                  <li>Payment plans will be linked by matching names from the target year</li>
                  <li>You can edit all contracts after duplication</li>
                </ul>
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full uppercase tracking-wide">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!sourceYearId || !targetYearId) return;
                try {
                  const result = await duplicateContracts.mutateAsync({
                    sourceAcademicYearId: sourceYearId,
                    targetAcademicYearId: targetYearId,
                  });
                  toast({
                    title: "Contracts duplicated",
                    description: `Successfully duplicated ${result.count} contract${result.count !== 1 ? "s" : ""} from the source year.`,
                  });
                  setDuplicateDialogOpen(false);
                  setSourceYearId("");
                  setTargetYearId("");
                } catch (error: any) {
                  console.error(error);
                  toast({
                    variant: "destructive",
                    title: "Unable to duplicate contracts",
                    description: error.message || "Please try again or contact support.",
                  });
                }
              }}
              disabled={!sourceYearId || !targetYearId || duplicateContracts.isPending}
              className="rounded-full uppercase tracking-wide"
            >
              {duplicateContracts.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Duplicating...
                </>
              ) : (
                "Duplicate Contracts"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete contract (superadmin only) */}
      <AlertDialog open={!!contractToDelete} onOpenChange={(open) => !open && setContractToDelete(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-display uppercase tracking-wide">
              Delete contract
            </AlertDialogTitle>
            <AlertDialogDescription>
              {contractToDelete ? (
                <>
                  Are you sure you want to delete <strong>{contractToDelete.name}</strong>? This cannot be undone.
                  The contract can only be deleted if it has no applications linked to it.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full uppercase tracking-wide" onClick={() => setContractToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!contractToDelete) return;
                try {
                  await deleteContract.mutateAsync(contractToDelete.id);
                  toast({ title: "Contract deleted" });
                  setContractToDelete(null);
                } catch (error: unknown) {
                  const message = error instanceof Error ? error.message : "Unable to delete contract.";
                  toast({
                    variant: "destructive",
                    title: "Cannot delete contract",
                    description: message,
                  });
                }
              }}
              disabled={deleteContract.isPending || !contractToDelete}
              className="rounded-full uppercase tracking-wide bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteContract.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default Contracts;

