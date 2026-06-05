import { useMemo, useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, CreditCard, Calendar, CheckCircle2, Clock, AlertCircle, Gift, Percent, FileDown, Banknote, XCircle, History } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { useStudentApplicationsList } from "@/hooks/useStudentApplications";
import { useStudentPayments } from "@/hooks/useStudentPayments";
import { useApplicationCashback } from "@/hooks/useCashback";
import { useApplicationDiscount } from "@/hooks/useDiscount";
import { usePaymentSummary, useUnifiedPayments, useInstallmentBreakdown } from "@/hooks/useUnifiedPayments";
import { useManualPaymentRequests, useManualPaymentRequestHistory } from "@/hooks/useManualPaymentRequests";
import ManualPaymentRequestDialog from "@/components/portal/ManualPaymentRequestDialog";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format, isPast, isToday, isFuture } from "date-fns";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import StripePaymentForm from "@/components/StripePaymentForm";
import { supabase } from "@/integrations/supabase/client";
import { invokeCreatePayment } from "@/utils/invokeCreatePayment";
import { getEffectiveWeeks } from "@/utils/contractDuration";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";

const Payments = () => {
  const navigate = useNavigate();
  const { user, clearSessionIfExpired } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [selectedInstalment, setSelectedInstalment] = useState<{
    applicationId: string;
    instalmentId: string;
    baseAmount: number;
    processingFee: number;
    totalChargeAmount: number;
    label: string;
  } | null>(null);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);
  const [creatingIntentId, setCreatingIntentId] = useState<string | null>(null);
  const [paidInstalmentIds, setPaidInstalmentIds] = useState<Set<string>>(new Set());
  const [isLoadingPaidStatus, setIsLoadingPaidStatus] = useState(true);
  const isInitialPaidStatusLoad = useRef(true);

  // Load Stripe publishable key from backend (same as ApplicationWizard) so it always matches
  // STRIPE_SECRET_KEY and avoids 400 from elements/sessions when key is missing or test/live mismatch.
  useEffect(() => {
    let mounted = true;
    const loadKey = async () => {
      const { data, error } = await supabase.functions.invoke<{ publishableKey?: string }>("get-publishable-key");
      if (!mounted) return;
      if (error || data?.error) {
        console.error("Payments: failed to load Stripe publishable key", error ?? data?.error);
        return;
      }
      if (data?.publishableKey) {
        setStripePromise(loadStripe(data.publishableKey));
      }
    };
    loadKey();
    return () => { mounted = false; };
  }, []);

  const {
    data: applications,
    isLoading: applicationsLoading,
  } = useStudentApplicationsList(user?.id);

  // Get confirmed applications only
  const confirmedApplications = useMemo(
    () => applications?.filter((app) => app.status === "confirmed") ?? [],
    [applications],
  );

  // Fetch paid instalments from Stripe immediately on load
  // IMPORTANT: Only poll when payment form is NOT open to prevent disrupting user input
  useEffect(() => {
    const fetchPaidInstalments = async () => {
      // Don't poll if payment form is open - it disrupts user input
      if (paymentClientSecret || selectedInstalment) {
        return;
      }
      
      if (confirmedApplications.length === 0) {
        setIsLoadingPaidStatus(false);
        isInitialPaidStatusLoad.current = false;
        return;
      }
      // Only show full-page loading on first load; polling runs in background without skeleton
      if (isInitialPaidStatusLoad.current) {
        setIsLoadingPaidStatus(true);
      }
      const allPaidIds = new Set<string>();
      
      // Fetch all payment statuses in parallel for faster loading
      const paymentStatusPromises = confirmedApplications.map(async (app) => {
        try {
          const { data, error } = await supabase.functions.invoke("check-payment-status", {
            body: { applicationId: app.id },
          });

          if (!error && data?.paidInstalments) {
            data.paidInstalments.forEach((pi: { instalmentId: string }) => {
              allPaidIds.add(pi.instalmentId);
            });
          }
        } catch (error) {
          console.error(`Error fetching payment status for ${app.id}:`, error);
        }
      });

      await Promise.all(paymentStatusPromises);

      // Refetch payment summary and unified payments so remaining balance updates
      // (e.g. after admin approves manual payment). Use refetchQueries so data updates
      // even when paid IDs didn't change (invalidate alone only marks stale; refetch runs now).
      confirmedApplications.forEach((app) => {
        queryClient.invalidateQueries({ queryKey: ["payment-summary", app.id] });
        queryClient.invalidateQueries({ queryKey: ["unified-payments", app.id] });
        queryClient.invalidateQueries({ queryKey: ["installment-breakdown", app.id] });
        void queryClient.refetchQueries({ queryKey: ["payment-summary", app.id] });
        void queryClient.refetchQueries({ queryKey: ["unified-payments", app.id] });
        void queryClient.refetchQueries({ queryKey: ["installment-breakdown", app.id] });
      });

      // Only update state if data actually changed (invisible polling)
      // This prevents unnecessary re-renders when polling finds no changes
      setPaidInstalmentIds((prevIds) => {
        const prevArray = Array.from(prevIds).sort();
        const newArray = Array.from(allPaidIds).sort();
        // Compare arrays - only update if different
        if (prevArray.length !== newArray.length || 
            prevArray.some((id, idx) => id !== newArray[idx])) {
          return allPaidIds; // Data changed, update state
        }
        return prevIds; // No changes, keep existing state (no re-render = invisible)
      });
      setIsLoadingPaidStatus(false);
      isInitialPaidStatusLoad.current = false;
    };

    fetchPaidInstalments();
    // Only poll when payment form is closed - longer interval to reduce disruption
    // Poll every 30 seconds when form is closed, but stop when form is open
    const interval = setInterval(() => {
      // Only poll if payment form is not active
      if (!paymentClientSecret && !selectedInstalment) {
        fetchPaidInstalments();
      }
    }, 30000); // 30 seconds - less aggressive
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedApplications.length, paymentClientSecret, selectedInstalment]); // Include payment state to stop polling when form is open

  const createInstalmentPaymentIntent = async (
    applicationId: string,
    instalmentId: string,
    baseAmount: number,
    label: string,
  ) => {
    if (import.meta.env.DEV) console.log("Creating instalment payment intent:", {
      applicationId,
      instalmentId,
      amount,
      label,
    });
    
    setCreatingIntentId(instalmentId);
    try {
      const { data, error } = await invokeCreatePayment({
        applicationId,
        amount: baseAmount,
        type: "instalment",
        label,
        instalmentId,
      });

      if (error) {
        console.error("Error from create-payment function:", error);
        throw error;
      }

      if (!data?.clientSecret) {
        throw new Error("No client secret returned");
      }

      if (import.meta.env.DEV) console.log("Payment intent created successfully:", {
        clientSecret: data.clientSecret?.substring(0, 20) + "...",
        amount: data.amount,
        baseAmount: data.baseAmount,
        processingFee: data.processingFee,
        currency: data.currency,
      });

      const totalChargePence = data.totalChargeAmount ?? data.amount;
      const baseAmountPence = data.baseAmount ?? Math.round(baseAmount * 100);
      const processingFeePence = data.processingFee ?? Math.max(0, totalChargePence - baseAmountPence);
      setSelectedInstalment({
        applicationId,
        instalmentId,
        baseAmount: baseAmountPence / 100,
        processingFee: processingFeePence / 100,
        totalChargeAmount: totalChargePence / 100,
        label,
      });
      setPaymentClientSecret(data.clientSecret);
    } catch (error) {
      console.error("Error creating payment intent:", error);
      const cleared = await clearSessionIfExpired(error);
      toast({
        variant: "destructive",
        title: cleared ? "Session expired" : "Payment error",
        description: cleared
          ? "Please sign in again to continue."
          : (error && typeof error === "object" && "message" in error ? (error as { message: string }).message : "Unable to create payment. Please try again."),
      });
      setCreatingIntentId(null);
      setSelectedInstalment(null);
    }
  };

  const handlePayInstalment = async (
    applicationId: string,
    instalmentId: string,
    amount: number,
    label: string,
  ) => {
    await createInstalmentPaymentIntent(applicationId, instalmentId, amount, label);
  };

  const handlePaymentSuccess = async (paymentIntentId?: string) => {
    const currentInstalment = selectedInstalment;
    
    if (import.meta.env.DEV) console.log("Payment success callback triggered", { 
      instalmentId: currentInstalment?.instalmentId,
      paymentIntentId,
      applicationId: currentInstalment?.applicationId,
    });

    if (!paymentIntentId) {
      toast({
        variant: "destructive",
        title: "Payment not confirmed",
        description: "We could not verify your instalment with Stripe. Please try again.",
      });
      return;
    }
    
    setPaymentClientSecret(null);
    setSelectedInstalment(null);
    setCreatingIntentId(null);
    
    // Immediately sync payment from Stripe to ensure it's in the database
    let syncSucceeded = false;
    if (currentInstalment && paymentIntentId) {
      try {
        if (import.meta.env.DEV) console.log("Immediately syncing payment from Stripe:", paymentIntentId);
        const { data: syncData, error: syncError } = await supabase.functions.invoke("sync-payment-from-stripe", {
          body: {
            applicationId: currentInstalment.applicationId,
            paymentIntentId: paymentIntentId,
          },
        });

        if (syncError) {
          console.error("Sync error:", syncError);
        } else if (syncData?.verified === false) {
          toast({
            variant: "destructive",
            title: "Payment not confirmed",
            description: "Stripe has not confirmed this instalment yet. Please wait and refresh.",
          });
          return;
        } else if (syncData?.synced && syncData.synced > 0) {
          if (import.meta.env.DEV) console.log("Payment synced successfully:", syncData);
          syncSucceeded = true;
        } else {
          toast({
            variant: "destructive",
            title: "Payment not confirmed",
            description: "We could not record your instalment yet. Please refresh in a moment.",
          });
          return;
        }
      } catch (syncErr) {
        console.error("Error syncing payment:", syncErr);
        toast({
          variant: "destructive",
          title: "Unable to verify payment",
          description: "Please refresh shortly to check whether your instalment was recorded.",
        });
        return;
      }
    }

    if (currentInstalment) {
      setPaidInstalmentIds((prev) => {
        const newSet = new Set(prev);
        newSet.add(currentInstalment.instalmentId);
        return newSet;
      });
    }

    toast({
      title: "Payment successful",
      description: "Your instalment has been processed successfully. Updating payment history...",
    });
    
    // Immediately invalidate and refetch React Query caches
    if (currentInstalment) {
      // Invalidate payment history, summary, and per-instalment breakdown queries
      queryClient.invalidateQueries({ queryKey: ["unified-payments", currentInstalment.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["payment-summary", currentInstalment.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["student-payments", currentInstalment.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["installment-breakdown", currentInstalment.applicationId] });
      
      // Also invalidate all payments queries (for admin view)
      queryClient.invalidateQueries({ queryKey: ["all-payments"] });
      
      // Force immediate refetch and wait for it
      const refetchResults = await Promise.all([
        queryClient.refetchQueries({ queryKey: ["unified-payments", currentInstalment.applicationId] }),
        queryClient.refetchQueries({ queryKey: ["payment-summary", currentInstalment.applicationId] }),
        queryClient.refetchQueries({ queryKey: ["installment-breakdown", currentInstalment.applicationId] }),
      ]);
      
      if (import.meta.env.DEV) console.log("Refetch results:", refetchResults);
      
      // If sync didn't work, try again after a short delay (webhook might have processed it)
      if (!syncSucceeded && paymentIntentId) {
        setTimeout(async () => {
          if (import.meta.env.DEV) console.log("Retrying sync after delay:", paymentIntentId);
          try {
            const { data: syncData, error: syncError } = await supabase.functions.invoke("sync-payment-from-stripe", {
              body: {
                applicationId: currentInstalment.applicationId,
                paymentIntentId: paymentIntentId,
              },
            });
            
            if (syncError) {
              console.error("Retry sync error:", syncError);
            } else if (syncData?.synced && syncData.synced > 0) {
              if (import.meta.env.DEV) console.log("Payment synced on retry:", syncData);
              // Refetch again after successful sync
              queryClient.invalidateQueries({ queryKey: ["unified-payments", currentInstalment.applicationId] });
              queryClient.invalidateQueries({ queryKey: ["payment-summary", currentInstalment.applicationId] });
              queryClient.invalidateQueries({ queryKey: ["installment-breakdown", currentInstalment.applicationId] });
              await queryClient.refetchQueries({ queryKey: ["unified-payments", currentInstalment.applicationId] });
              await queryClient.refetchQueries({ queryKey: ["installment-breakdown", currentInstalment.applicationId] });
            }
          } catch (err) {
            console.error("Retry sync error:", err);
          }
        }, 3000); // 3 second delay for webhook to process
      }
      
      // Final refetch after a delay to catch any webhook-processed payments
      setTimeout(async () => {
        // Final refetch to ensure UI is up to date
        queryClient.invalidateQueries({ queryKey: ["unified-payments", currentInstalment.applicationId] });
        queryClient.invalidateQueries({ queryKey: ["payment-summary", currentInstalment.applicationId] });
        queryClient.invalidateQueries({ queryKey: ["student-payments", currentInstalment.applicationId] });
        queryClient.invalidateQueries({ queryKey: ["installment-breakdown", currentInstalment.applicationId] });
        queryClient.invalidateQueries({ queryKey: ["all-payments"] });
      }, 5000); // 5 second final check
    }
  };

  const getInstalmentStatus = (
    instalment: { id: string; due_date: string; label?: string | null; sequence: number },
    application: { 
      deposit_payment_intent_id?: string | null;
      student_application_steps?: Array<{ step_number: number; payload: Record<string, unknown> }>;
    },
  ) => {
    // Check if this instalment has been paid (from Stripe payment intents)
    // This is the primary check for installment payments
    if (paidInstalmentIds.has(instalment.id)) {
      return { status: "paid", label: "Paid", color: "default" as const };
    }

    // IMPORTANT: Deposits are NOT in the payment schedule - they're tracked separately
    // Only check label for "deposit" if it explicitly says so (not sequence 1)
    // For Pay in Full, sequence 1 is the installment, NOT the deposit
    const isDeposit = instalment.label?.toLowerCase().includes("deposit");
    
    // Only check deposit status if label explicitly says "deposit"
    // This should rarely happen since deposits are usually separate
    if (isDeposit) {
      if (application.deposit_payment_intent_id?.startsWith("manual-")) {
        return { status: "paid", label: "Paid", color: "default" as const };
      }
    }

    // For installments (not deposits), check based on due date
    const date = new Date(instalment.due_date);
    if (isPast(date) && !isToday(date)) {
      return { status: "overdue", label: "Overdue", color: "destructive" as const };
    }
    if (isToday(date)) {
      return { status: "due", label: "Due Today", color: "default" as const };
    }
    if (isFuture(date)) {
      return { status: "upcoming", label: "Upcoming", color: "secondary" as const };
    }
    // Default to unpaid if no other status applies
    return { status: "upcoming", label: "Upcoming", color: "secondary" as const };
  };

  const PaymentsSkeleton = () => (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Card className="rounded-3xl border border-border/60 shadow-xl">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-border/60 p-4 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <div className="flex flex-wrap items-center gap-6">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
                <Skeleton className="h-10 w-24 rounded-full" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );

  if (applicationsLoading || isLoadingPaidStatus) {
    return (
      <PortalLayout>
        <PaymentsSkeleton />
      </PortalLayout>
    );
  }

  if (confirmedApplications.length === 0) {
    return (
      <PortalLayout>
        <Card className="rounded-3xl border-dashed">
          <CardHeader>
            <CardTitle className="text-2xl font-display uppercase tracking-wide">
              No Payments Due
            </CardTitle>
            <CardDescription>
              You don't have any confirmed applications with payment schedules yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="rounded-full uppercase tracking-wide"
              onClick={() => navigate("/portal")}
            >
              View Applications
            </Button>
          </CardContent>
        </Card>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-display font-black uppercase tracking-wide">
            Payments
          </h2>
          <p className="text-muted-foreground text-sm mt-2">
            View and pay your instalments for confirmed bookings.
          </p>
        </div>

        {confirmedApplications.map((app) => (
          <PaymentCard
            key={app.id}
            application={app}
            paidInstalmentIds={paidInstalmentIds}
            selectedInstalment={selectedInstalment}
            paymentClientSecret={paymentClientSecret}
            creatingIntentId={creatingIntentId}
            onPayInstalment={handlePayInstalment}
            onPaymentSuccess={(paymentIntentId?: string) => handlePaymentSuccess(paymentIntentId)}
            onCancelPayment={() => {
              setPaymentClientSecret(null);
              setSelectedInstalment(null);
              setCreatingIntentId(null);
            }}
            getInstalmentStatus={getInstalmentStatus}
            stripePromise={stripePromise}
          />
        ))}

        {/* Payment History Section */}
        {confirmedApplications.length > 0 && (
          <PaymentHistorySection applications={confirmedApplications} />
        )}
      </div>
    </PortalLayout>
  );
};

type PaymentCardProps = {
  application: {
    id: string;
    deposit_payment_intent_id?: string | null;
    student_application_steps?: Array<{ step_number: number; payload: Record<string, unknown> }>;
    contract: {
      name: string | null;
      studio_grade: { name: string } | null;
    } | null;
  };
  paidInstalmentIds: Set<string>;
  selectedInstalment: {
    applicationId: string;
    instalmentId: string;
    baseAmount: number;
    processingFee: number;
    totalChargeAmount: number;
    label: string;
  } | null;
  paymentClientSecret: string | null;
  creatingIntentId: string | null;
  onPayInstalment: (applicationId: string, instalmentId: string, amount: number, label: string) => void;
  onPaymentSuccess: (paymentIntentId?: string) => void;
  onCancelPayment: () => void;
  stripePromise: ReturnType<typeof loadStripe> | null;
  getInstalmentStatus: (
    instalment: { id: string; due_date: string; label?: string | null; sequence: number },
    application: { 
      deposit_payment_intent_id?: string | null;
      student_application_steps?: Array<{ step_number: number; payload: Record<string, unknown> }>;
    },
  ) => { status: string; label: string; color: "default" | "destructive" | "secondary" };
};

const PaymentCard = ({
  application,
  paidInstalmentIds,
  selectedInstalment,
  paymentClientSecret,
  creatingIntentId,
  onPayInstalment,
  onPaymentSuccess,
  onCancelPayment,
  stripePromise,
  getInstalmentStatus,
}: PaymentCardProps) => {
  const queryClient = useQueryClient();
  const [manualRequestInstalment, setManualRequestInstalment] = useState<{
    instalmentId: string;
    label: string;
    amount: number;
  } | null>(null);
  const { data: instalments, isLoading, refetch } = useStudentPayments(application.id);
  const { data: pendingRequests } = useManualPaymentRequests(application.id);
  const { data: requestHistory } = useManualPaymentRequestHistory(application.id);
  const pendingInstalmentIds = useMemo(
    () => new Set((pendingRequests ?? []).map((r) => r.instalment_id)),
    [pendingRequests],
  );
  // Latest rejected request per instalment (for "Request rejected" badge + reason)
  const rejectedByInstalmentId = useMemo(() => {
    if (!requestHistory) return new Map<string, { rejection_reason: string | null; reviewed_at: string | null }>();
    const rejected = requestHistory.filter((r) => r.status === "rejected");
    const map = new Map<string, { rejection_reason: string | null; reviewed_at: string | null }>();
    rejected.forEach((r) => {
      if (!map.has(r.instalment_id)) map.set(r.instalment_id, { rejection_reason: r.rejection_reason, reviewed_at: r.reviewed_at });
    });
    return map;
  }, [requestHistory]);
  const { data: cashback } = useApplicationCashback(application.id);
  const { data: discount } = useApplicationDiscount(application.id);
  // Only fetch payment summary for confirmed applications (they have payment schedules)
  // Polled in background; values update without full-card loading (no isRefetching overlay)
  const { data: paymentSummary } = usePaymentSummary(
    application.status === "confirmed" ? application.id : null
  );
  const { data: unifiedPayments } = useUnifiedPayments(application.id);
  const { data: installmentBreakdown } = useInstallmentBreakdown(application.id);
  const contract = application.contract;
  const gradeName = contract?.studio_grade?.name ?? "Studio Grade";

  // Fetch weekly price from studio_grade_prices if needed
  const { data: gradePrice } = useQuery({
    queryKey: ["studio-grade-price", contract?.academic_year_id, contract?.studio_grade_id],
    queryFn: async () => {
      if (!contract?.academic_year_id || !contract?.studio_grade_id) return null;
      const { data, error } = await supabase
        .from("studio_grade_prices")
        .select("weekly_price")
        .eq("academic_year_id", contract.academic_year_id)
        .eq("studio_grade_id", contract.studio_grade_id)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!contract?.academic_year_id && !!contract?.studio_grade_id && !contract?.weekly_price_override,
  });

  // Calculate contract total and deposit
  const contractTotal = useMemo(() => {
    if (!contract) return 0;
    const weeklyPrice = contract.weekly_price_override || gradePrice?.weekly_price || 0;
    return weeklyPrice * getEffectiveWeeks(contract);
  }, [contract, gradePrice]);

  const depositAmount = useMemo(() => {
    if (!contract) return 0;
    return contract.deposit_override || contract.payment_plan?.deposit_amount || 0;
  }, [contract]);

  const isDepositPaid = useMemo(() => {
    if (application.deposit_payment_intent_id?.startsWith("manual-")) {
      return true;
    }
    return (unifiedPayments ?? []).some(
      (payment) =>
        payment.payment_metadata?.type === "deposit" ||
        payment.payment_type === "deposit",
    );
  }, [application.deposit_payment_intent_id, unifiedPayments]);

  // Calculate installments total due (sum of all installments)
  const installmentsTotalDue = useMemo(() => {
    if (!instalments || instalments.length === 0) return 0;
    return instalments.reduce((sum, inst) => sum + Number(inst.amount), 0);
  }, [instalments]);

  // Calculate cashback- and discount-adjusted installments (reduce final installment)
  const totalReduction = (cashback?.cashback_amount || 0) + (discount?.discount_amount || 0);
  const adjustedInstalments = useMemo(() => {
    if (!instalments || instalments.length === 0) return [];
    if (totalReduction <= 0) return instalments;

    const sorted = [...instalments].sort((a, b) => a.sequence - b.sequence);
    const lastIndex = sorted.length - 1;
    const lastInstalment = sorted[lastIndex];

    const adjustedAmount = Math.max(0, Number(lastInstalment.amount) - totalReduction);

    return sorted.map((inst, index) => {
      if (index === lastIndex) {
        return {
          ...inst,
          amount: adjustedAmount,
          original_amount: Number(inst.amount),
        };
      }
      return inst;
    });
  }, [instalments, totalReduction]);

  const breakdownByInstalmentId = useMemo(() => {
    if (!installmentBreakdown || installmentBreakdown.length === 0) {
      return new Map<string, { payment_status: string; amount_due: number; amount_paid: number; remaining_amount: number }>();
    }
    return new Map(
      installmentBreakdown.map((b) => [
        // get_installment_breakdown keys by `installment_id` (contract_payment_schedule.id).
        // In the portal UI, the card `instalment.id` may not always be the same id type
        // (especially for manual payments), so we also fall back to mapping by `sequence` below.
        (b as any).installment_id as string,
        {
          payment_status: (b as any).payment_status as string,
          amount_due: Number((b as any).amount_due ?? 0),
          amount_paid: Number((b as any).amount_paid ?? 0),
          remaining_amount: Number((b as any).remaining_amount ?? 0),
        },
      ]),
    );
  }, [installmentBreakdown]);

  const breakdownBySequence = useMemo(() => {
    if (!installmentBreakdown || installmentBreakdown.length === 0) {
      return new Map<number, { payment_status: string; amount_due: number; amount_paid: number; remaining_amount: number }>();
    }

    return new Map(
      installmentBreakdown.map((b) => [
        (b as any).sequence as number,
        {
          payment_status: (b as any).payment_status as string,
          amount_due: Number((b as any).amount_due ?? 0),
          amount_paid: Number((b as any).amount_paid ?? 0),
          remaining_amount: Number((b as any).remaining_amount ?? 0),
        },
      ]),
    );
  }, [installmentBreakdown]);

  // Refetch when payment succeeds - but delay to prevent state reset
  useEffect(() => {
    if (selectedInstalment?.applicationId === application.id && !paymentClientSecret) {
      // Delay refetch to allow payment status state to persist
      const timer = setTimeout(() => {
        refetch();
      }, 2000); // 2 second delay
      return () => clearTimeout(timer);
    }
  }, [selectedInstalment, paymentClientSecret, application.id, refetch]);

  // Periodically refetch payment summary if not fully paid (to catch webhook updates)
  // BUT: Only when payment form is NOT open to prevent disrupting user input
  useEffect(() => {
    if (application.status !== "confirmed" || paymentSummary?.payment_status === "fully_paid") {
      return;
    }
    
    // Don't poll if payment form is open for this application
    if (selectedInstalment?.applicationId === application.id && paymentClientSecret) {
      return;
    }
    
    const interval = setInterval(() => {
      // Double-check form is still closed before refetching
      if (!paymentClientSecret && selectedInstalment?.applicationId !== application.id) {
        queryClient.invalidateQueries({ queryKey: ["payment-summary", application.id] });
        queryClient.invalidateQueries({ queryKey: ["unified-payments", application.id] });
      }
    }, 30000); // 30 seconds - less aggressive, only when form is closed
    
    return () => clearInterval(interval);
  }, [application.id, application.status, paymentSummary?.payment_status, queryClient, paymentClientSecret, selectedInstalment]);

  if (isLoading) {
    return (
      <Card className="rounded-3xl border border-border/60 shadow-xl">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-border/60 p-4 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <div className="flex flex-wrap items-center gap-6">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
                <Skeleton className="h-10 w-24 rounded-full" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!instalments || instalments.length === 0) {
    return null;
  }

  return (
    <Card className="rounded-3xl border border-border/60 shadow-xl relative">
      <CardHeader>
        <CardTitle className="text-xl font-display uppercase tracking-wide">
          {contract?.name ?? "Contract"}
        </CardTitle>
        <CardDescription>
          {gradeName} · {instalments.length} instalment{instalments.length !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cashback Alert */}
        {cashback && cashback.cashback_amount > 0 && (
          <Alert className="border-primary/50 bg-primary/5">
            <Gift className="h-4 w-4" />
            <AlertTitle className="font-semibold">Cashback Applied</AlertTitle>
            <AlertDescription className="text-sm mt-1">
              You have a cashback of £{cashback.cashback_amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })} applied to this booking.
              {cashback.campaign && (
                <span className="block mt-1 text-xs text-muted-foreground">
                  Campaign: {cashback.campaign.name}
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}
        {/* Discount Alert */}
        {discount && discount.discount_amount > 0 && (
          <Alert className="border-primary/50 bg-primary/5">
            <Percent className="h-4 w-4" />
            <AlertTitle className="font-semibold">Discount Applied</AlertTitle>
            <AlertDescription className="text-sm mt-1">
              You have a discount of £{discount.discount_amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })} applied to this booking.
              {discount.campaign && (
                <span className="block mt-1 text-xs text-muted-foreground">
                  Campaign: {discount.campaign.name}
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Payment Summary - Detailed Breakdown */}
        {paymentSummary && (
          <div className={`rounded-2xl border p-4 space-y-3 ${
            paymentSummary.payment_status === 'fully_paid' 
              ? 'border-green-500/50 bg-green-50 dark:bg-green-950/20' 
              : 'border-border/60 bg-muted/30'
          }`}>
            {paymentSummary.payment_status === 'fully_paid' && (
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="font-bold text-green-700 dark:text-green-300 uppercase tracking-wide">
                  Fully Paid
                </span>
              </div>
            )}
            
            {/* Contract Total */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Contract Total:</span>
              <span className="font-semibold">
                £{contractTotal.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* Deposit Paid */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Deposit {isDepositPaid ? 'Paid' : 'Due'} (separate from rent):</span>
              <span className={`font-semibold ${isDepositPaid ? 'text-green-600' : ''}`}>
                {isDepositPaid ? '✓ ' : ''}£{depositAmount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* Installments Total Due */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Installments Total Due:</span>
              <span className="font-semibold">
                £{paymentSummary.total_due.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* Cashback (if applicable) */}
            {cashback && cashback.cashback_amount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Gift className="h-3 w-3" />
                  Cashback Applied:
                </span>
                <span className="font-semibold text-green-600">
                  -£{cashback.cashback_amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* Discount (if applicable) */}
            {discount && discount.discount_amount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Percent className="h-3 w-3" />
                  Discount Applied:
                </span>
                <span className="font-semibold text-green-600">
                  -£{discount.discount_amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* Remaining Balance */}
            <div className="flex items-center justify-between text-sm pt-2 border-t border-border/60">
              <span className="font-semibold">Remaining Balance:</span>
              <span className={`font-bold text-lg ${
                paymentSummary.payment_status === 'fully_paid' 
                  ? 'text-green-700 dark:text-green-300' 
                  : ''
              }`}>
                £{paymentSummary.remaining_balance.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {adjustedInstalments.map((instalment) => {
          const originalAmount = (instalment as any).original_amount;
          const isLastInstalment = instalment.sequence === adjustedInstalments.length;
          const hasReduction = originalAmount && originalAmount > Number(instalment.amount);
          const reductionLabel =
            cashback?.cashback_amount && discount?.discount_amount
              ? "Cashback & Discount"
              : cashback?.cashback_amount
                ? "Cashback"
                : "Discount";

          // Prefer precise matching by id; fall back to sequence to handle cases
          // where the card id and breakdown id refer to different tables.
          const breakdown = breakdownByInstalmentId.get(instalment.id) ?? breakdownBySequence.get(instalment.sequence);
          const baseStatus = getInstalmentStatus(instalment, application);

          let status = baseStatus;
          if (breakdown) {
            if (breakdown.payment_status === "paid") {
              status = { status: "paid", label: "Paid", color: "default" as const };
            } else if (breakdown.payment_status === "partial") {
              status = {
                status: "partial",
                label: "Partially paid",
                color: baseStatus.color === "destructive" ? "destructive" as const : "default" as const,
              };
            }
          }

          const isSelected =
            selectedInstalment?.instalmentId === instalment.id;
          const isPaying = isSelected && paymentClientSecret;
          const isProcessing = creatingIntentId === instalment.id;
          const isPaid = status.status === "paid";
          const isPendingRequest = pendingInstalmentIds.has(instalment.id);
          const rejectedRequest = rejectedByInstalmentId.get(instalment.id);

          return (
            <div
              key={instalment.id}
              className="rounded-2xl border border-border/60 p-4 space-y-4"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">
                      {instalment.label || `Instalment ${instalment.sequence}`}
                    </h3>
                    <Badge variant={status.color as "default" | "destructive" | "secondary"}>
                      {status.label}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Due {format(new Date(instalment.due_date), "d MMM yyyy")}
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        {hasReduction ? (
                          <span className="flex items-center gap-2">
                            <span className="line-through text-muted-foreground/60">
                              £{originalAmount.toFixed(2)}
                            </span>
                            <span className="font-semibold text-primary">
                              £{Number(instalment.amount).toFixed(2)}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {discount?.discount_amount && !cashback?.cashback_amount ? (
                                <Percent className="h-3 w-3 mr-1" />
                              ) : (
                                <Gift className="h-3 w-3 mr-1" />
                              )}
                              {reductionLabel}
                            </Badge>
                          </span>
                        ) : (
                          <span>£{Number(instalment.amount).toFixed(2)}</span>
                        )}
                      </div>
                      {breakdown && (breakdown.amount_paid > 0 || breakdown.remaining_amount > 0) && (
                        <div className="text-xs text-muted-foreground">
                          £{breakdown.amount_paid.toFixed(2)} paid • £{breakdown.remaining_amount.toFixed(2)} remaining
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {!isPaying && !isPaid && !isPendingRequest && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <Button
                      className="rounded-full uppercase tracking-wide"
                      onClick={() =>
                        onPayInstalment(
                          application.id,
                          instalment.id,
                          Number(instalment.amount),
                          instalment.label || `Instalment ${instalment.sequence}`,
                        )
                      }
                      disabled={isProcessing || isPaying || creatingIntentId !== null}
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        "Pay Now"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full uppercase tracking-wide text-xs"
                      onClick={() =>
                        setManualRequestInstalment({
                          instalmentId: instalment.id,
                          label: instalment.label || `Instalment ${instalment.sequence}`,
                          amount: Number(instalment.amount),
                        })
                      }
                    >
                      <Banknote className="h-3 w-3 mr-1" />
                      I paid by bank transfer
                    </Button>
                  </div>
                )}
                {isPendingRequest && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                    <Clock className="h-3 w-3 mr-1" />
                    Pending approval
                  </Badge>
                )}
                {rejectedRequest && !isPaid && !isPendingRequest && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 cursor-help">
                          <XCircle className="h-3 w-3 mr-1" />
                          Request rejected
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <p className="font-medium">Your request was declined.</p>
                        {rejectedRequest.rejection_reason ? (
                          <p className="text-sm mt-1">{rejectedRequest.rejection_reason}</p>
                        ) : (
                          <p className="text-sm mt-1 text-muted-foreground">No reason provided.</p>
                        )}
                        {rejectedRequest.reviewed_at && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(rejectedRequest.reviewed_at), "d MMM yyyy")}
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {isPaid && (
                  <Badge className="bg-green-600 text-white">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Paid
                  </Badge>
                )}
              </div>

              {isPaying && paymentClientSecret && stripePromise && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold">Complete Payment</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full"
                      onClick={onCancelPayment}
                    >
                      Cancel
                    </Button>
                  </div>
                  <div className="mb-4 rounded-lg border border-border/60 bg-background/70 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Instalment amount</span>
                      <span>£{selectedInstalment.baseAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Card processing fee</span>
                      <span>£{selectedInstalment.processingFee.toFixed(2)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-2 font-semibold">
                      <span>Total charged</span>
                      <span>£{selectedInstalment.totalChargeAmount.toFixed(2)}</span>
                    </div>
                  </div>
                  <Elements
                    key={paymentClientSecret}
                    stripe={stripePromise}
                    options={{ clientSecret: paymentClientSecret }}
                  >
                    <StripePaymentForm
                      amountPence={Math.round(selectedInstalment.totalChargeAmount * 100)}
                      currency="GBP"
                      onSuccess={onPaymentSuccess}
                      onLoadError={() => {
                        setPaymentClientSecret(null);
                        setSelectedInstalment(null);
                        setCreatingIntentId(null);
                      }}
                    />
                  </Elements>
                </div>
              )}
            </div>
          );
        })}

        {/* Payment request history – pending, rejected, approved */}
        {requestHistory && requestHistory.length > 0 && (
          <div className="rounded-2xl border border-border/60 p-4 space-y-3 mt-6">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <History className="h-4 w-4" />
              Payment request history
            </h4>
            <ul className="space-y-2 text-sm">
              {requestHistory.map((req) => (
                <li
                  key={req.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-b border-border/40 last:border-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">£{Number(req.amount).toFixed(2)}</span>
                    <span className="text-muted-foreground">
                      {format(new Date(req.submitted_at), "d MMM yyyy, HH:mm")}
                    </span>
                    {req.status === "pending" && (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending approval
                      </Badge>
                    )}
                    {req.status === "rejected" && (
                      <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 text-xs">
                        <XCircle className="h-3 w-3 mr-1" />
                        Rejected
                      </Badge>
                    )}
                    {req.status === "approved" && (
                      <Badge className="bg-green-600 text-white text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Approved
                      </Badge>
                    )}
                  </div>
                  {req.status === "rejected" && req.rejection_reason && (
                    <p className="text-muted-foreground text-xs sm:text-right max-w-md">{req.rejection_reason}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {manualRequestInstalment && (
          <ManualPaymentRequestDialog
            open={!!manualRequestInstalment}
            onOpenChange={(open) => !open && setManualRequestInstalment(null)}
            applicationId={application.id}
            instalmentId={manualRequestInstalment.instalmentId}
            instalmentLabel={manualRequestInstalment.label}
            amount={manualRequestInstalment.amount}
          />
        )}
      </CardContent>
    </Card>
  );
};

// Payment History Section Component
type PaymentHistorySectionProps = {
  applications: Array<{ id: string; contract?: { name: string | null } | null }>;
};

const PaymentHistorySection = ({ applications }: PaymentHistorySectionProps) => {
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(
    applications[0]?.id || null
  );

  // Get payment history for the selected application
  const { data: paymentHistory, isLoading: historyLoading } = useUnifiedPayments(
    selectedApplicationId || ""
  );

  // Separate payments into deposits and installments
  const { deposits, installments, allPayments } = useMemo(() => {
    if (!paymentHistory) return { deposits: [], installments: [], allPayments: [] };
    
    const sorted = paymentHistory.sort((a, b) => 
      new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
    );
    
    const depositsList = sorted.filter(payment => {
      // Deposit if: no installment_number AND (metadata type is deposit OR no type/installment_number)
      const isDeposit = !payment.installment_number && 
        (payment.payment_metadata?.type === "deposit" || 
         !payment.payment_metadata?.type || 
         payment.payment_metadata?.type !== "instalment");
      return isDeposit;
    });
    
    const installmentsList = sorted.filter(payment => {
      // Installment if: has installment_number OR metadata type is instalment
      return payment.installment_number !== null || 
             payment.payment_metadata?.type === "instalment";
    });
    
    return {
      deposits: depositsList,
      installments: installmentsList,
      allPayments: sorted,
    };
  }, [paymentHistory]);

  if (applications.length === 0) return null;

  const selectedApp = applications.find(app => app.id === selectedApplicationId);

  return (
    <Card className="rounded-3xl border border-border/60 shadow-xl mt-8">
      <CardHeader>
        <CardTitle className="text-xl font-display uppercase tracking-wide">
          Payment History
        </CardTitle>
        <CardDescription>
          View all your completed payments including deposits and instalments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {applications.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {applications.map((app) => (
              <Button
                key={app.id}
                variant={selectedApplicationId === app.id ? "default" : "outline"}
                size="sm"
                className="rounded-full"
                onClick={() => setSelectedApplicationId(app.id)}
              >
                {app.contract?.name || "Application"}
              </Button>
            ))}
          </div>
        )}

        {historyLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : allPayments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No payment history yet</p>
            <p className="text-sm mt-1">Completed payments will appear here</p>
          </div>
        ) : (
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-3 rounded-full bg-muted/50">
              <TabsTrigger value="all" className="rounded-full">
                All Payments
                {allPayments.length > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {allPayments.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="deposits" className="rounded-full">
                Deposits
                {deposits.length > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {deposits.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="installments" className="rounded-full">
                Installments
                {installments.length > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {installments.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="all" className="mt-4">
              <PaymentList payments={allPayments} />
            </TabsContent>
            
            <TabsContent value="deposits" className="mt-4">
              {deposits.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No deposit payments yet</p>
                </div>
              ) : (
                <PaymentList payments={deposits} />
              )}
            </TabsContent>
            
            <TabsContent value="installments" className="mt-4">
              {installments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No installment payments yet</p>
                  <p className="text-sm mt-1">Completed installment payments will appear here</p>
                </div>
              ) : (
                <PaymentList payments={installments} />
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
};

// Payment List Component for reusability
type PaymentListProps = {
  payments: Array<{
    payment_id: string;
    payment_source: "stripe" | "manual";
    payment_metadata?: {
      label?: string;
      type?: string;
      [key: string]: unknown;
    } | null;
    installment_number: number | null;
    payment_status: string;
    payment_date: string;
    amount_paid: number;
    currency: string;
    contract_name: string;
  }>;
};

const PaymentList = ({ payments }: PaymentListProps) => {
  const [downloadingReceipt, setDownloadingReceipt] = useState<string | null>(null);
  const { toast } = useToast();

  const handleDownloadReceipt = async (payment: PaymentListProps["payments"][0]) => {
    if (downloadingReceipt) return;

    setDownloadingReceipt(payment.payment_id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-student-invoice-pdf", {
        body: {
          paymentId: payment.payment_id,
          paymentSource: payment.payment_source,
        },
      });

      if (error) {
        console.error("Error generating receipt:", error);
        toast({
          title: "Error",
          description: "Failed to generate receipt. Please try again.",
          variant: "destructive",
        });
        return;
      }

      if (data?.pdf) {
        // Convert base64 to blob
        const binaryString = atob(data.pdf);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = data.filename || `Receipt-${payment.payment_id}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast({
          title: "Receipt Downloaded",
          description: "Your receipt has been downloaded successfully.",
        });
      }
    } catch (error) {
      console.error("Error downloading receipt:", error);
      toast({
        title: "Error",
        description: "Failed to download receipt. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingReceipt(null);
    }
  };

  return (
    <div className="space-y-3">
      {payments.map((payment) => {
        const isPaid = payment.payment_status === "completed" || payment.payment_status === "succeeded";
        const isDownloading = downloadingReceipt === payment.payment_id;

        return (
          <div
            key={payment.payment_id}
            className="rounded-xl border border-border/60 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
          >
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h4 className="font-semibold">
                  {payment.payment_source === "stripe" 
                    ? payment.payment_metadata?.label || 
                      (payment.installment_number 
                        ? `Instalment ${payment.installment_number}` 
                        : payment.payment_metadata?.type === "instalment"
                        ? "Instalment Payment"
                        : "Deposit")
                    : "Manual Payment"}
                </h4>
                <Badge variant="outline" className="text-xs">
                  {payment.payment_source === "stripe" ? "Stripe" : "Manual"}
                </Badge>
                {isPaid && (
                  <Badge className="bg-green-600 text-white text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Completed
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(payment.payment_date), "d MMM yyyy 'at' HH:mm")}
                </div>
                {payment.installment_number && (
                  <div className="flex items-center gap-2">
                    <span>Instalment #{payment.installment_number}</span>
                  </div>
                )}
                {payment.contract_name && (
                  <div className="flex items-center gap-2">
                    <span>{payment.contract_name}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="font-bold text-lg">
                  £{payment.amount_paid.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-muted-foreground uppercase">
                  {payment.currency}
                </div>
              </div>
              {isPaid && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => handleDownloadReceipt(payment)}
                  disabled={isDownloading}
                  title="Download Receipt"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileDown className="h-4 w-4 mr-2" />
                      Receipt
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Payments;
