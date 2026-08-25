import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, Pencil, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import {
  useDeleteEarlyCheckInPayment,
  useEarlyCheckInPayments,
  useUpdateEarlyCheckInPayment,
  type EarlyCheckInPayment,
} from "@/hooks/useEarlyCheckIn";
import { getErrorMessage } from "@/utils/getErrorMessage";

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

type PaymentFormState = {
  amount: string;
  paymentDate: string;
  paymentMethod: string;
  paymentType: "payment" | "refund" | "adjustment";
  referenceNumber: string;
  notes: string;
};

const eciSheetClassName = (isMobile: boolean, wide = false) =>
  cn(
    "flex flex-col gap-0 overflow-hidden p-4 sm:p-6",
    isMobile ? "max-h-[90vh] mb-0 rounded-t-2xl" : cn("h-full w-full", wide ? "sm:max-w-2xl" : "sm:max-w-md"),
    "[&>button]:!flex [&>button]:!h-8 [&>button]:!w-8 [&>button]:!items-center [&>button]:!justify-center",
    "[&>button]:!rounded-md [&>button]:!bg-red-500 [&>button]:!text-white [&>button]:!opacity-100",
    "[&>button]:!shadow-md [&>button]:transition-colors [&>button]:hover:!bg-red-600",
  );

const emptyForm = (): PaymentFormState => ({
  amount: "",
  paymentDate: format(new Date(), "yyyy-MM-dd"),
  paymentMethod: "bank_transfer",
  paymentType: "payment",
  referenceNumber: "",
  notes: "",
});

const formFromPayment = (payment: EarlyCheckInPayment): PaymentFormState => ({
  amount: String(payment.amount),
  paymentDate: payment.payment_date,
  paymentMethod: payment.payment_method || "bank_transfer",
  paymentType:
    payment.payment_type === "refund" || payment.payment_type === "adjustment"
      ? payment.payment_type
      : "payment",
  referenceNumber: payment.reference_number ?? "",
  notes: payment.notes ?? "",
});

type EarlyCheckInPaymentEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: EarlyCheckInPayment | null;
  eciStatus?: string | null;
};

