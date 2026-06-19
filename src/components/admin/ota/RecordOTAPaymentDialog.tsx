import { useEffect, useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCreateOTAPayment, useOTAPaymentSummary } from "@/hooks/useOTAPayments";
import type { OTABookingWithRelations } from "@/hooks/useOTABookings";
import {
  canRecordOTAPayment,
  formatOTACurrency,
} from "@/utils/otaPayment";
import { OTAPaymentStatusBadge } from "@/components/finance/FinanceStatusBadge";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type RecordOTAPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookings: OTABookingWithRelations[];
  preselectedBookingId?: string | null;
  onSuccess?: () => void;
};

const RECEIVED_FROM_OPTIONS = [
  { value: "ota_payout", label: "OTA payout" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "virtual_card", label: "Virtual card" },
  { value: "guest_direct", label: "Guest direct" },
  { value: "other", label: "Other" },
] as const;

const RecordOTAPaymentDialog = ({
  open,
  onOpenChange,
  bookings,
  preselectedBookingId,
  onSuccess,
}: RecordOTAPaymentDialogProps) => {
  const { toast } = useToast();
  const createPayment = useCreateOTAPayment();

  const eligibleBookings = useMemo(
    () => bookings.filter((b) => !["cancelled", "no_show"].includes(b.status)),
    [bookings],
  );

  const [bookingPickerOpen, setBookingPickerOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [receivedFrom, setReceivedFrom] = useState<(typeof RECEIVED_FROM_OPTIONS)[number]["value"]>("ota_payout");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  const selectedBooking = eligibleBookings.find((b) => b.id === selectedBookingId) ?? null;
  const { data: summary, isLoading: summaryLoading } = useOTAPaymentSummary(
    open && selectedBookingId ? selectedBookingId : null,
  );

  useEffect(() => {
    if (!open) return;
    if (preselectedBookingId) {
      setSelectedBookingId(preselectedBookingId);
    }
  }, [open, preselectedBookingId]);

  useEffect(() => {
    if (!open) {
      setSelectedBookingId(preselectedBookingId ?? "");
      setAmount("");
      setReceivedFrom("ota_payout");
      setReferenceNumber("");
      setPaymentDate(new Date().toISOString().split("T")[0]);
      setNotes("");
    }
  }, [open, preselectedBookingId]);

  useEffect(() => {
    if (summary && summary.remaining_balance > 0 && !amount) {
      setAmount(summary.remaining_balance.toFixed(2));
    }
  }, [summary, amount]);

  const progressPct = useMemo(() => {
    if (!summary || summary.amount_due <= 0) return 0;
    return Math.min(100, (summary.total_received / summary.amount_due) * 100);
  }, [summary]);

  const handleSubmit = async () => {
    if (!selectedBookingId) {
      toast({ variant: "destructive", title: "Select a reservation" });
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast({ variant: "destructive", title: "Enter a valid amount" });
      return;
    }
    if (!referenceNumber.trim()) {
      toast({ variant: "destructive", title: "Reference number is required" });
      return;
    }
    if (summary && !canRecordOTAPayment(selectedBooking?.status ?? "", summary.payment_status)) {
      toast({
        variant: "destructive",
        title: "Cannot record payment",
        description: "This reservation is fully settled or void.",
      });
      return;
    }

    try {
      await createPayment.mutateAsync({
        otaBookingId: selectedBookingId,
        amount: parsedAmount,
        receivedFrom,
        referenceNumber: referenceNumber.trim(),
        paymentDate,
        currency: selectedBooking?.currency ?? "GBP",
        notes: notes.trim() || undefined,
      });
      toast({ title: "Payment recorded", description: "Reservation payment status updated." });
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to record payment",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record OTA payment</DialogTitle>
          <DialogDescription>
            Log cash received for a reservation. Partial payments are supported until fully settled.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!preselectedBookingId && (
            <div className="space-y-2">
              <Label>Reservation</Label>
              <Popover open={bookingPickerOpen} onOpenChange={setBookingPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between rounded-md font-normal"
                  >
                    {selectedBooking
                      ? `${selectedBooking.external_ref} — ${selectedBooking.guest_name}`
                      : "Search booking ref or guest..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search..." />
                    <CommandList>
                      <CommandEmpty>No reservation found.</CommandEmpty>
                      <CommandGroup>
                        {eligibleBookings.map((b) => (
                          <CommandItem
                            key={b.id}
                            value={`${b.external_ref} ${b.guest_name} ${b.channel}`}
                            onSelect={() => {
                              setSelectedBookingId(b.id);
                              setAmount("");
                              setBookingPickerOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedBookingId === b.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span className="truncate">
                              {b.external_ref} · {b.guest_name} · {b.channel}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {selectedBooking && (
            <div className="rounded-2xl border bg-muted/40 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">{selectedBooking.external_ref}</span>
                <Badge variant="outline" className="capitalize text-xs">
                  {selectedBooking.channel}
                </Badge>
                {summary && (
                  <OTAPaymentStatusBadge status={summary.payment_status} />
                )}
              </div>
              {summaryLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : summary ? (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Amount due</p>
                      <p className="font-semibold">
                        {formatOTACurrency(summary.amount_due, selectedBooking.currency ?? "GBP")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Already received</p>
                      <p className="font-semibold">
                        {formatOTACurrency(summary.total_received, selectedBooking.currency ?? "GBP")}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Outstanding</p>
                      <p className="font-semibold text-primary">
                        {formatOTACurrency(summary.remaining_balance, selectedBooking.currency ?? "GBP")}
                      </p>
                    </div>
                  </div>
                  <Progress value={progressPct} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {formatOTACurrency(summary.total_received, selectedBooking.currency ?? "GBP")} of{" "}
                    {formatOTACurrency(summary.amount_due, selectedBooking.currency ?? "GBP")} received
                  </p>
                </>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount received</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded-md"
                disabled={!selectedBookingId || summary?.payment_status === "fully_paid"}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment date</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="rounded-md"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Received from</Label>
            <Select value={receivedFrom} onValueChange={(v) => setReceivedFrom(v as typeof receivedFrom)}>
              <SelectTrigger className="rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECEIVED_FROM_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reference number</Label>
            <Input
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="OTA payout ID or bank reference"
              className="rounded-md"
            />
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="rounded-2xl resize-none"
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-md">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createPayment.isPending || !selectedBookingId || summary?.payment_status === "fully_paid"}
            className="rounded-md"
          >
            {createPayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RecordOTAPaymentDialog;
