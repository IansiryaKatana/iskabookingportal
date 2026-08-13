import { useEffect, useMemo, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { CalendarPlus, CreditCard, Loader2, Plus, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { FinanceStatusBadge } from "@/components/finance/FinanceStatusBadge";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import {
  useCancelEarlyCheckIn,
  useCreateEarlyCheckIn,
  useEarlyCheckInNightlyRate,
  useEarlyCheckInPayments,
  useEarlyCheckInSummary,
  useRecordEarlyCheckInPayment,
} from "@/hooks/useEarlyCheckIn";
import { OTA_PAYMENT_STATUS_LABELS, type OTAPaymentStatus } from "@/utils/otaPayment";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  card: "Card",
  stripe: "Stripe",
  other: "Other",
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  payment: "Payment",
  refund: "Refund",
  adjustment: "Adjustment",
};

const formatMoney = (amount: number | null | undefined, currency = "GBP") => {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

type EarlyCheckInSectionProps = {
  applicationId: string;
  applicationStatus: string;
  assignedStudioId: string | null | undefined;
  contractStart: string | null;
  createSheetOpen?: boolean;
  onCreateSheetOpenChange?: (open: boolean) => void;
};

const EarlyCheckInSection = ({
  applicationId,
  applicationStatus,
  assignedStudioId,
  contractStart,
  createSheetOpen: controlledCreateOpen,
  onCreateSheetOpenChange,
}: EarlyCheckInSectionProps) => {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const { data: summary, isLoading: summaryLoading } = useEarlyCheckInSummary(applicationId);
  const { data: payments, isLoading: paymentsLoading } = useEarlyCheckInPayments(applicationId);
  const { data: defaultRate, isLoading: rateLoading } = useEarlyCheckInNightlyRate(applicationId);

  const createEci = useCreateEarlyCheckIn();
  const cancelEci = useCancelEarlyCheckIn();
  const recordPayment = useRecordEarlyCheckInPayment();

  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const createOpen = controlledCreateOpen ?? internalCreateOpen;
  const setCreateOpen = (open: boolean) => {
    onCreateSheetOpenChange?.(open);
    if (controlledCreateOpen === undefined) setInternalCreateOpen(open);
  };

  const [eciDate, setEciDate] = useState("");
  const [nightlyRate, setNightlyRate] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [recordOpen, setRecordOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payType, setPayType] = useState<"payment" | "refund" | "adjustment">("payment");
  const [payReference, setPayReference] = useState("");
  const [payNotes, setPayNotes] = useState("");

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const hasActiveEci = summary?.status === "confirmed";
  const canCreate =
    applicationStatus === "confirmed" &&
    Boolean(assignedStudioId) &&
    Boolean(contractStart) &&
    !hasActiveEci;

  const nightsPreview = useMemo(() => {
    if (!eciDate || !contractStart) return 0;
    try {
      return Math.max(0, differenceInCalendarDays(parseISO(contractStart), parseISO(eciDate)));
    } catch {
      return 0;
    }
  }, [eciDate, contractStart]);

  const previewAmount = useMemo(() => {
    const rate = Number(nightlyRate);
    if (!rate || !nightsPreview) return 0;
    return Math.round((rate * nightsPreview + Number.EPSILON) * 100) / 100;
  }, [nightlyRate, nightsPreview]);

  const maxEciDate = useMemo(() => {
    if (!contractStart) return undefined;
    try {
      const d = parseISO(contractStart);
      d.setDate(d.getDate() - 1);
      return format(d, "yyyy-MM-dd");
    } catch {
      return undefined;
    }
  }, [contractStart]);

  useEffect(() => {
    if (!createOpen) return;
    setEciDate("");
    setCreateNotes("");
    setCreateError(null);
    setNightlyRate(defaultRate != null ? String(defaultRate) : "");
    // Only reset when the sheet opens; rate fill below handles late-loaded defaults.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen]);

  useEffect(() => {
    if (!createOpen) return;
    if (defaultRate == null) return;
    setNightlyRate((current) => (current === "" ? String(defaultRate) : current));
  }, [createOpen, defaultRate]);

  useEffect(() => {
    if (!recordOpen) return;
    setPayAmount(summary?.remaining_balance ? String(summary.remaining_balance) : "");
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod("bank_transfer");
    setPayType(summary?.status === "cancelled" ? "refund" : "payment");
    setPayReference("");
    setPayNotes("");
  }, [recordOpen, summary?.remaining_balance, summary?.status]);

  const handleCreate = async () => {
    setCreateError(null);
    if (!eciDate) {
      const message = "Choose an early check-in date.";
      setCreateError(message);
      toast({ title: "Date required", description: message, variant: "destructive" });
      return;
    }
    if (contractStart && eciDate >= contractStart) {
      const message = "Early check-in must be before the contract start date.";
      setCreateError(message);
      toast({
        title: "Invalid date",
        description: message,
        variant: "destructive",
      });
      return;
    }
    if (nightsPreview <= 0) {
      const message = "Date must produce at least one night.";
      setCreateError(message);
      toast({ title: "Invalid nights", description: message, variant: "destructive" });
      return;
    }

    const rateNum = Number(nightlyRate);
    const override =
      defaultRate != null && Math.abs(rateNum - defaultRate) > 0.0001 ? rateNum : null;

    try {
      await createEci.mutateAsync({
        applicationId,
        earlyCheckInDate: eciDate,
        notes: createNotes,
        nightlyRateOverride: override != null && !Number.isNaN(override) ? override : null,
      });
      toast({ title: "Early check-in created" });
      setCreateOpen(false);
    } catch (err: unknown) {
      const message = getErrorMessage(err, "Please try again.");
      setCreateError(message);
      toast({
        title: "Unable to create early check-in",
        description: message,
        variant: "destructive",
      });
    }
  };

  const handleRecordPayment = async () => {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      toast({ title: "Invalid amount", description: "Enter an amount greater than zero.", variant: "destructive" });
      return;
    }
    if (!payReference.trim()) {
      toast({ title: "Reference required", description: "Enter a payment reference.", variant: "destructive" });
      return;
    }
    try {
      await recordPayment.mutateAsync({
        applicationId,
        amount,
        paymentDate: payDate,
        referenceNumber: payReference,
        paymentMethod: payMethod as "bank_transfer" | "cash" | "card" | "stripe" | "other",
        paymentType: payType,
        notes: payNotes,
      });
      toast({ title: "Payment recorded" });
      setRecordOpen(false);
    } catch (err: unknown) {
      toast({
        title: "Unable to record payment",
        description: getErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    }
  };

  const handleCancel = async () => {
    try {
      await cancelEci.mutateAsync({
        applicationId,
        reason: cancelReason,
      });
      toast({ title: "Early check-in cancelled" });
      setCancelOpen(false);
      setCancelReason("");
    } catch (err: unknown) {
      toast({
        title: "Unable to cancel",
        description: getErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    }
  };

  if (summaryLoading) {
    return <Skeleton className="h-40 w-full rounded-3xl" />;
  }

  if (!summary && !canCreate) {
    return null;
  }

  const currency = summary?.currency ?? "GBP";
  const progressPct =
    summary && summary.amount_due > 0
      ? Math.min(100, (summary.total_received / summary.amount_due) * 100)
      : 0;
  const canRecordPayment =
    Boolean(summary) &&
    (summary!.status === "confirmed"
      ? !["fully_paid", "no_amount_due"].includes(summary!.payment_status)
      : summary!.status === "cancelled");

  return (
    <>
      <Card id="early-check-in-section" className="rounded-3xl">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base sm:text-lg font-display uppercase tracking-wide flex items-center gap-2">
              <CalendarPlus className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-sm sm:text-base">Early check-in</span>
              {summary && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] uppercase tracking-wide",
                    summary.status === "confirmed"
                      ? "border-emerald-500/40 text-emerald-700 bg-emerald-50"
                      : "border-slate-400/40 text-slate-600 bg-slate-50",
                  )}
                >
                  {summary.status}
                </Badge>
              )}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {canCreate && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-md gap-1"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add early check-in
                </Button>
              )}
              {summary && canRecordPayment && (
                <Button
                  type="button"
                  size="sm"
                  className="rounded-md gap-1"
                  onClick={() => setRecordOpen(true)}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Record payment
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!summary && canCreate && (
            <p className="text-sm text-muted-foreground">
              Charge for nights before the contract start. Unpaid status does not block check-in.
            </p>
          )}

          {summary && (
            <>
              <div className="rounded-2xl border bg-muted/30 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Early check-in</p>
                    <p className="font-semibold">
                      {format(parseISO(summary.early_check_in_date), "dd MMM yyyy")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Until contract start</p>
                    <p className="font-semibold">
                      {format(parseISO(summary.early_check_out_date), "dd MMM yyyy")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Nights</p>
                    <p className="font-semibold">{summary.nights}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Nightly rate</p>
                    <p className="font-semibold">{formatMoney(summary.nightly_rate, currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Amount due</p>
                    <p className="font-semibold">{formatMoney(summary.amount_due, currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Received</p>
                    <p className="font-semibold text-green-600">
                      {formatMoney(summary.total_received, currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Remaining</p>
                    <p className="font-semibold">{formatMoney(summary.remaining_balance, currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Payment status</p>
                    <FinanceStatusBadge
                      status={summary.payment_status}
                      label={
                        OTA_PAYMENT_STATUS_LABELS[summary.payment_status as OTAPaymentStatus] ??
                        summary.payment_status
                      }
                    />
                  </div>
                </div>
                {summary.status === "confirmed" && summary.amount_due > 0 && (
                  <>
                    <Progress value={progressPct} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(summary.total_received, currency)} of{" "}
                      {formatMoney(summary.amount_due, currency)} received
                    </p>
                  </>
                )}
              </div>

              {paymentsLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : payments && payments.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Amount</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs">Method</TableHead>
                        <TableHead className="text-xs">Reference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs">
                            {format(parseISO(p.payment_date), "dd MMM yyyy")}
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            {p.payment_type === "refund" ? "−" : ""}
                            {formatMoney(p.amount, p.currency)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {PAYMENT_TYPE_LABELS[p.payment_type] ?? p.payment_type}
                          </TableCell>
                          <TableCell className="text-xs">
                            {PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method}
                          </TableCell>
                          <TableCell className="text-xs">{p.reference_number}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No payments recorded yet.</p>
              )}

              {summary.status === "confirmed" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-md text-destructive hover:bg-destructive/10 hover:text-destructive gap-1"
                  onClick={() => setCancelOpen(true)}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancel early check-in
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "flex flex-col gap-0 overflow-hidden p-4 sm:p-6",
            isMobile ? "max-h-[90vh] mb-0 rounded-t-2xl" : "h-full w-full sm:max-w-md",
            "[&>button]:!flex [&>button]:!h-8 [&>button]:!w-8 [&>button]:!items-center [&>button]:!justify-center",
            "[&>button]:!rounded-md [&>button]:!bg-red-500 [&>button]:!text-white [&>button]:!opacity-100",
            "[&>button]:!shadow-md [&>button]:transition-colors [&>button]:hover:!bg-red-600",
          )}
        >
          <SheetHeader className="flex-shrink-0 text-left space-y-1 pr-10">
            <SheetTitle className="text-xl font-display uppercase tracking-wide">
              Early check-in
            </SheetTitle>
            <SheetDescription>
              Add nights before the contract start
              {contractStart ? ` (${format(parseISO(contractStart), "dd MMM yyyy")})` : ""}.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="space-y-4 px-1.5 py-4">
              <div className="space-y-2">
                <Label htmlFor="eci_date">Early check-in date</Label>
                <Input
                  id="eci_date"
                  type="date"
                  value={eciDate}
                  max={maxEciDate}
                  onChange={(e) => {
                    setEciDate(e.target.value);
                    setCreateError(null);
                  }}
                  className="rounded-md"
                />
                {nightsPreview > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {nightsPreview} night{nightsPreview !== 1 ? "s" : ""} · preview{" "}
                    {formatMoney(previewAmount)}
                  </p>
                )}
              </div>
              {createError && (
                <Alert variant="destructive">
                  <AlertTitle>Unable to create early check-in</AlertTitle>
                  <AlertDescription>{createError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="eci_rate">Nightly rate (£)</Label>
                <Input
                  id="eci_rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={nightlyRate}
                  onChange={(e) => setNightlyRate(e.target.value)}
                  className="rounded-md"
                  disabled={rateLoading}
                />
                {defaultRate != null && (
                  <p className="text-xs text-muted-foreground">
                    Default from weekly rate ÷ 7: {formatMoney(defaultRate)}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="eci_notes">Notes (optional)</Label>
                <Textarea
                  id="eci_notes"
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  rows={3}
                  className="rounded-md"
                  placeholder="e.g. Arriving early for orientation"
                />
              </div>
            </div>
          </div>
          <SheetFooter className="flex-shrink-0 flex-col gap-2 pt-4 mt-0 border-t border-border/60 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto rounded-md uppercase tracking-wide"
              onClick={() => setCreateOpen(false)}
              disabled={createEci.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto rounded-md uppercase tracking-wide"
              onClick={handleCreate}
              disabled={createEci.isPending || !eciDate || nightsPreview <= 0}
            >
              {createEci.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create early check-in"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Record payment dialog */}
      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-wide">
              Record early check-in payment
            </DialogTitle>
            <DialogDescription>
              Unpaid balance does not block the student&apos;s stay.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="eci_pay_amount">Amount (£)</Label>
              <Input
                id="eci_pay_amount"
                type="number"
                min="0.01"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="rounded-md"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eci_pay_date">Payment date</Label>
              <Input
                id="eci_pay_date"
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="rounded-md"
              />
            </div>
            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={payType}
                onValueChange={(v) => setPayType(v as "payment" | "refund" | "adjustment")}
              >
                <SelectTrigger className="rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(summary?.status === "cancelled"
                    ? (["refund", "adjustment"] as const)
                    : (["payment", "refund", "adjustment"] as const)
                  ).map((value) => (
                    <SelectItem key={value} value={value}>
                      {PAYMENT_TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="eci_pay_ref">Reference</Label>
              <Input
                id="eci_pay_ref"
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                className="rounded-md"
                placeholder="Bank ref / receipt no."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eci_pay_notes">Notes (optional)</Label>
              <Textarea
                id="eci_pay_notes"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                rows={2}
                className="rounded-md"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-md"
              onClick={() => setRecordOpen(false)}
              disabled={recordPayment.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-md"
              onClick={handleRecordPayment}
              disabled={recordPayment.isPending}
            >
              {recordPayment.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save payment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-wide">
              Cancel early check-in
            </DialogTitle>
            <DialogDescription>
              This restores the contract check-in date. Existing payments remain on the ledger.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="eci_cancel_reason">Reason (optional)</Label>
            <Textarea
              id="eci_cancel_reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="rounded-md"
              placeholder="e.g. Student no longer arriving early"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-md"
              onClick={() => setCancelOpen(false)}
              disabled={cancelEci.isPending}
            >
              Keep
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-md"
              onClick={handleCancel}
              disabled={cancelEci.isPending}
            >
              {cancelEci.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                "Cancel early check-in"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EarlyCheckInSection;
