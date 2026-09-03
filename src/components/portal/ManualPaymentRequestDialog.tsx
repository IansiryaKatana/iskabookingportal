import { useState } from "react";
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
import { Loader2 } from "lucide-react";
import { useCreateManualPaymentRequest } from "@/hooks/useManualPaymentRequests";
import { useToast } from "@/hooks/use-toast";

type ManualPaymentRequestDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  instalmentId: string;
  instalmentLabel: string;
  amount: number;
};

export default function ManualPaymentRequestDialog({
  open,
  onOpenChange,
  applicationId,
  instalmentId,
  instalmentLabel,
  amount,
}: ManualPaymentRequestDialogProps) {
  const { toast } = useToast();
  const createRequest = useCreateManualPaymentRequest();
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bank_transfer" | "cheque">("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    if (amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid amount.",
        variant: "destructive",
      });
      return;
    }
    try {
      await createRequest.mutateAsync({
        applicationId,
        instalmentId,
        amount,
        paymentMethod,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast({
        title: "Request submitted",
        description: "Your payment will show as paid once the office approves it.",
      });
      setReference("");
      setNotes("");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to submit manual payment request:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit request. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] rounded-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-display uppercase tracking-wide">
            I paid by bank transfer / other
          </DialogTitle>
          <DialogDescription>
            Submit this form so we can record your payment. It will show as paid once the office approves it.
            ({instalmentLabel} – £{amount.toFixed(2)})
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="payment-method">How did you pay?</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as "cash" | "card" | "bank_transfer" | "cheque")}
            >
              <SelectTrigger id="payment-method" className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card (in person)</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="reference">Reference (optional)</Label>
            <Input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. bank reference or receipt number"
              className="mt-2"
            />
          </div>
          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any extra details for the office..."
              className="mt-2"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-md uppercase tracking-wide order-2 sm:order-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={createRequest.isPending}
            className="rounded-md uppercase tracking-wide order-1 sm:order-2"
          >
            {createRequest.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit request"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
