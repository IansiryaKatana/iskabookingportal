import { useMemo, useState } from "react";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { useSearchParams } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import RecordOTAPaymentDialog from "@/components/admin/ota/RecordOTAPaymentDialog";
import OTAPaymentActions from "@/components/admin/ota/OTAPaymentActions";
import { useOTABookings } from "@/hooks/useOTABookings";
import { useOTAPaymentHistory, useOTAPaymentLedger } from "@/hooks/useOTAPayments";
import type { OTAPaymentStatus } from "@/utils/otaPayment";
import {
  OTA_CHANNEL_LABELS,
  OTA_RECEIVED_FROM_LABELS,
  formatOTACurrency,
} from "@/utils/otaPayment";
import { OTAPaymentStatusBadge } from "@/components/finance/FinanceStatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type LedgerRow = ReturnType<typeof useOTAPaymentLedger>["data"] extends (infer R)[] | undefined ? R : never;

const OTAPaymentsPage = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const now = new Date();
  const [pageTab, setPageTab] = useState<"ledger" | "history">(
    searchParams.get("tab") === "history" ? "history" : "ledger",
  );
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(now), "yyyy-MM-dd"));
  const [channelFilter, setChannelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<OTAPaymentStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [recordOpen, setRecordOpen] = useState(false);
  const [preselectedBookingId, setPreselectedBookingId] = useState<string | null>(null);

  const { data: bookings } = useOTABookings();
  const { data: ledger, isLoading } = useOTAPaymentLedger({
    channel: channelFilter !== "all" ? channelFilter : undefined,
    paymentStatus: statusFilter,
    checkInStart: dateFrom || undefined,
    checkInEnd: dateTo || undefined,
    search: searchQuery,
  });
  const { data: history, isLoading: historyLoading } = useOTAPaymentHistory({
    channel: channelFilter !== "all" ? channelFilter : undefined,
    paymentDateStart: dateFrom || undefined,
    paymentDateEnd: dateTo || undefined,
    search: searchQuery,
  });

  const financeEligible = useMemo(
    () =>
      (ledger ?? []).filter(
        (r) =>
          r.amount_due > 0 &&
          !["cancelled", "no_show"].includes(r.booking_status),
      ),
    [ledger],
  );

  const stats = useMemo(() => {
    const rows = financeEligible;
    const expected = rows.reduce((s, r) => s + Number(r.amount_due || 0), 0);
    const received = rows.reduce((s, r) => s + Number(r.total_received || 0), 0);
    const outstanding = rows.reduce((s, r) => s + Number(r.remaining_balance || 0), 0);
    const unpaid = rows.filter((r) => r.payment_status === "unpaid").length;
    const partial = rows.filter((r) => r.payment_status === "partially_paid").length;
    const paid = rows.filter((r) => r.payment_status === "fully_paid").length;
    return { expected, received, outstanding, unpaid, partial, paid, total: rows.length };
  }, [financeEligible]);

  const historyTotal = useMemo(
    () => (history ?? []).reduce((sum, row) => {
      const amount = Number(row.amount) || 0;
      return sum + (row.payment_type === "refund" ? -amount : amount);
    }, 0),
    [history],
  );

  const exportLedgerCsv = () => {
    if (!financeEligible.length) {
      toast({ variant: "destructive", title: "No data to export" });
      return;
    }
    const headers = [
      "Booking Ref",
      "Channel",
      "Guest",
      "Studio",
      "Check-in",
      "Amount Due",
      "Received",
      "Outstanding",
      "Status",
    ];
    const rows = financeEligible.map((r) => [
      r.external_ref,
      r.channel,
      r.guest_name,
      (r as LedgerRow & { studio_number?: string | null }).studio_number ?? "",
      r.check_in,
      r.amount_due.toFixed(2),
      r.total_received.toFixed(2),
      r.remaining_balance.toFixed(2),
      r.payment_status,
    ]);
    const csv = [headers.join(","), ...rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ota_payments_${dateFrom}_${dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast({ title: "Exported", description: "OTA payments ledger downloaded." });
  };

  const exportHistoryCsv = () => {
    if (!history?.length) {
      toast({ variant: "destructive", title: "No data to export" });
      return;
    }
    const headers = [
      "Payment date",
      "Guest",
      "Booking ref",
      "Channel",
      "Studio",
      "Amount",
      "Type",
      "Source",
      "Reference",
      "Notes",
    ];
    const rows = history.map((r) => [
      r.payment_date,
      r.ota_booking?.guest_name ?? "",
      r.ota_booking?.external_ref ?? "",
      r.ota_booking?.channel ?? "",
      r.ota_booking?.studio?.studio_number ?? "",
      Number(r.amount).toFixed(2),
      r.payment_type,
      r.received_from,
      r.reference_number,
      r.notes ?? "",
    ]);
    const csv = [headers.join(","), ...rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ota_payment_history_${dateFrom}_${dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast({ title: "Exported", description: "OTA payment history downloaded." });
  };

  const openRecordForBooking = (bookingId: string) => {
    setPreselectedBookingId(bookingId);
    setRecordOpen(true);
  };

  const openHistoryForBooking = (externalRef: string) => {
    setSearchQuery(externalRef);
    setPageTab("history");
    setSearchParams({ tab: "history" }, { replace: true });
  };

  return (
    <AdminLayout
      pageTitle="OTA Payments"
      subtitle="Record and track cash received per reservation"
    >
      <Tabs
        value={pageTab}
        onValueChange={(v) => {
          const next = v as "ledger" | "history";
          setPageTab(next);
          setSearchParams(
            (prev) => {
              const nextParams = new URLSearchParams(prev);
              if (next === "history") nextParams.set("tab", "history");
              else nextParams.delete("tab");
              return nextParams;
            },
            { replace: true },
          );
        }}
        className="space-y-6"
      >
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
          <TabsList className="rounded-md">
            <TabsTrigger value="ledger" className="rounded-md text-xs">
              Ledger
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-md text-xs">
              Payment history
            </TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="rounded-md gap-2"
              onClick={pageTab === "history" ? exportHistoryCsv : exportLedgerCsv}
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button
              className="rounded-md gap-2"
              onClick={() => {
                setPreselectedBookingId(null);
                setRecordOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Record payment
            </Button>
          </div>
        </div>

        <TabsContent value="ledger" className="space-y-6 mt-0">
          <Tabs
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as OTAPaymentStatus | "all")}
            className="w-full"
          >
            <TabsList className="rounded-md flex flex-wrap h-auto">
              <TabsTrigger value="all" className="rounded-md text-xs">
                All
              </TabsTrigger>
              <TabsTrigger value="unpaid" className="rounded-md text-xs">
                Unpaid ({stats.unpaid})
              </TabsTrigger>
              <TabsTrigger value="partially_paid" className="rounded-md text-xs">
                Partial ({stats.partial})
              </TabsTrigger>
              <TabsTrigger value="fully_paid" className="rounded-md text-xs">
                Paid ({stats.paid})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="rounded-3xl">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground mb-1">Expected payout</p>
                <p className="text-2xl font-bold">{formatOTACurrency(stats.expected)}</p>
              </CardContent>
            </Card>
            <Card className="rounded-3xl">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground mb-1">Received</p>
                <p className="text-2xl font-bold text-green-600">{formatOTACurrency(stats.received)}</p>
              </CardContent>
            </Card>
            <Card className="rounded-3xl">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground mb-1">Outstanding</p>
                <p className="text-2xl font-bold text-amber-600">{formatOTACurrency(stats.outstanding)}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">Payment ledger</CardTitle>
              <CardDescription>
                {financeEligible.length} reservation{financeEligible.length !== 1 ? "s" : ""} with financial data.
                Receipts are on the Payment history tab (or use View receipts on a paid booking).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-3 mb-6">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded-md md:max-w-[160px]"
                  aria-label="Check-in from"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-md md:max-w-[160px]"
                  aria-label="Check-in to"
                />
                <Select value={channelFilter} onValueChange={setChannelFilter}>
                  <SelectTrigger className="rounded-md md:max-w-[180px]">
                    <SelectValue placeholder="Channel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All channels</SelectItem>
                    <SelectItem value="airbnb">Airbnb</SelectItem>
                    <SelectItem value="booking">Booking.com</SelectItem>
                    <SelectItem value="agoda">Agoda</SelectItem>
                    <SelectItem value="expedia">Expedia</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search ref or guest..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-md flex-1"
                />
              </div>
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : financeEligible.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">
                  No reservations match your filters.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Ref</TableHead>
                        <TableHead className="text-xs">Guest</TableHead>
                        <TableHead className="text-xs">Channel</TableHead>
                        <TableHead className="text-xs">Studio</TableHead>
                        <TableHead className="text-xs">Check-in</TableHead>
                        <TableHead className="text-xs text-right">Due</TableHead>
                        <TableHead className="text-xs text-right">Received</TableHead>
                        <TableHead className="text-xs text-right">Outstanding</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {financeEligible.map((row) => {
                        const studioNum = (row as LedgerRow & { studio_number?: string | null }).studio_number;
                        const canAdd =
                          row.payment_status !== "fully_paid" &&
                          !["cancelled", "no_show"].includes(row.booking_status);
                        return (
                          <TableRow key={row.booking_id}>
                            <TableCell className="text-xs font-medium">{row.external_ref}</TableCell>
                            <TableCell className="text-xs">{row.guest_name}</TableCell>
                            <TableCell className="text-xs capitalize">{row.channel}</TableCell>
                            <TableCell className="text-xs">{studioNum ?? "—"}</TableCell>
                            <TableCell className="text-xs">
                              {format(parseISO(row.check_in), "dd MMM yyyy")}
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {formatOTACurrency(row.amount_due, row.currency ?? "GBP")}
                            </TableCell>
                            <TableCell className="text-xs text-right text-green-600">
                              {formatOTACurrency(row.total_received, row.currency ?? "GBP")}
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {formatOTACurrency(row.remaining_balance, row.currency ?? "GBP")}
                            </TableCell>
                            <TableCell>
                              <OTAPaymentStatusBadge status={row.payment_status} />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1.5">
                                {Number(row.total_received) > 0 && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-md text-xs h-8"
                                    onClick={() => openHistoryForBooking(row.external_ref)}
                                  >
                                    View receipts
                                  </Button>
                                )}
                                {canAdd && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-md text-xs h-8"
                                    onClick={() => openRecordForBooking(row.booking_id)}
                                  >
                                    Add payment
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-6 mt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="rounded-3xl">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground mb-1">Payments in range</p>
                <p className="text-2xl font-bold">{history?.length ?? 0}</p>
              </CardContent>
            </Card>
            <Card className="rounded-3xl">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground mb-1">Cash recorded</p>
                <p className="text-2xl font-bold text-green-600">{formatOTACurrency(historyTotal)}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">Payment history</CardTitle>
              <CardDescription>
                Each recorded payment. Download or email a guest receipt, or correct a mistaken entry.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-3 mb-6">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded-md md:max-w-[160px]"
                  aria-label="Payment date from"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-md md:max-w-[160px]"
                  aria-label="Payment date to"
                />
                <Select value={channelFilter} onValueChange={setChannelFilter}>
                  <SelectTrigger className="rounded-md md:max-w-[180px]">
                    <SelectValue placeholder="Channel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All channels</SelectItem>
                    <SelectItem value="airbnb">Airbnb</SelectItem>
                    <SelectItem value="booking">Booking.com</SelectItem>
                    <SelectItem value="agoda">Agoda</SelectItem>
                    <SelectItem value="expedia">Expedia</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search guest, ref or reference..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-md flex-1"
                />
              </div>
              {historyLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !history?.length ? (
                <p className="text-sm text-muted-foreground text-center py-10">
                  No payments recorded in this date range.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Guest</TableHead>
                        <TableHead className="text-xs">Booking</TableHead>
                        <TableHead className="text-xs">Channel</TableHead>
                        <TableHead className="text-xs text-right">Amount</TableHead>
                        <TableHead className="text-xs">Source</TableHead>
                        <TableHead className="text-xs">Reference</TableHead>
                        <TableHead className="text-xs text-right w-[52px]"> </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((row) => {
                        const booking = row.ota_booking;
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="text-xs">
                              {format(parseISO(row.payment_date), "dd MMM yyyy")}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div>{booking?.guest_name ?? "—"}</div>
                              {booking?.studio?.studio_number && (
                                <div className="text-muted-foreground">Studio {booking.studio.studio_number}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs font-medium">
                              {booking?.external_ref ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {OTA_CHANNEL_LABELS[booking?.channel ?? ""] ?? booking?.channel ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs text-right font-medium">
                              {row.payment_type === "refund" ? "−" : ""}
                              {formatOTACurrency(Number(row.amount), row.currency)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {OTA_RECEIVED_FROM_LABELS[row.received_from] ?? row.received_from}
                            </TableCell>
                            <TableCell className="text-xs">{row.reference_number}</TableCell>
                            <TableCell className="text-right">
                              {booking && (
                                <OTAPaymentActions
                                  payment={row}
                                  guest={{
                                    guestName: booking.guest_name,
                                    guestEmail: booking.guest_email,
                                    guestPhone: booking.guest_phone,
                                    bookingRef: booking.external_ref,
                                    channel: booking.channel,
                                    checkIn: booking.check_in,
                                    checkOut: booking.check_out,
                                    studioNumber: booking.studio?.studio_number ?? null,
                                    numberOfNights: booking.number_of_nights,
                                  }}
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <RecordOTAPaymentDialog
        open={recordOpen}
        onOpenChange={(open) => {
          setRecordOpen(open);
          if (!open) setPreselectedBookingId(null);
        }}
        bookings={bookings ?? []}
        preselectedBookingId={preselectedBookingId}
      />
    </AdminLayout>
  );
};

export default OTAPaymentsPage;
