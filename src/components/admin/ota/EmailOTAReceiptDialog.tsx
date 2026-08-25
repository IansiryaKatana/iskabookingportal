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
import { useToast } from "@/hooks/use-toast";
import { useSendOTAPaymentReceipt, type OTAPayment } from "@/hooks/useOTAPayments";
import { Loader2 } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EmailOTAReceiptDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: OTAPayment | null;
  guestName: string;
  defaultEmail?: string | null;
};

const EmailOTAReceiptDialog = ({
  open,
  onOpenChange,
  payment,
  guestName,
  defaultEmail,
}: EmailOTAReceiptDialogProps) => {
  const { toast } = useToast();
  const sendReceipt = useSendOTAPaymentReceipt();
  const [toEmail, setToEmail] = useState("");

  useEffect(() => {
    if (!open) return;
    setToEmail(defaultEmail?.trim() ?? "");
  }, [open, defaultEmail]);

  const handleSubmit = async () => {
    if (!payment) return;
    const trimmed = toEmail.trim();
    if (!EMAIL_RE.test(trimmed)) {
      toast({ variant: "destructive", title: "Enter a valid email address" });
      return;
    }

    try {
      const result = await sendReceipt.mutateAsync({
        paymentId: payment.id,
        toEmail: trimmed,
      });
      toast({
        title: "Receipt sent",
        description: `Sent to ${result.to}`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to send receipt",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Email receipt to guest</DialogTitle>
          <DialogDescription>
            Sends a PDF receipt for this payment to {guestName || "the guest"}. You can override
            the address if the booking has no email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="ota-receipt-email">Guest email</Label>
          <Input
            id="ota-receipt-email"
            type="email"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            placeholder="guest@example.com"
            className="rounded-md"
          />
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-md">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={sendReceipt.isPending || !payment} className="rounded-md">
            {sendReceipt.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmailOTAReceiptDialog;
