import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useOTAStudioIncomeSummaryReport } from "@/hooks/useReports";
import { Download, FileText, CalendarRange } from "lucide-react";
import { format, startOfMonth, endOfMonth, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const formatCurrencyReport = (amount: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

const OTAReports = () => {
  const { toast } = useToast();
  const defaultRange = (() => {
    const today = new Date();
    return { from: startOfMonth(today), to: endOfMonth(today) };
  })();
  const [dateFrom, setDateFrom] = useState<string>(() => format(defaultRange.from, "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState<string>(() => format(defaultRange.to, "yyyy-MM-dd"));
  const [dateRange, setDateRange] = useState<DateRange | undefined>(defaultRange);

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
    if (!range?.from) {
      setDateFrom("");
      setDateTo("");
      return;
    }
    setDateFrom(format(range.from, "yyyy-MM-dd"));
    setDateTo(range.to ? format(range.to, "yyyy-MM-dd") : "");
  };

  const clearDateRange = () => {
    setDateRange(undefined);
    setDateFrom("");
    setDateTo("");
  };

  const { data: report, isLoading } = useOTAStudioIncomeSummaryReport(dateFrom, dateTo);

  const exportToCSV = () => {
    if (!report || report.rows.length === 0) {
      toast({
        title: "No data to export",
        description: "Select a date range and ensure there are OTA-assigned studios with bookings.",
        variant: "destructive",
      });
      return;
    }
    const headers = [
      "Room No",
      "Studio Grade",
      "Total Res",
      "Total Nights",
      "Accom",
      "Discount",
      "Other",
      "Total",
      "Avg Accom",
      "Avg Daily Tariff",
      "Occupancy (%)",
      "Revenue per Day",
      "Revenue per Week",
      "Revenue per Month",
      "Revenue per Year",
    ];
    const rows = report.rows.map((r) => [
      r.room_no,
      r.studio_grade_name,
      r.total_res.toString(),
      r.total_nights.toString(),
      r.accom.toFixed(2),
      r.discount.toFixed(2),
      r.other.toFixed(2),
      r.total.toFixed(2),
      r.avg_accom.toFixed(2),
      r.avg_daily_tariff.toFixed(2),
      r.occupancy_pct.toFixed(2),
      r.revenue_per_day.toFixed(2),
      r.revenue_per_week.toFixed(2),
      r.revenue_per_month.toFixed(2),
      r.revenue_per_year.toFixed(2),
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ota_studio_income_summary_${report.dateFrom}_${report.dateTo}.csv`;
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    toast({ title: "Report exported", description: "OTA Studio Income Summary exported to CSV." });
  };

  const exportToPDF = () => {
    if (!report || report.rows.length === 0) {
      toast({
        title: "No data to export",
        description: "Select a date range and ensure there are OTA-assigned studios with bookings.",
        variant: "destructive",
      });
      return;
    }
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("OTA Studio Income Summary (Gross Revenue)", 14, 18);
    doc.setFontSize(10);
    doc.text(
      `From ${format(new Date(report.dateFrom), "dd MMM yyyy")} To ${format(new Date(report.dateTo), "dd MMM yyyy")}`,
      14,
      26,
    );
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 32);

    const tableData = report.rows.map((r) => [
      r.room_no,
      r.total_res.toString(),
      r.total_nights.toString(),
      formatCurrencyReport(r.accom),
      formatCurrencyReport(r.discount),
      formatCurrencyReport(r.other),
      formatCurrencyReport(r.total),
      formatCurrencyReport(r.avg_accom),
      formatCurrencyReport(r.avg_daily_tariff),
      `${r.occupancy_pct.toFixed(2)}%`,
    ]);

    autoTable(doc, {
      startY: 40,
      head: [
        [
          "Room No",
          "Total Res",
          "Total Nights",
          "Accom",
          "Discount",
          "Other",
          "Total",
          "Avg Accom",
          "Avg Daily Tariff",
          "Occupancy (%)",
        ],
      ],
      body: tableData,
      foot: [
        [
          "Grand Total",
          report.grandTotal.total_res.toString(),
          report.grandTotal.total_nights.toString(),
          formatCurrencyReport(report.grandTotal.accom),
          formatCurrencyReport(report.grandTotal.discount),
          formatCurrencyReport(report.grandTotal.other),
          formatCurrencyReport(report.grandTotal.total),
          formatCurrencyReport(report.grandTotal.avg_accom),
          formatCurrencyReport(report.grandTotal.avg_daily_tariff),
          `${report.grandTotal.occupancy_pct.toFixed(2)}%`,
        ],
      ],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 139, 202] },
      footStyles: { fillColor: [220, 220, 220] },
    });

    doc.save(`ota_studio_income_summary_${report.dateFrom}_${report.dateTo}.pdf`);
    toast({ title: "Report exported", description: "OTA Studio Income Summary exported to PDF." });
  };

  const hasData = report && report.rows.length > 0;

  return (
    <AdminLayout
      pageTitle="OTA Reports"
      subtitle="OTA Studio Income Summary — view and export by date range"
      mobileActionButton={
        hasData ? (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="rounded-full p-2 h-9 w-9" onClick={exportToCSV}>
              <Download className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" className="rounded-full p-2 h-9 w-9" onClick={exportToPDF}>
              <FileText className="h-4 w-4" />
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <Card className="rounded-3xl">
          <CardHeader>
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">
                  OTA Studio Income Summary
                </CardTitle>
                <CardDescription className="mt-1">
                  OTA-assigned studios with booking and revenue summary. Filter by date range.
                </CardDescription>
              </div>
              {hasData && (
                <div className="flex gap-2 flex-shrink-0 rounded-lg bg-muted/80 p-2 md:p-2.5">
                  <Button
                    onClick={exportToCSV}
                    variant="secondary"
                    size="sm"
                    className="rounded-full gap-1.5 bg-background shadow-sm hover:bg-muted"
                  >
                    <Download className="h-4 w-4" />
                    Export CSV
                  </Button>
                  <Button
                    onClick={exportToPDF}
                    variant="secondary"
                    size="sm"
                    className="rounded-full gap-1.5 bg-background shadow-sm hover:bg-muted"
                  >
                    <FileText className="h-4 w-4" />
                    Export PDF
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start">
              <div className="w-full sm:w-64">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Date range</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between rounded-full px-3 py-2 h-auto text-left mt-1.5">
                      <span className="text-xs sm:text-sm truncate">
                        {dateFrom && dateTo
                          ? `${format(new Date(dateFrom), "dd MMM yyyy")} — ${format(new Date(dateTo), "dd MMM yyyy")}`
                          : "Select date range"}
                      </span>
                      <CalendarRange className="h-4 w-4 text-muted-foreground ml-2 flex-shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3" align="start">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="space-y-2 sm:w-40">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick range</p>
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-full text-xs"
                            onClick={() => {
                              const today = new Date();
                              handleDateRangeChange({ from: subDays(today, 6), to: today });
                            }}
                          >
                            Last 7 days
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-full text-xs"
                            onClick={() => {
                              const today = new Date();
                              handleDateRangeChange({ from: subDays(today, 29), to: today });
                            }}
                          >
                            Last 30 days
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-full text-xs"
                            onClick={() => {
                              const today = new Date();
                              handleDateRangeChange({ from: startOfMonth(today), to: endOfMonth(today) });
                            }}
                          >
                            This month
                          </Button>
                          {(dateFrom || dateTo) && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="rounded-full text-xs text-muted-foreground"
                              onClick={clearDateRange}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>
                      <Calendar
                        mode="range"
                        selected={dateRange}
                        onSelect={handleDateRangeChange}
                        numberOfMonths={2}
                        defaultMonth={dateRange?.from ?? new Date()}
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : hasData ? (
              <>
                <p className="text-sm text-muted-foreground">
                  From {format(new Date(report!.dateFrom), "dd MMM yyyy")} to{" "}
                  {format(new Date(report!.dateTo), "dd MMM yyyy")} · {report!.rows.length} room
                  {report!.rows.length !== 1 ? "s" : ""}
                </p>
                <div className="rounded-xl border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Room No</TableHead>
                        <TableHead className="text-right">Total Res</TableHead>
                        <TableHead className="text-right">Total Nights</TableHead>
                        <TableHead className="text-right">Accom</TableHead>
                        <TableHead className="text-right">Discount</TableHead>
                        <TableHead className="text-right">Other</TableHead>
                        <TableHead className="text-right font-semibold">Total</TableHead>
                        <TableHead className="text-right">Avg Accom</TableHead>
                        <TableHead className="text-right">Avg Daily Tariff</TableHead>
                        <TableHead className="text-right">Occupancy (%)</TableHead>
                        <TableHead className="text-right">Rev/Day</TableHead>
                        <TableHead className="text-right">Rev/Week</TableHead>
                        <TableHead className="text-right">Rev/Month</TableHead>
                        <TableHead className="text-right">Rev/Year</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report!.rows.map((r) => (
                        <TableRow key={r.studio_id}>
                          <TableCell className="font-medium">{r.room_no}</TableCell>
                          <TableCell className="text-right">{r.total_res}</TableCell>
                          <TableCell className="text-right">{r.total_nights}</TableCell>
                          <TableCell className="text-right">{formatCurrencyReport(r.accom)}</TableCell>
                          <TableCell className="text-right">{formatCurrencyReport(r.discount)}</TableCell>
                          <TableCell className="text-right">{formatCurrencyReport(r.other)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrencyReport(r.total)}</TableCell>
                          <TableCell className="text-right">{formatCurrencyReport(r.avg_accom)}</TableCell>
                          <TableCell className="text-right">{formatCurrencyReport(r.avg_daily_tariff)}</TableCell>
                          <TableCell className="text-right">{r.occupancy_pct.toFixed(2)}%</TableCell>
                          <TableCell className="text-right">{formatCurrencyReport(r.revenue_per_day)}</TableCell>
                          <TableCell className="text-right">{formatCurrencyReport(r.revenue_per_week)}</TableCell>
                          <TableCell className="text-right">{formatCurrencyReport(r.revenue_per_month)}</TableCell>
                          <TableCell className="text-right">{formatCurrencyReport(r.revenue_per_year)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="bg-muted/70 font-semibold">
                        <TableCell>Grand Total</TableCell>
                        <TableCell className="text-right">{report!.grandTotal.total_res}</TableCell>
                        <TableCell className="text-right">{report!.grandTotal.total_nights}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrencyReport(report!.grandTotal.accom)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrencyReport(report!.grandTotal.discount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrencyReport(report!.grandTotal.other)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrencyReport(report!.grandTotal.total)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrencyReport(report!.grandTotal.avg_accom)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrencyReport(report!.grandTotal.avg_daily_tariff)}
                        </TableCell>
                        <TableCell className="text-right">
                          {report!.grandTotal.occupancy_pct.toFixed(2)}%
                        </TableCell>
                        <TableCell colSpan={4} />
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </>
            ) : report && report.rows.length === 0 ? (
              <Card className="rounded-2xl border-dashed">
                <CardContent className="py-8">
                  <p className="text-muted-foreground text-center">
                    No OTA-assigned studios with bookings in this date range. Adjust the filter or ensure studios are
                    allocated to OTA and have confirmed bookings.
                  </p>
                </CardContent>
              </Card>
            ) : !dateFrom || !dateTo ? (
              <p className="text-sm text-muted-foreground">Select a date range to view the report.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default OTAReports;
