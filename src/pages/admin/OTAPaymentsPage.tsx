import { useMemo, useState } from "react";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import AdminLayout from "@/components/admin/AdminLayout";
import RecordOTAPaymentDialog from "@/components/admin/ota/RecordOTAPaymentDialog";
import { useOTABookings } from "@/hooks/useOTABookings";
import { useOTAPaymentLedger } from "@/hooks/useOTAPayments";
import type { OTAPaymentStatus } from "@/utils/otaPayment";
import { formatOTACurrency, OTA_PAYMENT_STATUS_LABELS } from "@/utils/otaPayment";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type LedgerRow = ReturnType<typeof useOTAPaymentLedger>["data"] extends (infer R)[] | undefined ? R : never;

const OTAPaymentsPage = () => {
  const { toast } = useToast();
  const now = new Date();
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

  const exportCsv = () => {
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

  const openRecordForBooking = (bookingId: string) => {
    setPreselectedBookingId(bookingId);
    setRecordOpen(true);
  };

  const paymentStatusBadge = (status: OTAPaymentStatus) => {
    const variant =
      status === "fully_paid"
        ? "default"
        : status === "partially_paid"
          ? "secondary"
          : status === "overpaid"
            ? "destructive"
            : "outline";
    return (
      <Badge variant={variant} className="text-xs capitalize">
        {OTA_PAYMENT_STATUS_LABELS[status]}
      </Badge>
    );
  };

  return (
    <AdminLayout
      pageTitle="OTA Payments"
      subtitle="Record and track cash received per reservation"
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
          <Tabs
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as OTAPaymentStatus | "all")}
            className="w-full sm:w-auto"
          >
            <TabsList className="rounded-full flex flex-wrap h-auto">
              <TabsTrigger value="all" className="rounded-full text-xs">
                All
              </TabsTrigger>
              <TabsTrigger value="unpaid" className="rounded-full text-xs">
                Unpaid ({stats.unpaid})
              </TabsTrigger>
              <TabsTrigger value="partially_paid" className="rounded-full text-xs">
                Partial ({stats.partial})
              </TabsTrigger>
              <TabsTrigger value="fully_paid" className="rounded-full text-xs">
                Paid ({stats.paid})
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full gap-2" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button
              className="rounded-full gap-2"
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
            <CardTitle className="text-base font-display uppercase">Payment ledger</CardTitle>
            <CardDescription>
              {financeEligible.length} reservation{financeEligible.length !== 1 ? "s" : ""} with financial data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-3 mb-6">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-full md:max-w-[160px]"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-full md:max-w-[160px]"
              />
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="rounded-full md:max-w-[180px]">
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
                className="rounded-full flex-1"
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
                          <TableCell>{paymentStatusBadge(row.payment_status)}</TableCell>
                          <TableCell className="text-right">
                            {canAdd && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-full text-xs h-8"
                                onClick={() => openRecordForBooking(row.booking_id)}
                              >
                                Add payment
                              </Button>
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
      </div>

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
