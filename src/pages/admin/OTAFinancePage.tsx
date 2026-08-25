import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { useOTABookings } from "@/hooks/useOTABookings";
import { useOTAExpenses } from "@/hooks/useOTAExpenses";
import { useOTAPaymentLedger } from "@/hooks/useOTAPayments";
import type { OTAPaymentStatus } from "@/utils/otaPayment";
import { OTAPaymentStatusBadge } from "@/components/finance/FinanceStatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, addWeeks, subMonths, addMonths } from "date-fns";
import {
  DollarSign, TrendingUp, TrendingDown, Download, Calendar,
  Loader2, Building2, CreditCard, FileText, BarChart3, Receipt
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
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

// Currency formatter
const formatCurrency = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined || isNaN(amount)) return "£0.00";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const OTAFinancePage = () => {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<"this_week" | "this_month" | "custom">("this_month");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<OTAPaymentStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Calculate date range
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case "this_week":
        return {
          startDate: startOfWeek(now, { weekStartsOn: 1 }),
          endDate: endOfWeek(now, { weekStartsOn: 1 }),
        };
      case "this_month":
        return {
          startDate: startOfMonth(now),
          endDate: endOfMonth(now),
        };
      case "custom":
        return {
          startDate: customStartDate ? parseISO(customStartDate) : null,
          endDate: customEndDate ? parseISO(customEndDate) : null,
        };
      default:
        return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
    }
  }, [dateRange, customStartDate, customEndDate]);

  // Fetch bookings with date filter
  const { data: bookings, isLoading } = useOTABookings({
    check_in_start: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
    check_in_end: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
    channel: channelFilter !== "all" ? channelFilter : undefined,
  });

  const { data: otaExpenses } = useOTAExpenses({
    startDate: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
    endDate: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
    channel: channelFilter !== "all" ? channelFilter : undefined,
  });

  const { data: paymentLedger, isLoading: ledgerLoading } = useOTAPaymentLedger({
    channel: channelFilter !== "all" ? channelFilter : undefined,
    paymentStatus: paymentStatusFilter,
    checkInStart: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
    checkInEnd: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
    search: searchQuery,
  });

  const financeRows = useMemo(() => {
    return (paymentLedger ?? []).filter(
      (r) =>
        r.amount_due > 0 &&
        !["cancelled", "no_show"].includes(r.booking_status),
    );
  }, [paymentLedger]);

  const bookingStudioMap = useMemo(() => {
    const map: Record<string, string> = {};
    (bookings ?? []).forEach((b) => {
      if (b.studio?.studio_number) map[b.id] = b.studio.studio_number;
    });
    return map;
  }, [bookings]);

  const stats = useMemo(() => {
    const expectedPayout = financeRows.reduce((sum, r) => sum + Number(r.amount_due || 0), 0);
    const received = financeRows.reduce((sum, r) => sum + Number(r.total_received || 0), 0);
    const outstanding = financeRows.reduce((sum, r) => sum + Number(r.remaining_balance || 0), 0);
    const totalCommission = financeRows.reduce((sum, r) => sum + Number(r.commission_amount || 0), 0);
    const grossBookingValue = financeRows.reduce((sum, r) => sum + Number(r.gross_booking_value || 0), 0);
    const totalExpenses = (otaExpenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const totalBookings = financeRows.length;
    const unpaid = financeRows.filter((r) => r.payment_status === "unpaid").length;
    const partial = financeRows.filter((r) => r.payment_status === "partially_paid").length;
    const paid = financeRows.filter((r) => r.payment_status === "fully_paid").length;

    const byChannel: Record<string, { expected: number; received: number; outstanding: number; commission: number; expense: number; count: number }> = {};
    financeRows.forEach((r) => {
      if (!byChannel[r.channel]) {
        byChannel[r.channel] = { expected: 0, received: 0, outstanding: 0, commission: 0, expense: 0, count: 0 };
      }
      byChannel[r.channel].expected += Number(r.amount_due || 0);
      byChannel[r.channel].received += Number(r.total_received || 0);
      byChannel[r.channel].outstanding += Number(r.remaining_balance || 0);
      byChannel[r.channel].commission += Number(r.commission_amount || 0);
      byChannel[r.channel].count += 1;
    });
    (otaExpenses || []).forEach((expense) => {
      const key = expense.channel || "other";
      if (!byChannel[key]) {
        byChannel[key] = { expected: 0, received: 0, outstanding: 0, commission: 0, expense: 0, count: 0 };
      }
      byChannel[key].expense += Number(expense.amount || 0);
    });

    return {
      expectedPayout,
      received,
      outstanding,
      totalCommission,
      grossBookingValue,
      totalExpenses,
      netCashAfterExpenses: received - totalExpenses,
      totalBookings,
      unpaid,
      partial,
      paid,
      byChannel,
    };
  }, [financeRows, otaExpenses]);

  const exportToCSV = () => {
    if (!financeRows.length) {
      toast({
        variant: "destructive",
        title: "No data to export",
        description: "There are no bookings in the selected date range.",
      });
      return;
    }

    const headers = [
      "Booking Reference",
      "Channel",
      "Guest Name",
      "Studio Number",
      "Check-in Date",
      "Expected Payout (GBP)",
      "Received (GBP)",
      "Outstanding (GBP)",
      "Payment Status",
      "Booking Status",
    ];

    const rows = financeRows.map((row) => {
      const studioNum =
        (row as { studio_number?: string | null }).studio_number ??
        bookingStudioMap[row.booking_id] ??
        "N/A";
      return [
        row.external_ref,
        row.channel,
        row.guest_name,
        studioNum,
        row.check_in,
        row.amount_due.toFixed(2),
        row.total_received.toFixed(2),
        row.remaining_balance.toFixed(2),
        row.payment_status,
        row.booking_status,
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    const dateRangeStr = dateRange === "custom" 
      ? `${customStartDate}_to_${customEndDate}`
      : dateRange === "this_week"
      ? `week_${format(startDate, "yyyy-MM-dd")}`
      : `month_${format(startDate, "yyyy-MM")}`;
    link.setAttribute("download", `ota_finance_report_${dateRangeStr}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Report exported",
      description: `Successfully exported OTA finance report to CSV.`,
    });
  };

  if (isLoading || ledgerLoading) {
    return (
      <AdminLayout pageTitle="OTA Finance" subtitle="Expected payouts vs cash received">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="rounded-3xl">
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="rounded-3xl">
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout pageTitle="OTA Finance" subtitle="Expected payouts vs cash received">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Record payments and edit payment history in{" "}
            <Link to="/ota-bookings/payments?tab=history" className="text-primary underline-offset-4 hover:underline">
              OTA Payments
            </Link>
            . Expected payout is not cash until recorded.
          </p>
          <Button asChild variant="outline" className="rounded-md shrink-0">
            <Link to="/ota-bookings/payments">
              <CreditCard className="h-4 w-4 mr-2" />
              Record payment
            </Link>
          </Button>
        </div>

        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-3 md:gap-4 items-end">
              <div className="flex-1 min-w-[150px]">
                <Select value={dateRange} onValueChange={(value: "this_week" | "this_month" | "custom") => setDateRange(value)}>
                  <SelectTrigger className="rounded-md">
                    <SelectValue placeholder="Date Range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="this_week">This Week</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {dateRange === "custom" && (
                <>
                  <div className="flex-1 min-w-[150px]">
                    <Input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="rounded-md"
                      placeholder="Start Date"
                    />
                  </div>
                  <div className="flex-1 min-w-[150px]">
                    <Input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="rounded-md"
                      placeholder="End Date"
                    />
                  </div>
                </>
              )}
              <div className="flex-1 min-w-[150px]">
                <Select value={channelFilter} onValueChange={setChannelFilter}>
                  <SelectTrigger className="rounded-md">
                    <SelectValue placeholder="Channel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Channels</SelectItem>
                    <SelectItem value="airbnb">Airbnb</SelectItem>
                    <SelectItem value="booking">Booking.com</SelectItem>
                    <SelectItem value="agoda">Agoda</SelectItem>
                    <SelectItem value="expedia">Expedia</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="Search booking ref, guest, studio, channel, status..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-md text-sm md:text-base"
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <Select
                  value={paymentStatusFilter}
                  onValueChange={(v) => setPaymentStatusFilter(v as OTAPaymentStatus | "all")}
                >
                  <SelectTrigger className="rounded-md">
                    <SelectValue placeholder="Payment status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All payment statuses</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="partially_paid">Partial</SelectItem>
                    <SelectItem value="fully_paid">Paid</SelectItem>
                    <SelectItem value="overpaid">Overpaid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-shrink-0">
                <Button
                  onClick={exportToCSV}
                  className="rounded-md gap-2"
                  variant="destructive"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </div>
            {dateRange !== "custom" && (
              <div className="mt-4 text-xs text-muted-foreground">
                Showing data from {startDate ? format(startDate, "MMM d, yyyy") : "N/A"} to {endDate ? format(endDate, "MMM d, yyyy") : "N/A"}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Expected payout</div>
              <div className="text-xl md:text-2xl font-bold text-amber-700">
                {formatCurrency(stats.expectedPayout)}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Received</div>
              <div className="text-xl md:text-2xl font-bold text-green-600">
                {formatCurrency(stats.received)}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Outstanding</div>
              <div className="text-xl md:text-2xl font-bold text-orange-600">
                {formatCurrency(stats.outstanding)}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Gross booking value</div>
              <div className="text-xl md:text-2xl font-bold text-blue-600">
                {formatCurrency(stats.grossBookingValue)}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Commission</div>
              <div className="text-xl md:text-2xl font-bold text-orange-600">
                {formatCurrency(stats.totalCommission)}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">OTA expenses</div>
              <div className="text-xl md:text-2xl font-bold text-red-600">
                {formatCurrency(stats.totalExpenses)}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Unpaid / Partial / Paid</div>
              <div className="text-xl md:text-2xl font-bold">
                {stats.unpaid} / {stats.partial} / {stats.paid}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Bookings with financials</div>
              <div className="text-xl md:text-2xl font-bold">{stats.totalBookings}</div>
            </CardContent>
          </Card>
        </div>

        {/* Channel Breakdown */}
        {Object.keys(stats.byChannel).length > 0 && (
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardHeader>
              <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
                Settlement by channel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {Object.entries(stats.byChannel).map(([channel, data]) => (
                  <div key={channel} className="space-y-2 p-4 rounded-xl bg-muted/50">
                    <div className="font-semibold text-sm capitalize">{channel}</div>
                    <div className="text-xs text-muted-foreground">Expected: {formatCurrency(data.expected)}</div>
                    <div className="text-xs text-muted-foreground">Received: {formatCurrency(data.received)}</div>
                    <div className="text-xs text-muted-foreground">Outstanding: {formatCurrency(data.outstanding)}</div>
                    <div className="text-xs text-muted-foreground">Commission: {formatCurrency(data.commission)}</div>
                    <div className="text-xs text-muted-foreground">Expenses: {formatCurrency(data.expense)}</div>
                    <div className="text-xs text-muted-foreground">Bookings: {data.count}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bookings Table */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
              Booking Financial Details
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Showing {financeRows.length} booking{financeRows.length !== 1 ? "s" : ""} with financial data
            </CardDescription>
          </CardHeader>
          <CardContent>
            {financeRows.length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-base md:text-lg font-semibold mb-2">No bookings found</h3>
                <p className="text-xs md:text-sm text-muted-foreground">
                  {channelFilter !== "all" || dateRange === "custom"
                    ? "Try adjusting your filters."
                    : "No bookings with financial data in the selected period."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs md:text-sm">Booking Ref</TableHead>
                      <TableHead className="text-xs md:text-sm">Channel</TableHead>
                      <TableHead className="text-xs md:text-sm">Guest</TableHead>
                      <TableHead className="text-xs md:text-sm">Studio</TableHead>
                      <TableHead className="text-xs md:text-sm">Check-in</TableHead>
                      <TableHead className="text-xs md:text-sm">Nights</TableHead>
                      <TableHead className="text-xs md:text-sm">Price/Night</TableHead>
                      <TableHead className="text-xs md:text-sm">Total Value</TableHead>
                      <TableHead className="text-xs md:text-sm">Expected</TableHead>
                      <TableHead className="text-xs md:text-sm">Received</TableHead>
                      <TableHead className="text-xs md:text-sm">Outstanding</TableHead>
                      <TableHead className="text-xs md:text-sm">Payment</TableHead>
                      <TableHead className="text-xs md:text-sm">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {financeRows.map((row) => {
                      const studioNum =
                        (row as { studio_number?: string | null }).studio_number ??
                        bookingStudioMap[row.booking_id] ??
                        "—";
                      const payStatus = row.payment_status as OTAPaymentStatus;
                      return (
                        <TableRow key={row.booking_id}>
                          <TableCell className="text-xs font-medium">{row.external_ref}</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className="text-xs capitalize">
                              {row.channel}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{row.guest_name}</TableCell>
                          <TableCell className="text-xs">{studioNum}</TableCell>
                          <TableCell className="text-xs">
                            {format(parseISO(row.check_in), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-xs">{row.number_of_nights || 0}</TableCell>
                          <TableCell className="text-xs">
                            {formatCurrency(row.price_per_night)}
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            {formatCurrency(row.gross_booking_value)}
                          </TableCell>
                          <TableCell className="text-xs font-medium text-amber-700">
                            {formatCurrency(row.amount_due)}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-green-600">
                            {formatCurrency(row.total_received)}
                          </TableCell>
                          <TableCell className="text-xs text-orange-600">
                            {formatCurrency(row.remaining_balance)}
                          </TableCell>
                          <TableCell className="text-xs">
                            <OTAPaymentStatusBadge status={payStatus} />
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className="text-xs capitalize">
                              {row.booking_status.replace("_", " ")}
                            </Badge>
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
    </AdminLayout>
  );
};

export default OTAFinancePage;

