import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { useOTABookings } from "@/hooks/useOTABookings";
import { useOTAExpenses } from "@/hooks/useOTAExpenses";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, addWeeks, subMonths, addMonths } from "date-fns";
import {
  DollarSign, TrendingUp, TrendingDown, Download, Calendar, Filter,
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

// Revenue-generating statuses (for reference, but we'll show all bookings with revenue data)
const REVENUE_STATUSES = ["checked_in", "in_house_guest", "checked_out"];

const OTAFinancePage = () => {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<"this_week" | "this_month" | "custom">("this_month");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
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

  // Filter bookings that have revenue data (total_revenue is not null)
  // This includes all bookings with financial information, regardless of status
  const revenueBookings = useMemo(() => {
    if (!bookings) return [];
    let filtered = bookings.filter((b) => b.total_revenue !== null && b.total_revenue !== undefined);
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((b) => {
        return (
          b.external_ref?.toLowerCase().includes(query) ||
          b.guest_name?.toLowerCase().includes(query) ||
          b.studio?.studio_number?.toLowerCase().includes(query) ||
          b.channel?.toLowerCase().includes(query) ||
          b.status?.toLowerCase().includes(query)
        );
      });
    }
    
    return filtered;
  }, [bookings, searchQuery]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!revenueBookings) {
      return {
        totalRevenue: 0,
        totalCommission: 0,
        grossRevenue: 0,
        totalExpenses: 0,
        netProfit: 0,
        totalBookings: 0,
        avgRevenuePerBooking: 0,
        byChannel: {} as Record<string, { revenue: number; commission: number; expense: number; net: number; count: number }>,
      };
    }

    const totalRevenue = revenueBookings.reduce((sum, b) => sum + (b.total_revenue || 0), 0);
    const totalCommission = revenueBookings.reduce((sum, b) => sum + (b.commission_amount || 0), 0);
    const grossRevenue = totalRevenue;
    const totalExpenses = (otaExpenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const netProfit = grossRevenue - totalExpenses;
    const totalBookings = revenueBookings.length;
    const avgRevenuePerBooking = totalBookings > 0 ? totalRevenue / totalBookings : 0;

    // Calculate by channel
    const byChannel: Record<string, { revenue: number; commission: number; expense: number; net: number; count: number }> = {};
    revenueBookings.forEach((b) => {
      if (!byChannel[b.channel]) {
        byChannel[b.channel] = { revenue: 0, commission: 0, expense: 0, net: 0, count: 0 };
      }
      byChannel[b.channel].revenue += b.total_revenue || 0;
      byChannel[b.channel].commission += b.commission_amount || 0;
      byChannel[b.channel].count += 1;
    });
    (otaExpenses || []).forEach((expense) => {
      const key = expense.channel || "other";
      if (!byChannel[key]) {
        byChannel[key] = { revenue: 0, commission: 0, expense: 0, net: 0, count: 0 };
      }
      byChannel[key].expense += Number(expense.amount || 0);
    });
    Object.keys(byChannel).forEach((channel) => {
      byChannel[channel].net = byChannel[channel].revenue - byChannel[channel].expense;
    });

    return {
      totalRevenue,
      totalCommission,
      grossRevenue,
      totalExpenses,
      netProfit,
      totalBookings,
      avgRevenuePerBooking,
      byChannel,
    };
  }, [revenueBookings, otaExpenses]);

  // Export to CSV
  const exportToCSV = () => {
    if (!revenueBookings || revenueBookings.length === 0) {
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
      "Check-out Date",
      "Number of Nights",
      "Price per Night (GBP)",
      "Total Booking Value (GBP)",
      "Commission Amount (GBP)",
      "Total Revenue (GBP)",
      "Status",
      "Created Date",
    ];

    const rows = revenueBookings.map((booking) => {
      const totalBookingValue = (booking.price_per_night || 0) * (booking.number_of_nights || 0);
      return [
        booking.external_ref,
        booking.channel,
        booking.guest_name,
        booking.studio?.studio_number || "N/A",
        format(parseISO(booking.check_in), "yyyy-MM-dd"),
        format(parseISO(booking.check_out), "yyyy-MM-dd"),
        (booking.number_of_nights || 0).toString(),
        (booking.price_per_night || 0).toFixed(2),
        totalBookingValue.toFixed(2),
        (booking.commission_amount || 0).toFixed(2),
        (booking.total_revenue || 0).toFixed(2),
        booking.status,
        format(parseISO(booking.created_at), "yyyy-MM-dd HH:mm:ss"),
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

  // Skeleton loader
  if (isLoading) {
    return (
      <AdminLayout pageTitle="OTA Finance" subtitle="Track revenue, commissions, and financial performance">
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
    <AdminLayout pageTitle="OTA Finance" subtitle="Track revenue, commissions, and financial performance">
      <div className="space-y-6">
        {/* Filters */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base md:text-lg font-display font-bold uppercase tracking-wide">
              <Filter className="h-4 w-4 md:h-5 md:w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-3 md:gap-4 items-end">
              <div className="flex-1 min-w-[150px]">
                <Select value={dateRange} onValueChange={(value: "this_week" | "this_month" | "custom") => setDateRange(value)}>
                  <SelectTrigger className="rounded-full">
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
                      className="rounded-full"
                      placeholder="Start Date"
                    />
                  </div>
                  <div className="flex-1 min-w-[150px]">
                    <Input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="rounded-full"
                      placeholder="End Date"
                    />
                  </div>
                </>
              )}
              <div className="flex-1 min-w-[150px]">
                <Select value={channelFilter} onValueChange={setChannelFilter}>
                  <SelectTrigger className="rounded-full">
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
                  className="rounded-full text-sm md:text-base"
                />
              </div>
              <div className="flex-shrink-0">
                <Button
                  onClick={exportToCSV}
                  className="rounded-full gap-2"
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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Total Revenue</div>
              <div className="text-xl md:text-2xl font-bold text-green-600">
                {formatCurrency(stats.totalRevenue)}
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
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Gross Revenue</div>
              <div className="text-xl md:text-2xl font-bold text-blue-600">
                {formatCurrency(stats.grossRevenue)}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">OTA Expenses</div>
              <div className="text-xl md:text-2xl font-bold text-red-600">
                {formatCurrency(stats.totalExpenses)}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Net Profit</div>
              <div className={`text-xl md:text-2xl font-bold ${stats.netProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                {formatCurrency(stats.netProfit)}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Total Bookings</div>
              <div className="text-xl md:text-2xl font-bold">{stats.totalBookings}</div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Avg per Booking</div>
              <div className="text-xl md:text-2xl font-bold text-purple-600">
                {formatCurrency(stats.avgRevenuePerBooking)}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Revenue Bookings</div>
              <div className="text-xl md:text-2xl font-bold">
                {revenueBookings.length} / {bookings?.length || 0}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Expense Records</div>
              <div className="text-xl md:text-2xl font-bold">
                {otaExpenses?.length || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Channel Breakdown */}
        {Object.keys(stats.byChannel).length > 0 && (
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardHeader>
              <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
                Revenue by Channel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {Object.entries(stats.byChannel).map(([channel, data]) => (
                  <div key={channel} className="space-y-2 p-4 rounded-xl bg-muted/50">
                    <div className="font-semibold text-sm capitalize">{channel}</div>
                    <div className="text-xs text-muted-foreground">Revenue: {formatCurrency(data.revenue)}</div>
                    <div className="text-xs text-muted-foreground">Commission: {formatCurrency(data.commission)}</div>
                    <div className="text-xs text-muted-foreground">Expenses: {formatCurrency(data.expense)}</div>
                    <div className={`text-xs font-medium ${data.net >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      Net: {formatCurrency(data.net)}
                    </div>
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
              Showing {revenueBookings.length} booking{revenueBookings.length !== 1 ? "s" : ""} with revenue data
            </CardDescription>
          </CardHeader>
          <CardContent>
            {revenueBookings.length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-base md:text-lg font-semibold mb-2">No bookings found</h3>
                <p className="text-xs md:text-sm text-muted-foreground">
                  {channelFilter !== "all" || dateRange === "custom"
                    ? "Try adjusting your filters."
                    : "No bookings with revenue data in the selected period."}
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
                      <TableHead className="text-xs md:text-sm">Commission</TableHead>
                      <TableHead className="text-xs md:text-sm">Revenue</TableHead>
                      <TableHead className="text-xs md:text-sm">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revenueBookings.map((booking) => {
                      const totalValue = (booking.price_per_night || 0) * (booking.number_of_nights || 0);
                      return (
                        <TableRow key={booking.id}>
                          <TableCell className="text-xs font-medium">{booking.external_ref}</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className="text-xs capitalize">
                              {booking.channel}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{booking.guest_name}</TableCell>
                          <TableCell className="text-xs">
                            {booking.studio?.studio_number || "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {format(parseISO(booking.check_in), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-xs">{booking.number_of_nights || 0}</TableCell>
                          <TableCell className="text-xs">
                            {formatCurrency(booking.price_per_night)}
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            {formatCurrency(totalValue)}
                          </TableCell>
                          <TableCell className="text-xs text-orange-600">
                            {formatCurrency(booking.commission_amount)}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-green-600">
                            {formatCurrency(booking.total_revenue)}
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className="text-xs capitalize">
                              {booking.status.replace("_", " ")}
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

