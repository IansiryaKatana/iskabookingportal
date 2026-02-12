import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { useCreateManualPayment } from "@/hooks/useManualPayment";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Search, CheckCircle2, XCircle, Pencil } from "lucide-react";
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
};

const ManualPaymentEntry = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createPayment = useCreateManualPayment();
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectRequestId, setRejectRequestId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Form state
  const [paymentType, setPaymentType] = useState<"deposit" | "instalment">("deposit");
  const [amount, setAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bank_transfer" | "cheque">("cash");
  const [receiptNumber, setReceiptNumber] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState<string>("");

  // Edit state for unlinked (orphaned) payments
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  const [editAmount, setEditAmount] = useState<string>("");
  const [editPaymentMethod, setEditPaymentMethod] = useState<"cash" | "card" | "bank_transfer" | "cheque">("cash");
  const [editReceiptNumber, setEditReceiptNumber] = useState<string>("");
  const [editPaymentDate, setEditPaymentDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [editNotes, setEditNotes] = useState<string>("");

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
      return (data ?? []) as PendingRequestRow[];
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
      return (data ?? []) as ResolvedRequestRow[];
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

    if (!receiptNumber.trim()) {
      toast({
        title: "Receipt number required",
        description: "Receipt number is required for pre-application payments.",
        variant: "destructive",
      });
      return;
    }

    try {
      await createPayment.mutateAsync({
        paymentType,
        amount: parseFloat(amount),
        paymentMethod,
        receiptNumber: receiptNumber.trim(),
        paymentDate,
        notes: notes.trim() || undefined,
      });

      toast({
        title: "Payment recorded",
        description: `Successfully recorded ${paymentType} payment of £${amount} with receipt number ${receiptNumber.trim()}.`,
      });

      // Reset form
      setAmount("");
      setReceiptNumber("");
      setNotes("");
      setShowForm(false);
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
      setDeletingPaymentId(null);
      queryClient.invalidateQueries({ queryKey: ["orphaned-payments"] });
      toast({
        title: "Payment deleted",
        description: "The unlinked payment has been removed.",
      });
    },
    onError: (error) => {
      setDeletingPaymentId(null);
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

  return (
    <AdminLayout
      pageTitle="Manual Payment Entry"
      subtitle="Record payments made outside the system. Approve student payment requests or record unlinked payments."
    >
      <div className="space-y-6">
        {/* Pending student manual payment requests */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg font-display uppercase tracking-wide">
              Pending student requests
            </CardTitle>
            <CardDescription>
              Students who said they paid by bank transfer or other. Approve to record the payment and mark the instalment as paid in the portal.
            </CardDescription>
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
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">
                          {formatCurrency(Number(req.amount))}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {getPaymentMethodLabel(req.payment_method)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">Application</span>
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
                        className="rounded-full"
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
                        className="rounded-full"
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

        {/* Previously approved / rejected – so they don't just disappear */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg font-display uppercase tracking-wide">
              Previously approved / rejected
            </CardTitle>
            <CardDescription>
              Recent student payment requests you approved or rejected. Sorted by review date.
            </CardDescription>
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
                className="rounded-full"
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
                className="rounded-full"
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

        {/* Create Payment Form */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-display uppercase tracking-wide">
                  Record New Payment
                </CardTitle>
                <CardDescription>
                  Create a payment record that students can verify using the receipt/cheque number.
                </CardDescription>
              </div>
              <Button
                variant={showForm ? "outline" : "default"}
                className="rounded-full uppercase tracking-wide"
                onClick={() => setShowForm(!showForm)}
              >
                {showForm ? (
                  "Cancel"
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    New Payment
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          {showForm && (
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="payment-type">Payment Type</Label>
                  <Select
                    value={paymentType}
                    onValueChange={(value) => setPaymentType(value as "deposit" | "instalment")}
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

                <div>
                  <Label htmlFor="receipt-number">Receipt/Cheque Number *</Label>
                  <Input
                    id="receipt-number"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    placeholder="Enter receipt or cheque number"
                    className="mt-2"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    This number must be unique. Students will use this to verify their payment.
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

                <div>
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

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowForm(false);
                      setAmount("");
                      setReceiptNumber("");
                      setNotes("");
                    }}
                    className="rounded-full uppercase tracking-wide"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={createPayment.isPending}
                    className="rounded-full uppercase tracking-wide"
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
          )}
        </Card>

        {/* Orphaned Payments List */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-display uppercase tracking-wide">
                  Unlinked Payments
                </CardTitle>
                <CardDescription>
                  Payments waiting to be verified and linked by students.
                </CardDescription>
              </div>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by receipt number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 rounded-full"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
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
                          className={`uppercase rounded-full px-2.5 py-0.5 text-xs font-medium ${
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
                        className="rounded-full bg-muted/80 hover:bg-muted text-foreground"
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
                        className="rounded-full bg-red-50 hover:bg-red-100 text-red-600"
                        disabled={
                          deletingPaymentId === payment.id ||
                          deleteOrphanedPayment.isPending
                        }
                        onClick={() => {
                          if (deletingPaymentId) return;
                          setDeletingPaymentId(payment.id);
                          deleteOrphanedPayment.mutate(payment.id);
                        }}
                        aria-label="Delete payment"
                      >
                        {deletingPaymentId === payment.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
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
                    className="rounded-full uppercase tracking-wide"
                  >
                    Clear Search
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

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
                      className={`uppercase rounded-full px-2.5 py-0.5 text-xs font-medium ${
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
                className="rounded-full"
                onClick={() => setEditingPayment(null)}
              >
                Cancel
              </Button>
              <Button
                className="rounded-full"
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
      </div>
    </AdminLayout>
  );
};

export default ManualPaymentEntry;

