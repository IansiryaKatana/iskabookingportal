import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useBrandingSettings } from "@/hooks/useBranding";
import { useDeleteOTAPayment, type OTAPayment } from "@/hooks/useOTAPayments";
import { brandingFromSettings, generateOTAReceiptPDF, type OTAReceiptGuestContext } from "@/utils/otaReceiptPdfGenerator";
import { formatOTACurrency } from "@/utils/otaPayment";
import EditOTAPaymentDialog from "@/components/admin/ota/EditOTAPaymentDialog";
import EmailOTAReceiptDialog from "@/components/admin/ota/EmailOTAReceiptDialog";
import { FileText, Loader2, Mail, MoreVertical, Pencil, Trash } from "lucide-react";

type OTAPaymentActionsProps = {
  payment: OTAPayment;
  guest: OTAReceiptGuestContext;
};

const OTAPaymentActions = ({ payment, guest }: OTAPaymentActionsProps) => {
  const { toast } = useToast();
  const { data: branding } = useBrandingSettings();
  const deletePayment = useDeleteOTAPayment();
  const [editOpen, setEditOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await generateOTAReceiptPDF({
        payment,
        guest,
        branding: brandingFromSettings(branding),
      });
      toast({ title: "Receipt downloaded" });
    } catch (err) {
      console.error("OTA receipt download failed:", err);
      toast({
        variant: "destructive",
        title: "Failed to generate receipt",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deletePayment.mutateAsync({ id: payment.id, bookingId: payment.ota_booking_id });
      toast({
        title: "Payment deleted",
        description: "Reservation balances have been refreshed.",
      });
      setDeleteOpen(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to delete payment",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-md p-1 h-8 w-8"
            aria-label="Payment actions"
            disabled={downloading}
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem onClick={handleDownload}>
            <FileText className="mr-2 h-4 w-4" />
            Download receipt
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEmailOpen(true)}>
            <Mail className="mr-2 h-4 w-4" />
            Email receipt to guest
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit payment
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="text-red-600 focus:text-red-700">
            <Trash className="mr-2 h-4 w-4" />
            Delete payment
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditOTAPaymentDialog open={editOpen} onOpenChange={setEditOpen} payment={payment} />
      <EmailOTAReceiptDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        payment={payment}
        guestName={guest.guestName}
        defaultEmail={guest.guestEmail}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete OTA payment</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {formatOTACurrency(Number(payment.amount), payment.currency)} recorded on{" "}
              {payment.payment_date.slice(0, 10)} for {guest.guestName}? This updates the
              reservation balance and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deletePayment.isPending}
              className="rounded-md bg-destructive hover:bg-destructive/90"
            >
              {deletePayment.isPending ? "Deleting..." : "Delete payment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default OTAPaymentActions;
