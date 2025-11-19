import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRefunds } from "@/hooks/useRefunds";
import { ArrowLeft, CreditCard, DollarSign, User } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const Refunds = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  // Fetch refunds history
  const { data: refunds, isLoading: refundsLoading } = useRefunds();

  // Fetch payments that can be refunded
  // Fetch from Stripe payment intents via Edge Function
  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["refundable-payments"],
    queryFn: async () => {
      // Fetch applications with deposit payments
      const { data: applications, error: appError } = await supabase
        .from("student_applications")
        .select(`
          id,
          student_id,
          deposit_payment_intent_id,
          contract:contracts(slug),
          created_at
        `)
        .not("deposit_payment_intent_id", "is", null)
        .order("created_at", { ascending: false });

      if (appError) throw appError;

      // Fetch payment intent details from Stripe for each application
      const paymentsWithDetails = await Promise.all(
        (applications || []).map(async (app) => {
          if (!app.deposit_payment_intent_id) {
            return null;
          }

          try {
            // Fetch payment intent details from Stripe
            const { data: paymentDetails, error: paymentError } = await supabase.functions.invoke(
              "get-payment-intent-details",
              {
                body: { payment_intent_id: app.deposit_payment_intent_id },
              }
            );

            if (paymentError || !paymentDetails) {
              console.warn(`Failed to fetch payment details for ${app.deposit_payment_intent_id}:`, paymentError);
              // Return with placeholder if fetch fails
              return {
                id: app.id,
                application_id: app.id,
                stripe_payment_intent_id: app.deposit_payment_intent_id,
                amount: 0, // Unknown amount
                payment_type: "deposit",
                created_at: app.created_at,
                status: "unknown",
                application: {
                  id: app.id,
                  student_id: app.student_id,
                  contract: app.contract,
                },
              };
            }

            return {
              id: app.id,
              application_id: app.id,
              stripe_payment_intent_id: app.deposit_payment_intent_id,
              amount: paymentDetails.amount || 0, // Amount in pence
              payment_type: "deposit",
              created_at: app.created_at,
              status: paymentDetails.status,
              application: {
                id: app.id,
                student_id: app.student_id,
                contract: app.contract,
              },
            };
          } catch (error) {
            console.error(`Error fetching payment details for ${app.deposit_payment_intent_id}:`, error);
            return null;
          }
        })
      );

      // Filter out null results
      return paymentsWithDetails.filter((p): p is NonNullable<typeof p> => p !== null);
    },
  });

  const isLoading = paymentsLoading || refundsLoading;

  // Process refund mutation
  const processRefund = useMutation({
    mutationFn: async ({ paymentId, amount, reason }: { paymentId: string; amount: number; reason: string }) => {
      // Call Stripe refund API via Edge Function
      const { data, error } = await supabase.functions.invoke("process-refund", {
        body: {
          payment_id: paymentId,
          amount: amount * 100, // Convert to pence
          reason,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["refundable-payments"] });
      queryClient.invalidateQueries({ queryKey: ["refunds"] });
      toast({
        title: "Refund processed",
        description: `Refund of £${(data?.amount / 100).toFixed(2) || refundAmount} has been processed successfully. The student has been notified.`,
      });
      setRefundDialogOpen(false);
      setSelectedPayment(null);
      setRefundAmount("");
      setRefundReason("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process refund",
        variant: "destructive",
      });
    },
  });

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "—";
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount / 100); // Convert from pence
  };

  const handleRefund = (payment: any) => {
    setSelectedPayment(payment);
    setRefundAmount((payment.amount / 100).toString());
    setRefundDialogOpen(true);
  };

  const handleSubmitRefund = () => {
    if (!selectedPayment || !refundAmount || !refundReason) {
      toast({
        title: "Validation Error",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    processRefund.mutate({
      paymentId: selectedPayment.stripe_payment_intent_id,
      amount: parseFloat(refundAmount),
      reason: refundReason,
    });
  };

  if (isLoading) {
    return (
      <AdminLayout pageTitle="Refunds" subtitle="Process payment refunds">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="rounded-3xl">
              <CardContent className="p-6">
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-64" />
              </CardContent>
            </Card>
          ))}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout pageTitle="Refunds" subtitle="Process payment refunds">
      <div className="space-y-6">
        {/* Refunds History */}
        {refunds && refunds.length > 0 && (
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-xl font-display uppercase tracking-wide">
                Refunds History
              </CardTitle>
              <CardDescription>
                View all processed refunds
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {/* Desktop Table View */}
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Student</TableHead>
                      <TableHead className="font-semibold">Amount</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold">Refund ID</TableHead>
                      <TableHead className="font-semibold">Processed By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {refunds.map((refund) => (
                      <TableRow key={refund.id}>
                        <TableCell>
                          {format(new Date(refund.processed_at), "d MMM yyyy, HH:mm")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {(refund as any).student?.first_name && (refund as any).student?.last_name
                                ? `${(refund as any).student.first_name} ${(refund as any).student.last_name}`
                                : `Student ID: ${refund.student_id?.substring(0, 8)}...`}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(refund.amount_pence)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`uppercase rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              refund.status === "succeeded"
                                ? "bg-green-500 hover:bg-green-600 text-white"
                                : refund.status === "failed"
                                ? "bg-red-500 hover:bg-red-600 text-white"
                                : refund.status === "pending"
                                ? "bg-yellow-500 hover:bg-yellow-600 text-white"
                                : "bg-gray-500 hover:bg-gray-600 text-white"
                            }`}
                          >
                            {refund.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs text-muted-foreground">
                            {refund.stripe_refund_id.substring(0, 12)}...
                          </code>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {(refund as any).refunded_by_profile?.first_name && (refund as any).refunded_by_profile?.last_name
                              ? `${(refund as any).refunded_by_profile.first_name} ${(refund as any).refunded_by_profile.last_name}`
                              : refund.refunded_by
                              ? `Staff ID: ${refund.refunded_by.substring(0, 8)}...`
                              : "N/A"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View */}
              <div className="block lg:hidden divide-y">
                {refunds.map((refund) => (
                  <div key={refund.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm font-medium truncate">
                            {(refund as any).student?.first_name && (refund as any).student?.last_name
                              ? `${(refund as any).student.first_name} ${(refund as any).student.last_name}`
                              : `Student ID: ${refund.student_id?.substring(0, 8)}...`}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(refund.processed_at), "d MMM yyyy, HH:mm")}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-lg font-bold">
                          {formatCurrency(refund.amount_pence)}
                        </span>
                        <Badge
                          className={`uppercase rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                            refund.status === "succeeded"
                              ? "bg-green-500 hover:bg-green-600 text-white"
                              : refund.status === "failed"
                              ? "bg-red-500 hover:bg-red-600 text-white"
                              : refund.status === "pending"
                              ? "bg-yellow-500 hover:bg-yellow-600 text-white"
                              : "bg-gray-500 hover:bg-gray-600 text-white"
                          }`}
                        >
                          {refund.status}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="space-y-2 pt-2 border-t border-border/50">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Refund ID:</span>
                        <code className="text-muted-foreground font-mono">
                          {refund.stripe_refund_id.substring(0, 16)}...
                        </code>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Processed by:</span>
                        <span className="text-foreground font-medium">
                          {(refund as any).refunded_by_profile?.first_name && (refund as any).refunded_by_profile?.last_name
                            ? `${(refund as any).refunded_by_profile.first_name} ${(refund as any).refunded_by_profile.last_name}`
                            : refund.refunded_by
                            ? `Staff ID: ${refund.refunded_by.substring(0, 8)}...`
                            : "N/A"}
                        </span>
                      </div>
                      {refund.reason && (
                        <div className="pt-2">
                          <p className="text-xs text-muted-foreground mb-1">Reason:</p>
                          <p className="text-xs text-foreground bg-muted/50 rounded-lg p-2">
                            {refund.reason}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Refundable Payments */}
        {payments && payments.length > 0 ? (
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-xl font-display uppercase tracking-wide">
                Refundable Payments
              </CardTitle>
              <CardDescription>
                Select a payment to process a refund
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {/* Desktop Table View */}
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Student</TableHead>
                      <TableHead className="font-semibold">Contract</TableHead>
                      <TableHead className="font-semibold">Amount</TableHead>
                      <TableHead className="font-semibold">Type</TableHead>
                      <TableHead className="font-semibold text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          {format(new Date(payment.created_at), "d MMM yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">Application {payment.application_id?.substring(0, 8)}...</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {(payment.application as any)?.contract?.slug || "—"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(payment.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="uppercase">
                            {payment.payment_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full uppercase tracking-wide gap-2"
                            onClick={() => handleRefund(payment)}
                          >
                            <DollarSign className="h-4 w-4" />
                            Refund
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View */}
              <div className="block lg:hidden divide-y">
                {payments.map((payment) => (
                  <div key={payment.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm font-medium truncate">
                            Application {payment.application_id?.substring(0, 8)}...
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-1">
                          {format(new Date(payment.created_at), "d MMM yyyy")}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {(payment.application as any)?.contract?.slug || "—"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-lg font-bold">
                          {formatCurrency(payment.amount)}
                        </span>
                        <Badge variant="outline" className="uppercase text-[10px]">
                          {payment.payment_type}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full rounded-full uppercase tracking-wide gap-2"
                        onClick={() => handleRefund(payment)}
                      >
                        <DollarSign className="h-4 w-4" />
                        Process Refund
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-3xl border-dashed">
            <CardHeader>
              <CardTitle className="text-xl font-display uppercase tracking-wide">
                No Refundable Payments
              </CardTitle>
              <CardDescription>
                There are no payments available for refund at this time.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-display uppercase tracking-wide">
              Process Refund
            </DialogTitle>
            <DialogDescription>
              Process a refund for this payment. The refund will be issued to the original payment method.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="amount">Refund Amount (£) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="mt-2"
              />
              {selectedPayment && (
                <p className="text-xs text-muted-foreground mt-1">
                  Original amount: {formatCurrency(selectedPayment.amount)}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="reason">Refund Reason *</Label>
              <Textarea
                id="reason"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="mt-2"
                rows={4}
                placeholder="Enter the reason for this refund..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundDialogOpen(false)} className="rounded-full uppercase tracking-wide">
              Cancel
            </Button>
            <Button
              onClick={handleSubmitRefund}
              disabled={processRefund.isPending}
              className="rounded-full uppercase tracking-wide"
            >
              {processRefund.isPending ? "Processing..." : "Process Refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default Refunds;


