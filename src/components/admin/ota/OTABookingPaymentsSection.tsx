import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useOTAPaymentSummary,
  useOTAPaymentsForBooking,
} from "@/hooks/useOTAPayments";
import type { OTABookingWithRelations } from "@/hooks/useOTABookings";
import {
  canRecordOTAPayment,
  formatOTACurrency,
  getOTAAmountDue,
} from "@/utils/otaPayment";
import { OTAPaymentStatusBadge } from "@/components/finance/FinanceStatusBadge";
import RecordOTAPaymentDialog from "@/components/admin/ota/RecordOTAPaymentDialog";
import { CreditCard, Plus } from "lucide-react";

const RECEIVED_FROM_LABELS: Record<string, string> = {
  ota_payout: "OTA payout",
  bank_transfer: "Bank transfer",
  virtual_card: "Virtual card",
  guest_direct: "Guest direct",
  other: "Other",
};

type OTABookingPaymentsSectionProps = {
  booking: OTABookingWithRelations;
  allBookings: OTABookingWithRelations[];
};

const OTABookingPaymentsSection = ({ booking, allBookings }: OTABookingPaymentsSectionProps) => {
  const [recordOpen, setRecordOpen] = useState(false);
  const amountDue = getOTAAmountDue(booking);
  const currency = booking.currency ?? "GBP";

  const { data: summary, isLoading: summaryLoading } = useOTAPaymentSummary(booking.id);
  const { data: payments, isLoading: paymentsLoading } = useOTAPaymentsForBooking(booking.id);

  if (amountDue <= 0 && !booking.price_per_night) {
    return null;
  }

  const paymentStatus = summary?.payment_status ?? "unpaid";
  const canRecord = canRecordOTAPayment(booking.status, paymentStatus);
  const progressPct =
    summary && summary.amount_due > 0
      ? Math.min(100, (summary.total_received / summary.amount_due) * 100)
      : 0;

  return (
    <>
      <Separator />
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-semibold">Payment settlement</Label>
            {!summaryLoading && summary && (
              <OTAPaymentStatusBadge status={summary.payment_status} />
            )}
          </div>
          {canRecord && (
            <Button
              size="sm"
              className="rounded-md gap-1 self-end sm:self-auto"
              onClick={() => setRecordOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Record payment
            </Button>
          )}
        </div>

        {summaryLoading ? (
          <Skeleton className="h-20 w-full rounded-2xl" />
        ) : summary ? (
          <div className="rounded-2xl border bg-muted/30 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Expected payout</p>
                <p className="font-semibold">{formatOTACurrency(summary.amount_due, currency)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Received</p>
                <p className="font-semibold text-green-600">
                  {formatOTACurrency(summary.total_received, currency)}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="font-semibold">
                  {formatOTACurrency(summary.remaining_balance, currency)}
                </p>
              </div>
            </div>
            <Progress value={progressPct} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {formatOTACurrency(summary.total_received, currency)} of{" "}
              {formatOTACurrency(summary.amount_due, currency)} received
            </p>
          </div>
        ) : null}

        {paymentsLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : payments && payments.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Amount</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
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
                      {formatOTACurrency(p.amount, p.currency)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {RECEIVED_FROM_LABELS[p.received_from] ?? p.received_from}
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
      </div>

      <RecordOTAPaymentDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        bookings={allBookings}
        preselectedBookingId={booking.id}
      />
    </>
  );
};

export default OTABookingPaymentsSection;