export const EarlyCheckInPaymentEditDialog = ({
  open,
  onOpenChange,
  payment,
  eciStatus,
}: EarlyCheckInPaymentEditDialogProps) => {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const updatePayment = useUpdateEarlyCheckInPayment();
  const [form, setForm] = useState<PaymentFormState>(emptyForm);

  useEffect(() => {
    if (open && payment) {
      setForm(formFromPayment(payment));
    }
  }, [open, payment]);

  const typeOptions =
    eciStatus === "cancelled"
      ? (["refund", "adjustment"] as const)
      : (["payment", "refund", "adjustment"] as const);

  const handleSave = async () => {
    if (!payment) return;
    const amount = Number(form.amount);
    if (!form.amount || Number.isNaN(amount) || amount <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid amount",
        description: "Enter a valid payment amount.",
      });
      return;
    }
    if (!form.paymentDate) {
      toast({
        variant: "destructive",
        title: "Date required",
        description: "Choose a payment date.",
      });
      return;
    }
    if (!form.referenceNumber.trim()) {
      toast({
        variant: "destructive",
        title: "Reference required",
        description: "Enter a payment reference.",
      });
      return;
    }

    try {
      await updatePayment.mutateAsync({
        paymentId: payment.id,
        applicationId: payment.application_id,
        amount,
        paymentDate: form.paymentDate,
        referenceNumber: form.referenceNumber,
        paymentMethod: form.paymentMethod as
          | "bank_transfer"
          | "cash"
          | "card"
          | "stripe"
          | "other",
        paymentType: form.paymentType,
        notes: form.notes,
      });
      toast({ title: "Payment updated" });
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Unable to update payment",
        description: getErrorMessage(error, "Please try again."),
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={eciSheetClassName(isMobile)}
      >
        <SheetHeader className="flex-shrink-0 text-left space-y-1 pr-10">
          <SheetTitle className="font-display uppercase tracking-wide">
            Edit early check-in payment
          </SheetTitle>
          <SheetDescription>Correct amount, date, method, or reference.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 py-4">
          <div className="space-y-2">
            <Label htmlFor="eci_edit_amount">Amount (£)</Label>
            <Input
              id="eci_edit_amount"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="rounded-md"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="eci_edit_date">Payment date</Label>
            <Input
              id="eci_edit_date"
              type="date"
              value={form.paymentDate}
              onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))}
              className="rounded-md"
            />
          </div>
          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select
              value={form.paymentMethod}
              onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))}
            >
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
              value={form.paymentType}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  paymentType: v as "payment" | "refund" | "adjustment",
                }))
              }
            >
              <SelectTrigger className="rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {PAYMENT_TYPE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="eci_edit_ref">Reference</Label>
            <Input
              id="eci_edit_ref"
              value={form.referenceNumber}
              onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))}
              className="rounded-md"
              placeholder="Bank ref / receipt no."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="eci_edit_notes">Notes (optional)</Label>
            <Textarea
              id="eci_edit_notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="rounded-md"
            />
          </div>
        </div>
        <SheetFooter className="flex-shrink-0 flex-row justify-end gap-2 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            className="rounded-md"
            onClick={() => onOpenChange(false)}
            disabled={updatePayment.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-md"
            onClick={handleSave}
            disabled={updatePayment.isPending}
          >
            {updatePayment.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

type EarlyCheckInPaymentDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: EarlyCheckInPayment | null;
};

export const EarlyCheckInPaymentDeleteDialog = ({
  open,
  onOpenChange,
  payment,
}: EarlyCheckInPaymentDeleteDialogProps) => {
  const { toast } = useToast();
  const deletePayment = useDeleteEarlyCheckInPayment();

  const handleDelete = async () => {
    if (!payment) return;
    try {
      await deletePayment.mutateAsync({
        paymentId: payment.id,
        applicationId: payment.application_id,
      });
      toast({
        title: "Payment deleted",
        description: "The early check-in payment has been removed and balances updated.",
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Unable to delete payment",
        description: getErrorMessage(error, "Please try again."),
      });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
            Delete payment?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs md:text-sm">
            {payment
              ? `This will permanently remove the ${formatMoney(payment.amount, payment.currency)} ${
                  PAYMENT_TYPE_LABELS[payment.payment_type] ?? payment.payment_type
                } (ref ${payment.reference_number}). Balances will update immediately.`
              : "This will permanently remove the payment."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="rounded-md text-xs md:text-sm" disabled={deletePayment.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="rounded-md text-xs md:text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
            disabled={deletePayment.isPending}
          >
            {deletePayment.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

type EarlyCheckInPaymentRowActionsProps = {
  payment: EarlyCheckInPayment;
  eciStatus?: string | null;
  onEdit: (payment: EarlyCheckInPayment) => void;
  onDelete: (payment: EarlyCheckInPayment) => void;
};

export const EarlyCheckInPaymentRowActions = ({
  payment,
  onEdit,
  onDelete,
}: EarlyCheckInPaymentRowActionsProps) => (
  <div className="flex items-center justify-end gap-1">
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-8 w-8 p-0 rounded-md"
      onClick={() => onEdit(payment)}
      aria-label="Edit payment"
    >
      <Pencil className="h-3.5 w-3.5" />
    </Button>
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-8 w-8 p-0 rounded-md text-destructive hover:text-destructive"
      onClick={() => onDelete(payment)}
      aria-label="Delete payment"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  </div>
);

type EarlyCheckInPaymentsManageDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string | null;
  studentName?: string;
  eciStatus?: string | null;
};

export const EarlyCheckInPaymentsManageDialog = ({
  open,
  onOpenChange,
  applicationId,
  studentName,
  eciStatus,
}: EarlyCheckInPaymentsManageDialogProps) => {
  const isMobile = useIsMobile();
  const { data: payments, isLoading } = useEarlyCheckInPayments(applicationId ?? undefined);
  const [editingPayment, setEditingPayment] = useState<EarlyCheckInPayment | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deletingPayment, setDeletingPayment] = useState<EarlyCheckInPayment | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const openEdit = (payment: EarlyCheckInPayment) => {
    setEditingPayment(payment);
    setEditOpen(true);
  };

  const openDelete = (payment: EarlyCheckInPayment) => {
    setDeletingPayment(payment);
    setDeleteOpen(true);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={eciSheetClassName(isMobile, true)}
        >
          <SheetHeader className="flex-shrink-0 text-left space-y-1 pr-10">
            <SheetTitle className="font-display uppercase tracking-wide">
              Manage early check-in payments
            </SheetTitle>
            <SheetDescription>
              {studentName
                ? `Edit or delete recorded payments for ${studentName}.`
                : "Edit or delete recorded early check-in payments."}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-y-auto py-4">
            {!applicationId || isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !payments || payments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No payments recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Amount</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Method</TableHead>
                      <TableHead className="text-xs">Reference</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
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
                        <TableCell className="text-right">
                          <EarlyCheckInPaymentRowActions
                            payment={p}
                            onEdit={openEdit}
                            onDelete={openDelete}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <EarlyCheckInPaymentEditDialog
        open={editOpen}
        onOpenChange={(next) => {
          setEditOpen(next);
          if (!next) setEditingPayment(null);
        }}
        payment={editingPayment}
        eciStatus={eciStatus}
      />
      <EarlyCheckInPaymentDeleteDialog
        open={deleteOpen}
        onOpenChange={(next) => {
          setDeleteOpen(next);
          if (!next) setDeletingPayment(null);
        }}
        payment={deletingPayment}
      />
    </>
  );
};
