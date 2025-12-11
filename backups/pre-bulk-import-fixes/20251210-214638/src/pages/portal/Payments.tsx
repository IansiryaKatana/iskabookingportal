import { useMemo, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, CreditCard, Calendar, CheckCircle2, Clock, AlertCircle, Gift, FileDown } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { useStudentApplicationsList } from "@/hooks/useStudentApplications";
import { useStudentPayments } from "@/hooks/useStudentPayments";
import { useApplicationCashback } from "@/hooks/useCashback";
import { usePaymentSummary, useUnifiedPayments } from "@/hooks/useUnifiedPayments";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format, isPast, isToday, isFuture } from "date-fns";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import StripePaymentForm from "@/components/StripePaymentForm";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",
);

const Payments = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedInstalment, setSelectedInstalment] = useState<{
    applicationId: string;
    instalmentId: string;
    amount: number;
    label: string;
  } | null>(null);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);
  const [creatingIntentId, setCreatingIntentId] = useState<string | null>(null);
  const [paidInstalmentIds, setPaidInstalmentIds] = useState<Set<string>>(new Set());
  const [isLoadingPaidStatus, setIsLoadingPaidStatus] = useState(true);

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
        return;
      }
      
      setIsLoadingPaidStatus(true);
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
    amount: number,
    label: string,
  ) => {
    console.log("Creating instalment payment intent:", {
      applicationId,
      instalmentId,
      amount,
      label,
    });
    
    setCreatingIntentId(instalmentId);
    try {
      const { data, error } = await supabase.functions.invoke("create-payment", {
        body: {
          applicationId,
          amount: amount, // Amount in pounds, function will convert to pence
          type: "instalment",
          label,
          instalmentId,
        },
      });

      if (error) {
        console.error("Error from create-payment function:", error);
        throw error;
      }
      
      if (!data?.clientSecret) {
        throw new Error("No client secret returned");
      }

      console.log("Payment intent created successfully:", {
        clientSecret: data.clientSecret?.substring(0, 20) + "...",
        amount: data.amount,
        currency: data.currency,
      });

      setPaymentClientSecret(data.clientSecret);
    } catch (error) {
      console.error("Error creating payment intent:", error);
      toast({
        variant: "destructive",
        title: "Payment error",
        description: error instanceof Error ? error.message : "Unable to create payment. Please try again.",
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
    setSelectedInstalment({ applicationId, instalmentId, amount, label });
    await createInstalmentPaymentIntent(applicationId, instalmentId, amount, label);
  };

  const handlePaymentSuccess = async (paymentIntentId?: string) => {
    const currentInstalment = selectedInstalment;
    
    console.log("Payment success callback triggered", { 
      instalmentId: currentInstalment?.instalmentId,
      paymentIntentId,
      applicationId: currentInstalment?.applicationId,
    });
    
    // Add the paid instalment ID to the set immediately and persist it
    if (currentInstalment) {
      setPaidInstalmentIds((prev) => {
        const newSet = new Set(prev);
        newSet.add(currentInstalment.instalmentId);
        console.log("Added instalment to paid set:", currentInstalment.instalmentId);
        return newSet;
      });
    }
    
    setPaymentClientSecret(null);
    setSelectedInstalment(null);
    setCreatingIntentId(null);
    
    toast({
      title: "Payment successful",
      description: "Your instalment has been processed successfully. Updating payment history...",
    });
    
    // Immediately sync payment from Stripe to ensure it's in the database
    let syncSucceeded = false;
    if (currentInstalment && paymentIntentId) {
      try {
        console.log("Immediately syncing payment from Stripe:", paymentIntentId);
        const { data: syncData, error: syncError } = await supabase.functions.invoke("sync-payment-from-stripe", {
          body: {
            applicationId: currentInstalment.applicationId,
            paymentIntentId: paymentIntentId,
          },
        });

        if (syncError) {
          console.error("Sync error:", syncError);
          // Log the full error for debugging
          console.error("Sync error details:", JSON.stringify(syncError, null, 2));
        } else if (syncData?.synced && syncData.synced > 0) {
          console.log("Payment synced successfully:", syncData);
          syncSucceeded = true;
        } else if (syncData?.synced === 0) {
          console.log("Payment already exists in database (synced: 0)");
          syncSucceeded = true; // Already exists is fine
        } else {
          console.log("Sync response:", syncData);
        }
      } catch (syncErr) {
        console.error("Error syncing payment:", syncErr);
        // Continue - webhook will handle it
      }
    } else {
      console.warn("Cannot sync: missing paymentIntentId or instalment", {
        hasPaymentIntentId: !!paymentIntentId,
        hasInstalment: !!currentInstalment,
      });
    }
    
    // Immediately invalidate and refetch React Query caches
    if (currentInstalment) {
      // Invalidate payment history and summary queries
      queryClient.invalidateQueries({ queryKey: ["unified-payments", currentInstalment.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["payment-summary", currentInstalment.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["student-payments", currentInstalment.applicationId] });
      
      // Also invalidate all payments queries (for admin view)
      queryClient.invalidateQueries({ queryKey: ["all-payments"] });
      
      // Force immediate refetch and wait for it
      const refetchResults = await Promise.all([
        queryClient.refetchQueries({ queryKey: ["unified-payments", currentInstalment.applicationId] }),
        queryClient.refetchQueries({ queryKey: ["payment-summary", currentInstalment.applicationId] }),
      ]);
      
      console.log("Refetch results:", refetchResults);
      
      // If sync didn't work, try again after a short delay (webhook might have processed it)
      if (!syncSucceeded && paymentIntentId) {
        setTimeout(async () => {
          console.log("Retrying sync after delay:", paymentIntentId);
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
              console.log("Payment synced on retry:", syncData);
              // Refetch again after successful sync
              queryClient.invalidateQueries({ queryKey: ["unified-payments", currentInstalment.applicationId] });
              queryClient.invalidateQueries({ queryKey: ["payment-summary", currentInstalment.applicationId] });
              await queryClient.refetchQueries({ queryKey: ["unified-payments", currentInstalment.applicationId] });
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
      if (application.deposit_payment_intent_id) {
        return { status: "paid", label: "Paid", color: "default" as const };
      }
      const step5 = application.student_application_steps?.find(s => s.step_number === 5);
      if (step5?.payload && typeof step5.payload === "object") {
        const payload = step5.payload as Record<string, unknown>;
        if (payload.deposit_paid === true) {
          return { status: "paid", label: "Paid", color: "default" as const };
        }
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
    amount: number;
    label: string;
  } | null;
  paymentClientSecret: string | null;
  creatingIntentId: string | null;
  onPayInstalment: (applicationId: string, instalmentId: string, amount: number, label: string) => void;
  onPaymentSuccess: (paymentIntentId?: string) => void;
  onCancelPayment: () => void;
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
  getInstalmentStatus,
}: PaymentCardProps) => {
  const queryClient = useQueryClient();
  const { data: instalments, isLoading, refetch } = useStudentPayments(application.id);
  const { data: cashback } = useApplicationCashback(application.id);
  // Only fetch payment summary for confirmed applications (they have payment schedules)
  // Use isRefetching for background updates (invisible polling) instead of isLoading
  const { data: paymentSummary, isRefetching: isRefetchingSummary } = usePaymentSummary(
    application.status === "confirmed" ? application.id : null
  );
  // Also get isRefetching for unified payments to show skeleton when updating
  const { data: unifiedPayments, isRefetching: isRefetchingPayments } = useUnifiedPayments(application.id);
  const contract = application.contract;
  const gradeName = contract?.studio_grade?.name ?? "Studio Grade";

  // Calculate cashback-adjusted installments (reduce final installment)
  // For Pay in Full (1 installment), this will reduce that single installment
  const adjustedInstalments = useMemo(() => {
    if (!instalments || instalments.length === 0) return [];
    if (!cashback || cashback.cashback_amount <= 0) return instalments;

    const sorted = [...instalments].sort((a, b) => a.sequence - b.sequence);
    const lastIndex = sorted.length - 1;
    const lastInstalment = sorted[lastIndex];

    // Reduce final installment by cashback amount (minimum 0)
    // For Pay in Full, this is the only installment
    const adjustedAmount = Math.max(0, Number(lastInstalment.amount) - cashback.cashback_amount);

    return sorted.map((inst, index) => {
      if (index === lastIndex) {
        return { 
          ...inst, 
          amount: adjustedAmount, 
          original_amount: Number(inst.amount) 
        };
      }
      return inst;
    });
  }, [instalments, cashback]);

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

  // Show skeleton overlay when refetching in background (granular loading)
  // Only show when refetching (background update), not on initial load
  const isRefetching = isRefetchingSummary || isRefetchingPayments;

  return (
    <Card className={`rounded-3xl border border-border/60 shadow-xl relative ${isRefetching ? "opacity-75" : ""}`}>
      {/* Skeleton overlay when refetching in background - only on affected card */}
      {isRefetching && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-10 rounded-3xl flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Updating...</span>
          </div>
        </div>
      )}
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

        {/* Payment Summary with Cashback */}
        {paymentSummary && (
          <div className={`rounded-2xl border p-4 space-y-2 ${
            paymentSummary.payment_status === 'fully_paid' 
              ? 'border-green-500/50 bg-green-50 dark:bg-green-950/20' 
              : 'border-border/60 bg-muted/30'
          }`}>
            {paymentSummary.payment_status === 'fully_paid' && (
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="font-bold text-green-700 dark:text-green-300 uppercase tracking-wide">
                  Fully Paid
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Due:</span>
              <span className="font-semibold">
                £{paymentSummary.total_due.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
              </span>
            </div>
            {cashback && cashback.cashback_amount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Gift className="h-3 w-3" />
                  Cashback:
                </span>
                <span className="font-semibold text-green-600">
                  -£{cashback.cashback_amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
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
          const hasCashbackDiscount = originalAmount && originalAmount > Number(instalment.amount);
          const status = getInstalmentStatus(instalment, application);
          const isSelected =
            selectedInstalment?.instalmentId === instalment.id;
          const isPaying = isSelected && paymentClientSecret;
          const isProcessing = creatingIntentId === instalment.id;
          const isPaid = status.status === "paid";

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
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      {hasCashbackDiscount ? (
                        <span className="flex items-center gap-2">
                          <span className="line-through text-muted-foreground/60">
                            £{originalAmount.toFixed(2)}
                          </span>
                          <span className="font-semibold text-primary">
                            £{Number(instalment.amount).toFixed(2)}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            <Gift className="h-3 w-3 mr-1" />
                            Cashback
                          </Badge>
                        </span>
                      ) : (
                        <span>£{Number(instalment.amount).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </div>
                {!isPaying && !isPaid && (
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
                  <Elements
                    stripe={stripePromise}
                    options={{
                      clientSecret: paymentClientSecret,
                      appearance: { theme: "flat" },
                    }}
                  >
                    <StripePaymentForm
                      amountPence={Math.round(selectedInstalment.amount * 100)}
                      currency="GBP"
                      onSuccess={onPaymentSuccess}
                    />
                  </Elements>
                </div>
              )}
            </div>
          );
        })}
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
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null);
  const { toast } = useToast();

  const handleDownloadInvoice = async (payment: PaymentListProps["payments"][0]) => {
    if (downloadingInvoice) return;

    setDownloadingInvoice(payment.payment_id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-student-invoice-pdf", {
        body: {
          paymentId: payment.payment_id,
          paymentSource: payment.payment_source,
        },
      });

      if (error) {
        console.error("Error generating invoice:", error);
        toast({
          title: "Error",
          description: "Failed to generate invoice. Please try again.",
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
        link.download = data.filename || `Invoice-${payment.payment_id}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast({
          title: "Invoice Downloaded",
          description: "Your invoice has been downloaded successfully.",
        });
      }
    } catch (error) {
      console.error("Error downloading invoice:", error);
      toast({
        title: "Error",
        description: "Failed to download invoice. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingInvoice(null);
    }
  };

  return (
    <div className="space-y-3">
      {payments.map((payment) => {
        const isPaid = payment.payment_status === "completed" || payment.payment_status === "succeeded";
        const isDownloading = downloadingInvoice === payment.payment_id;

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
                  onClick={() => handleDownloadInvoice(payment)}
                  disabled={isDownloading}
                  title="Download Invoice"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileDown className="h-4 w-4 mr-2" />
                      Invoice
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
