import { useEffect, useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { useUpdateOTAPayment, type OTAPayment } from "@/hooks/useOTAPayments";
import { OTA_RECEIVED_FROM_OPTIONS, type OTAReceivedFrom } from "@/utils/otaPayment";
import { Loader2 } from "lucide-react";

type EditOTAPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: OTAPayment | null;
};

const EditOTAPaymentDialog = ({ open, onOpenChange, payment }: EditOTAPaymentDialogProps) => {
  const { toast } = useToast();
  const updatePayment = useUpdateOTAPayment();
  const [amount, setAmount] = useState("");
  const [receivedFrom, setReceivedFrom] = useState<OTAReceivedFrom>("ota_payout");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !payment) return;
    setAmount(Number(payment.amount).toFixed(2));
    setReceivedFrom((payment.received_from as OTAReceivedFrom) || "ota_payout");
    setReferenceNumber(payment.reference_number);
    setPaymentDate(payment.payment_date.slice(0, 10));
    setNotes(payment.notes ?? "");
  }, [open, payment]);

  const handleSubmit = async () => {
    if (!payment) return;
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast({ variant: "destructive", title: "Enter a valid amount" });
      return;
    }
    if (!referenceNumber.trim()) {
      toast({ variant: "destructive", title: "Reference number is required" });
      return;
    }
    if (!paymentDate) {
      toast({ variant: "destructive", title: "Payment date is required" });
      return;
    }

    try {
      await updatePayment.mutateAsync({
        id: payment.id,
        bookingId: payment.ota_booking_id,
        amount: parsedAmount,
        receivedFrom,
        referenceNumber: referenceNumber.trim(),
        paymentDate,
        notes: notes.trim() || undefined,
      });
      toast({
        title: "Payment updated",
        description: "Reservation balances have been refreshed.",
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to update payment",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit OTA payment</DialogTitle>
          <DialogDescription>
            Correct amount, date, source or reference. Outstanding balance updates automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded-md"
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
            <Select value={receivedFrom} onValueChange={(v) => setReceivedFrom(v as OTAReceivedFrom)}>
              <SelectTrigger className="rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OTA_RECEIVED_FROM_OPTIONS.map((opt) => (
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
          <Button onClick={handleSubmit} disabled={updatePayment.isPending || !payment} className="rounded-md">
            {updatePayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditOTAPaymentDialog;
