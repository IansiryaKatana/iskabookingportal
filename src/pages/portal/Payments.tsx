import { useMemo, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, CreditCard, Calendar, CheckCircle2, Clock, AlertCircle, Gift } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { useStudentApplicationsList } from "@/hooks/useStudentApplications";
import { useStudentPayments } from "@/hooks/useStudentPayments";
import { useApplicationCashback } from "@/hooks/useCashback";
import { usePaymentSummary } from "@/hooks/useUnifiedPayments";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isPast, isToday, isFuture } from "date-fns";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import StripePaymentForm from "@/components/StripePaymentForm";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",
);

const Payments = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
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
  useEffect(() => {
    const fetchPaidInstalments = async () => {
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
      
      // Set the paid IDs immediately
      setPaidInstalmentIds(allPaidIds);
      setIsLoadingPaidStatus(false);
    };

    fetchPaidInstalments();
    // Refetch every 30 seconds to check for new payments
    const interval = setInterval(fetchPaidInstalments, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedApplications.map(a => a.id).join(",")]);

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
      paymentIntentId 
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
      description: "Your instalment has been processed successfully.",
    });
    
    // Refetch paid instalments from Stripe after a delay to ensure accuracy
    // But keep the immediate update to prevent flickering
    if (currentInstalment) {
      try {
        // Wait a bit longer to ensure Stripe has processed the payment
        setTimeout(async () => {
          console.log("Checking payment status for application:", currentInstalment.applicationId);
          const { data, error } = await supabase.functions.invoke("check-payment-status", {
            body: { applicationId: currentInstalment.applicationId },
          });

          if (error) {
            console.error("Error checking payment status:", error);
          } else {
            console.log("Payment status check result:", data);
          }

          if (!error && data?.paidInstalments) {
            console.log("Found paid instalments:", data.paidInstalments);
            setPaidInstalmentIds((prev) => {
              const newPaidIds = new Set(prev);
              // Always keep the current instalment ID even if Stripe hasn't updated yet
              if (currentInstalment) {
                newPaidIds.add(currentInstalment.instalmentId);
              }
              data.paidInstalments.forEach((pi: { instalmentId: string }) => {
                newPaidIds.add(pi.instalmentId);
              });
              console.log("Updated paid instalment IDs:", Array.from(newPaidIds));
              return newPaidIds;
            });
          } else {
            console.warn("No paid instalments found in Stripe yet. Payment may still be processing.");
          }
        }, 5000); // 5 second delay to allow Stripe to process
      } catch (error) {
        console.error("Error checking payment status after success:", error);
      }
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
    if (paidInstalmentIds.has(instalment.id)) {
      return { status: "paid", label: "Paid", color: "default" as const };
    }

    // Check if this is the deposit instalment (usually first one or labeled as deposit)
    const isDeposit = instalment.label?.toLowerCase().includes("deposit") || 
                      instalment.sequence === 1;
    
    // Check if deposit has been paid
    if (isDeposit) {
      // Check deposit_payment_intent_id first (most reliable)
      if (application.deposit_payment_intent_id) {
        return { status: "paid", label: "Paid", color: "default" as const };
      }
      // Also check step 5 payload for deposit_paid flag
      const step5 = application.student_application_steps?.find(s => s.step_number === 5);
      if (step5?.payload && typeof step5.payload === "object") {
        const payload = step5.payload as Record<string, unknown>;
        if (payload.deposit_paid === true) {
          return { status: "paid", label: "Paid", color: "default" as const };
        }
      }
    }

    // Check based on due date
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
    return { status: "paid", label: "Paid", color: "default" as const };
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
  const { data: instalments, isLoading, refetch } = useStudentPayments(application.id);
  const { data: cashback } = useApplicationCashback(application.id);
  // Only fetch payment summary for confirmed applications (they have payment schedules)
  const { data: paymentSummary } = usePaymentSummary(
    application.status === "confirmed" ? application.id : null
  );
  const contract = application.contract;
  const gradeName = contract?.studio_grade?.name ?? "Studio Grade";

  // Calculate cashback-adjusted installments (reduce final installment)
  const adjustedInstalments = useMemo(() => {
    if (!instalments || instalments.length === 0) return [];
    if (!cashback || cashback.cashback_amount <= 0) return instalments;

    const sorted = [...instalments].sort((a, b) => a.sequence - b.sequence);
    const lastIndex = sorted.length - 1;
    const lastInstalment = sorted[lastIndex];

    // Reduce final installment by cashback amount (minimum 0)
    const adjustedAmount = Math.max(0, Number(lastInstalment.amount) - cashback.cashback_amount);

    return sorted.map((inst, index) => {
      if (index === lastIndex) {
        return { ...inst, amount: adjustedAmount, original_amount: Number(inst.amount) };
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
    <Card className="rounded-3xl border border-border/60 shadow-xl">
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
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 space-y-2">
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
              <span className="font-bold text-lg">
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

export default Payments;
