import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
import { useInstallmentBreakdown, usePaidInstalmentIds, usePaymentSummary, useUnifiedPayments } from "@/hooks/useUnifiedPayments";
import { getEffectiveWeeks } from "@/utils/contractDuration";
import { useFormDraft } from "@/hooks/useFormDraft";

type DialogInstalment = {
  id: string;
  due_date: string;
  amount: number;
  sequence: number;
  instalment_number: number;
};

interface ManualPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  paymentType?: "deposit" | "instalment";
}

const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

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

  const paymentDraft = useMemo(
    () => ({
      selectedType,
      selectedInstalmentId,
      amount,
      paymentMethod,
      receiptNumber,
      paymentDate,
      notes,
    }),
    [
      selectedType,
      selectedInstalmentId,
      amount,
      paymentMethod,
      receiptNumber,
      paymentDate,
      notes,
    ],
  );

  const applyPaymentDraft = useCallback(
    (draft: Partial<typeof paymentDraft>) => {
      if (draft.selectedType !== undefined) setSelectedType(draft.selectedType);
      if (draft.selectedInstalmentId !== undefined) {
        setSelectedInstalmentId(draft.selectedInstalmentId);
      }
      if (draft.amount !== undefined) setAmount(draft.amount);
      if (draft.paymentMethod !== undefined) setPaymentMethod(draft.paymentMethod);
      if (draft.receiptNumber !== undefined) setReceiptNumber(draft.receiptNumber);
      if (draft.paymentDate !== undefined) setPaymentDate(draft.paymentDate);
      if (draft.notes !== undefined) setNotes(draft.notes);
    },
    [],
  );

  const { clearDraft: clearPaymentDraft } = useFormDraft(
    `manual-payment-draft-${applicationId}`,
    paymentDraft,
    applyPaymentDraft,
    { enabled: open },
  );

  const lastAutoFillKeyRef = useRef("");

  const { data: paymentSummary } = usePaymentSummary(applicationId);
  const paymentCount = Number(paymentSummary?.payment_count ?? 0);

  // When application has selected_payment_plan_id, build instalment list from the PLAN (same as page schedule)
  // so amounts and count match (e.g. 10 × £816). Map each to contract_payment_schedule id for recording.
  // When no plan, use contract_payment_schedule and filter by paid IDs/sequences.
  const { data: instalments } = useQuery({
    queryKey: ["application-instalments-dialog", applicationId],
    queryFn: async (): Promise<DialogInstalment[]> => {
      if (!applicationId) return [];

      const { data: app, error: appError } = await supabase
        .from("student_applications")
        .select("contract_id, selected_payment_plan_id")
        .eq("id", applicationId)
        .single();

      if (appError || !app?.contract_id) return [];

      if (app.selected_payment_plan_id) {
        const { data: contract, error: contractError } = await supabase
          .from("contracts")
          .select("id, contract_start, weeks, extra_days, weekly_price_override, deposit_override, academic_year_id, studio_grade_id")
          .eq("id", app.contract_id)
          .maybeSingle();
        if (contractError || !contract) return [];

        const { data: priceData } = await supabase
          .from("studio_grade_prices")
          .select("weekly_price")
          .eq("academic_year_id", contract.academic_year_id)
          .eq("studio_grade_id", contract.studio_grade_id)
          .eq("is_active", true)
          .maybeSingle();
        const weeklyPrice = contract.weekly_price_override ?? priceData?.weekly_price ?? 0;
        const installmentBase = weeklyPrice * getEffectiveWeeks(contract);

        let depositAmount = 0;
        if (contract.deposit_override != null) depositAmount = Number(contract.deposit_override);
        else {
          const { data: plan } = await supabase
            .from("payment_plans")
            .select("deposit_amount")
            .eq("id", app.selected_payment_plan_id)
            .maybeSingle();
          if (plan?.deposit_amount != null) depositAmount = Number(plan.deposit_amount);
        }

        const { data: allPlanRows, error: planErr } = await supabase
          .from("payment_plan_installments")
          .select("*")
          .eq("payment_plan_id", app.selected_payment_plan_id)
          .order("sequence", { ascending: true });
        if (planErr || !allPlanRows?.length) return [];

        const planInstalments = allPlanRows.filter(
          (r) => !(r.label ?? "").toLowerCase().includes("deposit")
        );
        if (planInstalments.length === 0) return [];

        const planSchedule = planInstalments.map((inst, index) => {
          let amt = 0;
          if (inst.amount_type === "percentage") amt = roundCurrency((installmentBase * Number(inst.amount_value)) / 100);
          else if (inst.amount_type === "fixed") amt = Number(inst.amount_value);
          let dueDate: string;
          if (inst.due_date) dueDate = new Date(inst.due_date).toISOString().split("T")[0];
          else if (inst.due_date_offset_days != null) {
            const d = new Date(contract.contract_start);
            d.setDate(d.getDate() + inst.due_date_offset_days);
            dueDate = d.toISOString().split("T")[0];
          } else dueDate = contract.contract_start;
          return { amount: amt, due_date: dueDate, sequence: inst.sequence, label: inst.label ?? `Instalment ${inst.sequence}` };
        });
        if (planSchedule.length > 0) {
          const lastIdx = planSchedule.length - 1;
          const sumPrev = planSchedule.slice(0, lastIdx).reduce((s, i) => s + i.amount, 0);
          planSchedule[lastIdx].amount = roundCurrency(installmentBase - sumPrev);
        }

        const { data: scheduleRows, error: schedErr } = await supabase
          .from("contract_payment_schedule")
          .select("id, sequence, label")
          .eq("contract_id", app.contract_id)
          .order("sequence", { ascending: true });
        if (schedErr) return [];

        const nonDepositRows = (scheduleRows ?? []).filter(
          (row) => !String((row as { label?: string }).label ?? "").toLowerCase().includes("deposit")
        );
        const firstN = nonDepositRows.slice(0, planSchedule.length);

        return firstN.map((row, i) => ({
          id: row.id,
          due_date: planSchedule[i].due_date,
          amount: planSchedule[i].amount,
          sequence: row.sequence,
          instalment_number: i + 1,
        }));
      }

      const { data, error } = await supabase
        .from("contract_payment_schedule")
        .select("id, due_date, amount, sequence")
        .eq("contract_id", app.contract_id)
        .order("sequence", { ascending: true });
      if (error) throw error;
      return (data || []).map((row) => ({
        id: row.id,
        due_date: row.due_date ?? "",
        amount: Number(row.amount) || 0,
        sequence: row.sequence ?? 0,
        instalment_number: row.sequence ?? 0,
      }));
    },
    enabled: open && selectedType === "instalment" && !!applicationId,
    refetchOnWindowFocus: false,
  });

  const { data: paidInstalmentIds } = usePaidInstalmentIds(applicationId);
  const { data: unifiedPayments } = useUnifiedPayments(applicationId);
  const { data: installmentBreakdown } = useInstallmentBreakdown(applicationId);
  const paidSequences = useMemo(
    () =>
      new Set(
        (unifiedPayments ?? [])
          .filter((p) => p.installment_number != null)
          .map((p) => p.installment_number as number)
      ),
    [unifiedPayments]
  );

  const usedPlanBasedSchedule = useMemo(() => {
    const list = instalments ?? [];
    if (list.length === 0) return false;
    return list.every((r, i) => r.instalment_number === i + 1);
  }, [instalments]);

  const unpaidInstalments = useMemo(() => {
    const list = instalments ?? [];
    if (list.length === 0) return [];
    // Prefer precise per-instalment breakdown when available: exclude only fully paid instalments.
    // Overlay remaining_amount so dropdown labels match autofill / waterfall (includes discount).
    if (installmentBreakdown && installmentBreakdown.length > 0) {
      const byId = new Map(installmentBreakdown.map((b) => [b.installment_id, b]));
      return list
        .filter((inst) => {
          const b = byId.get(inst.id);
          return !b || b.payment_status !== "paid";
        })
        .map((inst) => {
          const b = byId.get(inst.id);
          if (!b) return inst;
          const displayAmount =
            b.remaining_amount > 0 ? Number(b.remaining_amount) : Number(b.amount_due);
          return { ...inst, amount: displayAmount };
        });
    }
    // Fallback to existing logic if breakdown is not available.
    if (usedPlanBasedSchedule) {
      return list.filter((_, index) => index >= paymentCount);
    }
    return list.filter(
      (inst) => !(paidInstalmentIds?.has(inst.id) ?? false) && !paidSequences.has(inst.sequence)
    );
  }, [instalments, paidInstalmentIds, paidSequences, paymentCount, usedPlanBasedSchedule, installmentBreakdown]);

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
    refetchOnWindowFocus: false,
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
    if (!open) {
      lastAutoFillKeyRef.current = "";
      return;
    }

    const autoFillKey = `${selectedType}:${selectedInstalmentId}:${depositAmount ?? ""}`;
    if (autoFillKey === lastAutoFillKeyRef.current) return;

    if (selectedType === "deposit" && depositAmount) {
      lastAutoFillKeyRef.current = autoFillKey;
      setAmount(depositAmount.toString());
    } else if (selectedType === "instalment" && selectedInstalmentId) {
      const breakdown = installmentBreakdown?.find(
        (b) => b.installment_id === selectedInstalmentId,
      );
      if (breakdown && breakdown.remaining_amount > 0) {
        lastAutoFillKeyRef.current = autoFillKey;
        setAmount(breakdown.remaining_amount.toString());
      } else {
        const instalment = instalments?.find((i) => i.id === selectedInstalmentId);
        if (instalment) {
          lastAutoFillKeyRef.current = autoFillKey;
          setAmount(instalment.amount.toString());
        }
      }
    } else if (selectedType === "deposit") {
      lastAutoFillKeyRef.current = autoFillKey;
      setAmount("");
    }
  }, [
    open,
    selectedType,
    depositAmount,
    selectedInstalmentId,
    instalments,
    installmentBreakdown,
  ]);

  // Clear selected instalment if it's no longer in unpaid list (e.g. just got paid)
  useEffect(() => {
    if (selectedType === "instalment" && selectedInstalmentId && unpaidInstalments.length > 0) {
      const stillUnpaid = unpaidInstalments.some((i) => i.id === selectedInstalmentId);
      if (!stillUnpaid) setSelectedInstalmentId("");
    }
  }, [selectedType, selectedInstalmentId, unpaidInstalments]);

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

    const parsedAmount = parseFloat(amount);

    try {
      // Instalment waterfall behaviour: allow a single payment to top up the
      // selected instalment and then spill into later instalments (by sequence)
      // until the amount is exhausted.
      if (
        selectedType === "instalment" &&
        selectedInstalmentId &&
        installmentBreakdown &&
        installmentBreakdown.length > 0
      ) {
        const ordered = [...installmentBreakdown].sort(
          (a, b) => a.sequence - b.sequence,
        );
        const startIdx = ordered.findIndex(
          (b) => b.installment_id === selectedInstalmentId,
        );

        if (startIdx !== -1) {
          const targetSlice = ordered
            .slice(startIdx)
            .filter(
              (b) => b.payment_status !== "paid" && b.remaining_amount > 0,
            );

          const totalRemainingFromStart = targetSlice.reduce(
            (sum, row) => sum + Number(row.remaining_amount ?? 0),
            0,
          );

          if (parsedAmount > totalRemainingFromStart + 0.01) {
            toast({
              title: "Amount too high",
              description: `Total remaining from this instalment onwards is £${totalRemainingFromStart.toFixed(
                2,
              )}. Please enter an amount up to that total.`,
              variant: "destructive",
            });
            return;
          }

          // If paying only up to the selected instalment's remaining balance,
          // record a single payment as before.
          const first = targetSlice[0];
          if (parsedAmount <= Number(first.remaining_amount) + 0.01) {
            await createPayment.mutateAsync({
              applicationId,
              paymentType: "instalment",
              instalmentId: first.installment_id,
              amount: parsedAmount,
              paymentMethod,
              receiptNumber: receiptNumber.trim() || undefined,
              paymentDate,
              notes: notes.trim() || undefined,
            });
          } else {
            // Waterfall: split across multiple instalments.
            // To respect the unique receipt_number constraint, only the first
            // allocation carries the receipt/cheque number; subsequent rows
            // omit it (null), while still updating installment balances.
            let remainingToAllocate = parsedAmount;
            let isFirstAllocation = true;

            for (const row of targetSlice) {
              if (remainingToAllocate <= 0.01) break;
              const remainingForRow = Number(row.remaining_amount ?? 0);
              if (remainingForRow <= 0.01) continue;

              const allocate = Math.min(remainingForRow, remainingToAllocate);
              await createPayment.mutateAsync({
                applicationId,
                paymentType: "instalment",
                instalmentId: row.installment_id,
                amount: allocate,
                paymentMethod,
                receiptNumber: isFirstAllocation ? receiptNumber.trim() || undefined : undefined,
                paymentDate,
                notes: notes.trim() || undefined,
              });
              remainingToAllocate -= allocate;
              isFirstAllocation = false;
            }
          }
        } else {
          // Fallback: selected instalment not found in breakdown; record a single payment.
          await createPayment.mutateAsync({
            applicationId,
            paymentType: "instalment",
            instalmentId: selectedInstalmentId,
            amount: parsedAmount,
            paymentMethod,
            receiptNumber: receiptNumber.trim() || undefined,
            paymentDate,
            notes: notes.trim() || undefined,
          });
        }
      } else {
        // Deposit or no breakdown available: single payment.
        await createPayment.mutateAsync({
          applicationId,
          paymentType: selectedType,
          instalmentId:
            selectedType === "instalment" ? selectedInstalmentId : undefined,
          amount: parsedAmount,
          paymentMethod,
          receiptNumber: receiptNumber.trim() || undefined,
          paymentDate,
          notes: notes.trim() || undefined,
        });
      }

      toast({
        title: "Payment recorded",
        description: `Successfully recorded ${selectedType} payment of £${amount}.`,
      });

      // Reset form
      setAmount("");
      setReceiptNumber("");
      setNotes("");
      setSelectedInstalmentId("");
      clearPaymentDraft();
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
            <>
              <Select value={selectedInstalmentId} onValueChange={setSelectedInstalmentId}>
                <SelectTrigger id="instalment" aria-label="Instalment">
                  <SelectValue placeholder="Select instalment (number, amount, due date)" />
                </SelectTrigger>
                <SelectContent>
                  {unpaidInstalments.map((instalment) => (
                    <SelectItem key={instalment.id} value={instalment.id}>
                      Instalment {instalment.instalment_number} - £
                      {Number(instalment.amount).toFixed(2)} (Due:{" "}
                      {new Date(instalment.due_date).toLocaleDateString("en-GB")})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {unpaidInstalments.length === 0 && (instalments?.length ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground">All installments are already paid.</p>
              )}
            </>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-md uppercase tracking-wide">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createPayment.isPending}
            className="rounded-md uppercase tracking-wide"
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

