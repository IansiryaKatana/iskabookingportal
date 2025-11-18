import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateManualPayment } from "@/hooks/useManualPayment";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ManualPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  paymentType?: "deposit" | "instalment";
}

const ManualPaymentDialog = ({
  open,
  onOpenChange,
  applicationId,
  paymentType = "deposit",
}: ManualPaymentDialogProps) => {
  const { toast } = useToast();
  const createPayment = useCreateManualPayment();
  const [selectedType, setSelectedType] = useState<"deposit" | "instalment">(paymentType);
  const [selectedInstalmentId, setSelectedInstalmentId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bank_transfer" | "cheque">("cash");
  const [receiptNumber, setReceiptNumber] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState<string>("");

  // Fetch instalments for this application
  const { data: instalments } = useQuery({
    queryKey: ["application-instalments", applicationId],
    queryFn: async () => {
      if (!applicationId) return [];

      // First get the application to find the contract_id
      const { data: app, error: appError } = await supabase
        .from("student_applications")
        .select("contract_id")
        .eq("id", applicationId)
        .single();

      if (appError || !app?.contract_id) return [];

      // Then get the payment schedule for that contract
      const { data, error } = await supabase
        .from("contract_payment_schedule")
        .select("id, due_date, amount, sequence")
        .eq("contract_id", app.contract_id)
        .order("sequence", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: open && selectedType === "instalment" && !!applicationId,
  });

  // Fetch deposit amount from application's selected payment plan
  const { data: depositAmount } = useQuery({
    queryKey: ["application-deposit", applicationId],
    queryFn: async () => {
      // Get the application with selected payment plan
      const { data: app, error: appError } = await supabase
        .from("student_applications")
        .select("id, selected_payment_plan_id")
        .eq("id", applicationId)
        .single();

      if (appError) throw appError;
      if (!app?.selected_payment_plan_id) return null;

      // Get the payment plan deposit amount
      const { data: plan, error: planError } = await supabase
        .from("contract_payment_plans")
        .select("deposit_amount")
        .eq("id", app.selected_payment_plan_id)
        .single();

      if (planError) throw planError;
      return plan?.deposit_amount || null;
    },
    enabled: open && selectedType === "deposit",
  });

  useEffect(() => {
    if (selectedType === "deposit" && depositAmount) {
      setAmount(depositAmount.toString());
    } else if (selectedType === "instalment" && selectedInstalmentId) {
      const instalment = instalments?.find((i) => i.id === selectedInstalmentId);
      if (instalment) {
        setAmount(instalment.amount.toString());
      }
    } else {
      setAmount("");
    }
  }, [selectedType, depositAmount, selectedInstalmentId, instalments]);

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid payment amount.",
        variant: "destructive",
      });
      return;
    }

    if (selectedType === "instalment" && !selectedInstalmentId) {
      toast({
        title: "Instalment required",
        description: "Please select an instalment to pay.",
        variant: "destructive",
      });
      return;
    }

    try {
      await createPayment.mutateAsync({
        applicationId,
        paymentType: selectedType,
        instalmentId: selectedType === "instalment" ? selectedInstalmentId : undefined,
        amount: parseFloat(amount),
        paymentMethod,
        receiptNumber: receiptNumber.trim() || undefined,
        paymentDate,
        notes: notes.trim() || undefined,
      });

      toast({
        title: "Payment recorded",
        description: `Successfully recorded ${selectedType} payment of £${amount}.`,
      });

      // Reset form
      setAmount("");
      setReceiptNumber("");
      setNotes("");
      setSelectedInstalmentId("");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to record payment:", error);
      toast({
        title: "Error",
        description: "Failed to record payment. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-display uppercase tracking-wide">
            Record Manual Payment
          </DialogTitle>
          <DialogDescription>
            Record a payment that was made in person (cash, card, bank transfer, or cheque).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="payment-type">Payment Type</Label>
            <Select value={selectedType} onValueChange={(value) => setSelectedType(value as "deposit" | "instalment")}>
              <SelectTrigger id="payment-type" className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deposit">Deposit</SelectItem>
                <SelectItem value="instalment">Instalment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedType === "instalment" && (
            <div>
              <Label htmlFor="instalment">Instalment</Label>
              <Select value={selectedInstalmentId} onValueChange={setSelectedInstalmentId}>
                <SelectTrigger id="instalment" className="mt-2">
                  <SelectValue placeholder="Select instalment" />
                </SelectTrigger>
                <SelectContent>
                  {instalments?.map((instalment) => (
                    <SelectItem key={instalment.id} value={instalment.id}>
                      Instalment {instalment.instalment_number} - £{instalment.amount} (Due:{" "}
                      {new Date(instalment.due_date).toLocaleDateString("en-GB")})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="amount">Amount (£)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-2"
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
            <Label htmlFor="receipt-number">Receipt Number (Optional)</Label>
            <Input
              id="receipt-number"
              value={receiptNumber}
              onChange={(e) => setReceiptNumber(e.target.value)}
              placeholder="Enter receipt number"
              className="mt-2"
            />
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full uppercase tracking-wide">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ManualPaymentDialog;

