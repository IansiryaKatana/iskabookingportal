import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Calendar, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";

// Helper function to safely format dates
const safeFormatDate = (dateString: string | null | undefined, formatString: string): string => {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid date";
    return format(date, formatString);
  } catch (error) {
    return "Invalid date";
  }
};

type WeeklyReportData = {
  weekStartDate: string;
  weekEndDate: string;
  summary: {
    totalAmount: number;
    totalCount: number;
    stripeAmount: number;
    stripeCount: number;
    manualAmount: number;
    manualCount: number;
  };
  paymentsByDay: Record<string, any[]>;
  payments: any[];
};

const WeeklyPaymentReport = () => {
  const { toast } = useToast();
  const [weekStartDate, setWeekStartDate] = useState(() => {
    // Default to Monday of current week
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const monday = new Date(today.setDate(diff));
    return format(monday, "yyyy-MM-dd");
  });
  const [weekEndDate, setWeekEndDate] = useState(() => {
    // Default to Sunday of current week
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? 0 : 7); // Adjust when day is Sunday
    const sunday = new Date(today.setDate(diff));
    return format(sunday, "yyyy-MM-dd");
  });
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<WeeklyReportData | null>(null);

  const fetchReport = async () => {
    if (!weekStartDate) {
      toast({
        title: "Missing date",
        description: "Please select a week start date.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("weekly-payment-report", {
        body: {
          weekStartDate,
          weekEndDate: weekEndDate || undefined,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setReportData(data);
    } catch (error: any) {
      toast({
        title: "Error fetching report",
        description: error.message || "Failed to fetch weekly payment report.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!reportData) return;

    const headers = [
      "Week Start",
      "Week End",
      "Total Amount",
      "Payment Count",
      "Stripe Amount",
      "Stripe Count",
      "Manual Amount",
      "Manual Count",
    ];

    const rows = [
      [
        safeFormatDate(reportData.weekStartDate, "yyyy-MM-dd"),
        safeFormatDate(reportData.weekEndDate, "yyyy-MM-dd"),
        reportData.summary.totalAmount.toString(),
        reportData.summary.totalCount.toString(),
        reportData.summary.stripeAmount.toString(),
        reportData.summary.stripeCount.toString(),
        reportData.summary.manualAmount.toString(),
        reportData.summary.manualCount.toString(),
      ],
    ];

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `weekly-payment-report-${weekStartDate}-${weekEndDate || "current"}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Report exported",
      description: "Weekly payment report has been exported to CSV.",
    });
  };

  return (
    <AdminLayout
      pageTitle="Weekly Payment Report"
      subtitle="View and export weekly payment summaries"
      mobileActionButton={
        <Button
          size="sm"
          variant="outline"
          className="rounded-md p-2 h-9 w-9 flex-shrink-0"
          onClick={exportToCSV}
          disabled={!reportData}
        >
          <Download className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-6">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-xl font-display uppercase tracking-wide flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Report Parameters
            </CardTitle>
            <CardDescription>Select the week to generate the payment report</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="week-start">Week Start Date *</Label>
                <Input
                  id="week-start"
                  type="date"
                  value={weekStartDate}
                  onChange={(e) => setWeekStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="week-end">Week End Date (Optional)</Label>
                <Input
                  id="week-end"
                  type="date"
                  value={weekEndDate}
                  onChange={(e) => setWeekEndDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use 7 days from start date
                </p>
              </div>
            </div>
            <Button
              onClick={fetchReport}
              disabled={loading || !weekStartDate}
              className="rounded-md uppercase tracking-wide gap-2"
            >
              {loading ? (
                <>
                  <Calendar className="h-4 w-4 animate-spin" />
                  Generating Report
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4" />
                  Generate Report
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {loading && (
          <Card className="rounded-3xl">
            <CardContent className="p-6">
              <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            </CardContent>
          </Card>
        )}

        {reportData && !loading && (
          <Card className="rounded-3xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-display uppercase tracking-wide">
                    Weekly Payment Summary
                  </CardTitle>
                  <CardDescription>
                    {safeFormatDate(reportData.weekStartDate, "MMM dd")} -{" "}
                    {safeFormatDate(reportData.weekEndDate, "MMM dd, yyyy")}
                  </CardDescription>
                </div>
                <Button
                  onClick={exportToCSV}
                  variant="outline"
                  className="rounded-md uppercase tracking-wide gap-2 hidden lg:flex"
                  disabled={!reportData}
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="rounded-2xl border border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium uppercase tracking-wide">
                      Total Payments
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(reportData.summary.totalAmount)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {reportData.summary.totalCount} payment{reportData.summary.totalCount !== 1 ? "s" : ""}
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium uppercase tracking-wide">
                      Stripe Payments
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(reportData.summary.stripeAmount)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {reportData.summary.stripeCount} payment{reportData.summary.stripeCount !== 1 ? "s" : ""}
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium uppercase tracking-wide">
                      Manual Payments
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">
                      {formatCurrency(reportData.summary.manualAmount)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {reportData.summary.manualCount} payment{reportData.summary.manualCount !== 1 ? "s" : ""}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {reportData.payments && reportData.payments.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-display uppercase tracking-wide">Payments by Day</h3>
                  <div className="space-y-2">
                    {Object.entries(reportData.paymentsByDay || {})
                      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
                      .map(([date, dayPayments]) => {
                        const dayTotal = dayPayments.reduce((sum, p) => sum + (p.amount_paid || 0), 0);
                        return (
                          <div
                            key={date}
                            className="rounded-xl border border-border/60 px-4 py-3 flex items-center justify-between"
                          >
                            <div>
                              <p className="font-medium">{safeFormatDate(date, "EEEE, MMM dd, yyyy")}</p>
                              <p className="text-sm text-muted-foreground">
                                {dayPayments.length} payment{dayPayments.length !== 1 ? "s" : ""}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold">{formatCurrency(dayTotal)}</p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!reportData && !loading && (
          <Card className="rounded-3xl border-dashed">
            <CardHeader>
              <CardTitle className="text-xl font-display uppercase tracking-wide">
                No Report Generated
              </CardTitle>
              <CardDescription>
                Select a week and click "Generate Report" to view payment summary
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
};

export default WeeklyPaymentReport;

