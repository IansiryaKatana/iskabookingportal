import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2, CalendarDays, CreditCard, FileText, MapPin, RotateCcw } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import FloatingContactRail from "@/components/FloatingContactRail";
import WhatsAppButton from "@/components/WhatsAppButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useContract } from "@/hooks/useContract";
import { useToast } from "@/hooks/use-toast";
import { useCanRebook, useMarkAsRebooking } from "@/hooks/useRebooking";
import { useBrandingSettings } from "@/hooks/useBranding";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const ContractDetail = () => {
  const location = useLocation();
  // Extract slug from pathname using wildcard route pattern
  // Pathname will be like "/contracts/gold-45-weeks-26/27" or "/contracts/gold-45-weeks-26%2F27"
  const pathMatch = location.pathname.match(/^\/contracts\/(.+)$/);
  const rawSlug = pathMatch ? pathMatch[1] : undefined;
  // Decode the slug to handle URL-encoded characters (like forward slashes)
  const slug = rawSlug ? decodeURIComponent(rawSlug) : undefined;
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { data: brandingSettings } = useBrandingSettings();
  const companyName = brandingSettings?.company_name || "StudentStaySolutions";

  const { data: contract, isLoading, isError } = useContract(slug);
  const [creating, setCreating] = useState(false);
  const [creatingRebooking, setCreatingRebooking] = useState(false);
  
  // Check if student can rebook for this contract
  const { data: rebookingCheck, isLoading: checkingRebooking, error: rebookingError } = useCanRebook(
    user?.id && contract?.id ? contract.id : undefined
  );
  const markAsRebooking = useMarkAsRebooking();

  // Debug logging
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("=== REBOOKING DEBUG ===");
      console.log("User:", user?.id ? "Logged in" : "Not logged in", user?.id);
      console.log("Contract:", contract?.id ? "Loaded" : "Not loaded", contract?.id, contract?.name);
      console.log("Hook enabled:", !!(user?.id && contract?.id));
      console.log("Rebooking check result:", rebookingCheck);
      console.log("Is loading:", checkingRebooking);
      console.log("Error:", rebookingError);
      console.log("Can show rebooking:", !!(user && rebookingCheck?.can_rebook && rebookingCheck.previous_application_id));
      console.log("=======================");
    }
  }, [user?.id, contract?.id, contract?.name, rebookingCheck, checkingRebooking, rebookingError]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [slug]);

  const planOptions = useMemo(() => {
    if (!contract?.contract_payment_plans?.length) return [];
    return contract.contract_payment_plans
      .filter((link) => link.payment_plan)
      .sort(
        (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
      );
  }, [contract]);

  const [resolvedPlanOptions, setResolvedPlanOptions] = useState<ContractPaymentPlanDetail[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);

  useEffect(() => {
    if (!contract?.id) {
      setResolvedPlanOptions([]);
      setActivePlanId(null);
      return;
    }

    if (planOptions.length) {
      setResolvedPlanOptions(planOptions);
      setActivePlanId((prev) => {
        if (prev && planOptions.some((plan) => plan.payment_plan_id === prev)) {
          return prev;
        }
        return planOptions[0].payment_plan_id ?? null;
      });
      return;
    }

    let cancelled = false;
    const fetchFallbackPlans = async () => {
      setPlansLoading(true);
      try {
        const { data, error } = await supabase
          .from("contract_payment_plans")
          .select(
            `
              *,
              payment_plan:payment_plans (
                *,
                payment_plan_installments:payment_plan_installments (*)
              )
            `,
          )
          .eq("contract_id", contract.id)
          .order("display_order");

        let rows = (data as ContractPaymentPlanDetail[]) ?? [];

        if (!rows.length && contract.payment_plan_id) {
          const { data: legacyPlan, error: legacyError } = await supabase
            .from("payment_plans")
            .select(
              `
                *,
                payment_plan_installments:payment_plan_installments (*)
              `,
            )
            .eq("id", contract.payment_plan_id)
            .maybeSingle();

          if (!legacyError && legacyPlan) {
            rows = [
              {
                id: `${contract.id}-${legacyPlan.id}`,
                contract_id: contract.id,
                payment_plan_id: legacyPlan.id,
                display_order: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                payment_plan: legacyPlan,
              } as ContractPaymentPlanDetail,
            ];
          }
        }

        if (!cancelled) {
          setResolvedPlanOptions(rows);
          setActivePlanId(rows[0]?.payment_plan_id ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load contract payment plans", error);
          setResolvedPlanOptions([]);
          setActivePlanId(null);
        }
      } finally {
        if (!cancelled) {
          setPlansLoading(false);
        }
      }
    };

    fetchFallbackPlans();

    return () => {
      cancelled = true;
    };
  }, [contract, planOptions]);

  useEffect(() => {
    if (!resolvedPlanOptions.length) {
      setActivePlanId(null);
      return;
    }
    setActivePlanId((prev) => {
      if (prev && resolvedPlanOptions.some((plan) => plan.payment_plan_id === prev)) {
        return prev;
      }
      return resolvedPlanOptions[0].payment_plan_id ?? null;
    });
  }, [resolvedPlanOptions]);

  const activePlan = useMemo(
    () =>
      resolvedPlanOptions.find((plan) => plan.payment_plan_id === activePlanId) ??
      resolvedPlanOptions[0] ??
      null,
    [resolvedPlanOptions, activePlanId],
  );

  /** Calculated due date for student reference: contract start + offset days. */
  const getDueDateFromOffset = (contractStart: string | undefined, offsetDays: number | null | undefined): string | null => {
    if (!contractStart || offsetDays == null || offsetDays === "" || Number.isNaN(Number(offsetDays))) return null;
    const start = new Date(contractStart);
    if (Number.isNaN(start.getTime())) return null;
    const d = new Date(start);
    d.setDate(d.getDate() + Number(offsetDays));
    return format(d, "d MMM yyyy");
  };

  const activeSchedule = useMemo(() => {
    if (!activePlan?.payment_plan?.payment_plan_installments?.length) return [];
    return activePlan.payment_plan.payment_plan_installments
      .slice()
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
      .map((item) => {
        const amountLabel =
          item.amount_type === "percentage"
            ? `${item.amount_value}% of remaining balance`
            : `£${item.amount_value.toLocaleString("en-GB", {
                minimumFractionDigits: 2,
              })}`;
        const dueLabel = item.due_date
          ? `Due ${format(new Date(item.due_date), "d MMM yyyy")}`
          : item.due_date_offset_days !== null
          ? item.due_date_offset_days < 0
            ? `Due ${Math.abs(item.due_date_offset_days)} days before contract start`
            : item.due_date_offset_days === 0
            ? "Due on contract start date"
            : `Due ${item.due_date_offset_days} days after contract start`
          : "Schedule to be confirmed";
        const dueDateFormatted = item.due_date
          ? null
          : getDueDateFromOffset(contract?.contract_start, item.due_date_offset_days);
        return {
          id: item.id,
          label: item.label ?? `Instalment ${item.sequence ?? ""}`.trim(),
          amountLabel,
          dueLabel,
          dueDateFormatted,
        };
      });
  }, [activePlan, contract?.contract_start]);

  const depositAmount = useMemo(() => {
    if (typeof contract?.deposit_override === "number") {
      return contract.deposit_override;
    }
    if (typeof activePlan?.payment_plan?.deposit_amount === "number") {
      return activePlan.payment_plan.deposit_amount;
    }
    return null;
  }, [contract?.deposit_override, activePlan]);

  const handleEnquire = async () => {
    if (!contract) return;

    if (!user) {
      navigate("/portal/login", {
        state: { redirect: `/contracts/${encodeURIComponent(contract.slug)}` },
      });
      return;
    }

    if ((profile?.role ?? "student") !== "student") {
      toast({
        variant: "destructive",
        title: "Staff account detected",
        description: "Please log in with a student account to continue.",
      });
      return;
    }

    setCreating(true);
    try {
      const { data: existing, error: selectError } = await supabase
        .from("student_applications")
        .select("id,status")
        .eq("student_id", user.id)
        .eq("contract_id", contract.id)
        .maybeSingle();

      if (selectError) throw selectError;

      if (existing) {
        navigate(
          `/portal/applications/${existing.id}/select-studio`,
          { replace: true },
        );
        return;
      }

      const { data: inserted, error: insertError } = await supabase
        .from("student_applications")
        .insert({
          student_id: user.id,
          studio_grade_id: contract.studio_grade_id,
          contract_id: contract.id,
          status: "draft",
        })
        .select("id")
        .maybeSingle();

      if (insertError) throw insertError;
      if (!inserted) throw new Error("Failed to create application");

      toast({
        title: "Application started",
        description: "Resume your booking journey to complete the steps.",
      });

      navigate(
        `/portal/applications/${inserted.id}/select-studio`,
        { replace: true },
      );
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Unable to proceed",
        description: `Please try again later or contact the ${companyName} team.`,
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRebook = async () => {
    if (!contract || !rebookingCheck?.can_rebook || !rebookingCheck.previous_application_id) return;

    if (!user) {
      navigate("/portal/login", {
        state: { redirect: `/contracts/${encodeURIComponent(contract.slug)}` },
      });
      return;
    }

    setCreatingRebooking(true);
    try {
      // Check if application already exists
      const { data: existing, error: selectError } = await supabase
        .from("student_applications")
        .select("id,status")
        .eq("student_id", user.id)
        .eq("contract_id", contract.id)
        .maybeSingle();

      if (selectError) throw selectError;

      if (existing) {
        // If exists, mark it as rebooking
        await markAsRebooking.mutateAsync({
          applicationId: existing.id,
          previousApplicationId: rebookingCheck.previous_application_id,
          reason: `Rebooking for ${contract.name}`,
        });
        navigate(
          `/portal/applications/${existing.id}/select-studio`,
          { replace: true },
        );
        return;
      }

      // Create new application
      const { data: inserted, error: insertError } = await supabase
        .from("student_applications")
        .insert({
          student_id: user.id,
          studio_grade_id: contract.studio_grade_id,
          contract_id: contract.id,
          status: "draft",
          is_rebooking: true,
          booking_source: "rebooker",
          previous_application_id: rebookingCheck.previous_application_id,
          rebooking_reason: `Rebooking for ${contract.name}`,
        })
        .select("id")
        .maybeSingle();

      if (insertError) throw insertError;
      if (!inserted) throw new Error("Failed to create rebooking application");

      toast({
        title: "Rebooking started",
        description: "Your previous application data will be used to pre-fill this form.",
      });

      navigate(
        `/portal/applications/${inserted.id}/select-studio`,
        { replace: true },
      );
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Unable to proceed",
        description: `Please try again later or contact the ${companyName} team.`,
      });
    } finally {
      setCreatingRebooking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <section className="relative overflow-hidden flex items-center min-h-[340px]">
          <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
          <div className="container mx-auto px-4 max-w-5xl relative z-10 flex flex-col items-center justify-center gap-4 py-16">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-10 w-72" />
          </div>
        </section>
        <main className="container mx-auto px-4 max-w-5xl py-12 space-y-10">
          <div className="grid gap-6 md:grid-cols-[2fr,1fr]">
            <Card className="rounded-3xl shadow-xl border border-border/60">
              <CardHeader className="space-y-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-32" />
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-44" />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <Skeleton className="h-24 w-full rounded-2xl" />
                  <Skeleton className="h-24 w-full rounded-2xl" />
                </div>
                <Skeleton className="h-52 w-full rounded-2xl" />
              </CardContent>
            </Card>
            <Card className="rounded-3xl shadow-xl border border-border/60">
              <CardHeader className="space-y-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-32 w-full rounded-2xl" />
                <Skeleton className="h-12 w-full rounded-full" />
                <Skeleton className="h-10 w-full rounded-full" />
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (isError || !contract) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 max-w-4xl py-24">
          <Card className="rounded-3xl border-dashed">
            <CardHeader>
              <CardTitle className="text-2xl font-display uppercase tracking-wide">
                Contract Unavailable
              </CardTitle>
              <CardDescription>
                This contract is no longer active. Return to the studio page to
                view current availability.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="rounded-full uppercase tracking-wide"
                variant="outline"
                onClick={() => {
                  const studioSlug = contract?.studio_grade?.slug ?? "";
                  if (studioSlug && contract?.academic_year?.name) {
                    const yearPath = contract.academic_year.name.replace(/\//g, "-");
                    navigate(`/studios/${yearPath}/${studioSlug}`);
                  } else if (studioSlug) {
                    navigate(`/studios/${studioSlug}`);
                  }
                }}
              >
                Back to studio grade
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  const weeklyPrice = contract.weekly_price_override;

  return (
    <div className="min-h-screen bg-background">
      <Navigation compactLogo />
      <section className="relative overflow-hidden flex items-center min-h-[340px] bg-black">
        {/* Red + yellow gradient orbs - clearly visible */}
        <div
          className="pointer-events-none absolute -left-32 top-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-red-500/50 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-32 top-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-amber-400/45 blur-3xl"
          aria-hidden="true"
        />
        {/* Subtle gradient overlay so text stays readable */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/50"
          aria-hidden="true"
        />
        <div className="container mx-auto px-4 max-w-5xl relative z-10 flex flex-col items-center justify-center text-center gap-3 py-16">
          <p className="text-xs uppercase tracking-[0.3em] text-white/80">
            {contract.studio_grade?.name} ·{" "}
            {contract.academic_year?.name ?? "Academic year"}
          </p>
          <h1 className="text-4xl md:text-5xl font-display font-black uppercase tracking-wide text-white max-w-3xl">
            {contract.name}
          </h1>
        </div>
      </section>

      <main className="container mx-auto px-4 max-w-5xl py-12 space-y-10">
        <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <Card className="rounded-3xl shadow-xl border border-border/60">
            <CardHeader>
              <CardTitle className="text-xl font-display uppercase tracking-wide flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Contract Dates
              </CardTitle>
              <CardDescription>
                {format(new Date(contract.contract_start), "d MMM yyyy")} to{" "}
                {format(new Date(contract.contract_end), "d MMM yyyy")} ·{" "}
                {contract.weeks} weeks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                  Weekly price
                </h3>
                <p className="text-3xl font-bold">
                  {weeklyPrice
                    ? `£${weeklyPrice.toLocaleString("en-GB")} PP/PW`
                    : "Price on enquiry"}
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {/* Deposit card */}
                <Card className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-red-50 via-background to-red-50 shadow-sm hover:shadow-md transition-shadow">
                  <div className="pointer-events-none absolute inset-x-8 -top-8 h-20 rounded-full bg-primary/5 blur-2xl" />
                  <CardHeader className="pb-1 relative z-10">
                    <CardTitle className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <CreditCard className="h-3.5 w-3.5" />
                      </span>
                      <span>Deposit</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="relative z-10 flex flex-col gap-1">
                    <p className="text-2xl font-semibold text-foreground">
                      {typeof depositAmount === "number"
                        ? `£${depositAmount.toLocaleString("en-GB", {
                            minimumFractionDigits: 2,
                          })}`
                        : "To be confirmed"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {typeof depositAmount === "number"
                        ? "Payable separately to secure this contract; not deducted from your rent."
                        : "Deposit charged at booking once your contract is prepared."}
                    </p>
                  </CardContent>
                </Card>

                {/* Studio grade card */}
                <Card className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-red-50 via-background to-red-50 shadow-sm hover:shadow-md transition-shadow">
                  <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-primary/5 blur-3xl" />
                  <CardHeader className="pb-1 relative z-10">
                    <CardTitle className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <MapPin className="h-3.5 w-3.5" />
                      </span>
                      <span>Studio grade</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="relative z-10 flex flex-col gap-1">
                    <p className="text-2xl font-semibold text-foreground">
                      {contract.studio_grade?.name}
                    </p>
                    {contract.academic_year?.name && (
                      <p className="text-xs text-muted-foreground">
                        {contract.academic_year.name}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-3">
                {plansLoading ? (
                  <div className="rounded-2xl border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground">
                    Loading payment plans…
                  </div>
                ) : resolvedPlanOptions.length > 0 ? (
                  <Tabs
                    value={
                      activePlanId ?? resolvedPlanOptions[0].payment_plan_id ?? "default"
                    }
                    onValueChange={(value) => setActivePlanId(value)}
                    className="w-full"
                  >
                    <div className="flex flex-col gap-3">
                      <h3 className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                        Payment schedule
                      </h3>
                      {resolvedPlanOptions.length > 1 && (
                        <TabsList className="bg-muted rounded-full p-1 flex gap-1 flex-wrap w-full border border-border/60 shadow-inner">
                          {resolvedPlanOptions.map((plan) => (
                            <TabsTrigger
                              key={plan.id}
                              value={plan.payment_plan_id ?? plan.id}
                              className="rounded-full px-3 py-1 text-xs uppercase tracking-wide flex-1 min-w-0 border border-transparent transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm data-[state=active]:border-primary"
                            >
                              <span className="truncate">{plan.payment_plan?.name ?? "Plan"}</span>
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      )}
                    </div>
                      {resolvedPlanOptions.map((plan) => {
                      const installments = plan.payment_plan?.payment_plan_installments ?? [];
                      const schedule =
                        installments
                          .slice()
                          .sort(
                            (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
                          )
                          .map((item) => {
                            const amountLabel =
                              item.amount_type === "percentage"
                                ? `${item.amount_value}% of contract total`
                                : `£${item.amount_value.toLocaleString("en-GB", {
                                    minimumFractionDigits: 2,
                                  })}`;
                            const dueLabel = item.due_date
                              ? `Due ${format(
                                  new Date(item.due_date),
                                  "d MMM yyyy",
                                )}`
                              : item.due_date_offset_days !== null
                              ? item.due_date_offset_days < 0
                                ? `Due ${Math.abs(
                                    item.due_date_offset_days,
                                  )} days before contract start`
                                : item.due_date_offset_days === 0
                                ? "Due on contract start date"
                                : `Due ${item.due_date_offset_days} days after contract start`
                              : "Schedule to be confirmed";
                            const dueDateFormatted = item.due_date
                              ? null
                              : getDueDateFromOffset(contract?.contract_start, item.due_date_offset_days);
                            return {
                              id: item.id,
                              label:
                                item.label ??
                                `Instalment ${item.sequence ?? ""}`.trim(),
                              amountLabel,
                              dueLabel,
                              dueDateFormatted,
                            };
                          }) ?? [];

                      return (
                        <TabsContent
                          key={plan.id}
                          value={plan.payment_plan_id ?? plan.id}
                          className="mt-3"
                        >
                          <div className="space-y-3">
                            {plan.payment_plan?.description && (
                              <p className="text-xs text-muted-foreground">
                                {plan.payment_plan.description}
                              </p>
                            )}
                            <div className="space-y-3">
                              {schedule.length > 0 ? (
                                schedule.map((item, index) => (
                                  <div
                                    key={item.id ?? index}
                                    className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                                  >
                                    <span className="text-sm font-medium tracking-wide uppercase">
                                      {item.label}
                                    </span>
                                    <div className="text-left sm:text-right">
                                      <p className="text-sm font-semibold">
                                        {item.amountLabel}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {item.dueLabel}
                                      </p>
                                      {item.dueDateFormatted && (
                                        <p className="text-xs font-medium text-foreground/90 mt-0.5">
                                          {item.dueDateFormatted}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Instalment plan details will appear here once configured.
                                </p>
                              )}
                            </div>
                          </div>
                        </TabsContent>
                      );
                    })}
                  </Tabs>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground">
                    Instalment plan details will appear here once configured.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-border/60 shadow-lg overflow-hidden lg:sticky lg:top-24 lg:self-start">
            {/* Red Top Section with Button */}
            <div className="bg-primary text-white p-6 space-y-4">
              {/* Rebooking Alert */}
              {user && rebookingCheck?.can_rebook && rebookingCheck.previous_application_id && (
                <Alert className="border-white/30 bg-white/10 text-white">
                  <RotateCcw className="h-4 w-4 text-white" />
                  <AlertTitle className="font-semibold text-white">Rebooking Available</AlertTitle>
                  <AlertDescription className="text-sm mt-1 text-white/90">
                    {rebookingCheck.message}
                    {rebookingCheck.previous_contract_name && (
                      <span className="block mt-1 text-xs text-white/70">
                        Previous: {rebookingCheck.previous_contract_name} ({rebookingCheck.previous_academic_year})
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Rebooking Button */}
              {user && rebookingCheck?.can_rebook && rebookingCheck.previous_application_id ? (
                <Button
                  className="w-full rounded-full uppercase tracking-wide bg-white text-primary hover:bg-white/90"
                  size="lg"
                  onClick={handleRebook}
                  disabled={creatingRebooking || checkingRebooking}
                >
                  {creatingRebooking ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Starting rebooking
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Rebook for This Contract
                    </>
                  )}
                </Button>
              ) : null}

              {/* Regular Booking Button */}
              <Button
                className="w-full rounded-full uppercase tracking-wide bg-white text-primary hover:bg-white/90"
                size="lg"
                onClick={handleEnquire}
                disabled={creating || creatingRebooking}
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Preparing your application
                  </>
                ) : (
                  "Start Booking Journey"
                )}
              </Button>
            </div>

            <CardContent className="space-y-6 pt-6">
              <div className="space-y-4">
                <div>
                  <CardTitle className="text-base font-display uppercase tracking-wide mb-2">
                    Secure this contract
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    Log in or create an account to begin your booking journey and reserve a studio.
                  </CardDescription>
                </div>

                <div className="space-y-4 pt-4">
                  <h3 className="text-xs uppercase tracking-[0.25em] text-muted-foreground font-semibold">
                    Your booking steps
                  </h3>
                  <div className="space-y-3">
                    <div className="rounded-2xl bg-muted/30 border border-border/50 p-4">
                      <p className="font-semibold uppercase tracking-wide text-xs mb-1.5">
                        Complete Your Booking Profile
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Enter your personal, academic, and guarantor details. Upload required documents with drag-and-drop simplicity.
                      </p>
                    </div>
                    <div className="rounded-2xl bg-muted/30 border border-border/50 p-4">
                      <p className="font-semibold uppercase tracking-wide text-xs mb-1.5">
                        Pay Deposit & Sign Digitally
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Make your secure deposit payment via Stripe. We'll prepare your tenancy agreement for digital signing.
                      </p>
                    </div>
                    <div className="rounded-2xl bg-muted/30 border border-border/50 p-4">
                      <p className="font-semibold uppercase tracking-wide text-xs mb-1.5">
                        Allocation & Move-In
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Once verified, your studio will be allocated and you'll receive full move-in instructions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
      <FloatingContactRail />
      <WhatsAppButton />
    </div>
  );
};

export default ContractDetail;

