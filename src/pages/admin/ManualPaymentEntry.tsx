import { useState } from "react";
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
import { Loader2, Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const ManualPaymentEntry = () => {
  const { toast } = useToast();
  const createPayment = useCreateManualPayment();
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Form state
  const [paymentType, setPaymentType] = useState<"deposit" | "instalment">("deposit");
  const [amount, setAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bank_transfer" | "cheque">("cash");
  const [receiptNumber, setReceiptNumber] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState<string>("");

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

  return (
    <AdminLayout
      pageTitle="Manual Payment Entry"
      subtitle="Record payments made outside the system. Students can verify these payments using receipt numbers in Step 5."
    >
      <div className="space-y-6">
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
      </div>
    </AdminLayout>
  );
};

export default ManualPaymentEntry;

