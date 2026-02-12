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
      return (data || []).map((row) => ({ ...row, instalment_number: row.sequence }));
    },
    enabled: open && selectedType === "instalment" && !!applicationId,
  });

  // Check if application already has a deposit (prevent duplicate)
  const { data: hasDeposit } = useQuery({
    queryKey: ["application-has-deposit", applicationId],
    queryFn: async () => {
      const { data: app } = await supabase
        .from("student_applications")
        .select("deposit_payment_intent_id")
        .eq("id", applicationId)
        .single();
      if (app?.deposit_payment_intent_id) return true;
      const { data: existing } = await supabase
        .from("manual_payments")
        .select("id")
        .eq("application_id", applicationId)
        .eq("payment_type", "deposit")
        .limit(1)
        .maybeSingle();
      return !!existing;
    },
    enabled: open && !!applicationId,
  });

  // Fetch expected deposit: payment_plans.deposit_amount, then contract + studio_grade_prices fallback
  const { data: depositAmount } = useQuery({
    queryKey: ["application-deposit", applicationId],
    queryFn: async () => {
      const { data: app, error: appError } = await supabase
        .from("student_applications")
        .select("id, selected_payment_plan_id, contract_id, studio_grade_id")
        .eq("id", applicationId)
        .single();

      if (appError) throw appError;

      // 1) From selected payment plan (payment_plans table)
      if (app?.selected_payment_plan_id) {
        const { data: plan } = await supabase
          .from("payment_plans")
          .select("deposit_amount")
          .eq("id", app.selected_payment_plan_id)
          .single();
        if (plan?.deposit_amount != null) return Number(plan.deposit_amount);
      }

      // 2) Fallback: contract deposit_override or studio_grade_prices for this academic year + grade
      if (!app?.contract_id) return null;
      const { data: contract } = await supabase
        .from("contracts")
        .select("deposit_override, academic_year_id")
        .eq("id", app.contract_id)
        .single();
      if (contract?.deposit_override != null) return Number(contract.deposit_override);
      if (contract?.academic_year_id && app?.studio_grade_id) {
        const { data: sgp } = await supabase
          .from("studio_grade_prices")
          .select("deposit_amount_override")
          .eq("academic_year_id", contract.academic_year_id)
          .eq("studio_grade_id", app.studio_grade_id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        if (sgp?.deposit_amount_override != null) return Number(sgp.deposit_amount_override);
      }
      return null;
    },
    enabled: open && selectedType === "deposit",
  });

  useEffect(() => {
    if (open) {
      setSelectedType(paymentType);
    }
  }, [open, paymentType]);

  useEffect(() => {
    if (open && hasDeposit === true && selectedType === "deposit") {
      setSelectedType("instalment");
    }
  }, [open, hasDeposit, selectedType]);

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
    } catch (error: unknown) {
      console.error("Failed to record payment:", error);
      const message = error instanceof Error ? error.message : "Failed to record payment. Please try again.";
      toast({
        title: "Error",
        description: message,
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
        <div className="space-y-3 py-2">
          <Select
            value={selectedType}
            onValueChange={(value) => setSelectedType(value as "deposit" | "instalment")}
          >
            <SelectTrigger id="payment-type" aria-label="Payment type">
              <SelectValue placeholder="Deposit or instalment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deposit" disabled={hasDeposit === true}>
                Deposit{hasDeposit === true ? " (already recorded)" : ""}
              </SelectItem>
              <SelectItem value="instalment">Instalment</SelectItem>
            </SelectContent>
          </Select>
          {hasDeposit === true && (
            <p className="text-xs text-muted-foreground">Deposit already recorded—use Instalment if needed.</p>
          )}

          {selectedType === "instalment" && (
            <Select value={selectedInstalmentId} onValueChange={setSelectedInstalmentId}>
              <SelectTrigger id="instalment" aria-label="Instalment">
                <SelectValue placeholder="Select instalment (number, amount, due date)" />
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
          )}

          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount (£)"
            aria-label="Amount in pounds"
          />

          <Select
            value={paymentMethod}
            onValueChange={(value) =>
              setPaymentMethod(value as "cash" | "card" | "bank_transfer" | "cheque")
            }
          >
            <SelectTrigger id="payment-method" aria-label="Payment method">
              <SelectValue placeholder="Cash, card, bank transfer or cheque" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
            </SelectContent>
          </Select>

          <Input
            id="receipt-number"
            value={receiptNumber}
            onChange={(e) => setReceiptNumber(e.target.value)}
            placeholder="Receipt number (optional)"
            aria-label="Receipt number optional"
          />

          <Input
            id="payment-date"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            aria-label="Payment date"
          />

          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="min-h-[60px] resize-none"
            rows={2}
            aria-label="Notes optional"
          />
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

