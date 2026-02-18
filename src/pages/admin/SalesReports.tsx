import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { AcademicYearSelector } from "@/components/admin/AcademicYearSelector";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useSalesDemographicsReport, useSalesOccupancyMonthly, useSalesRebookersMonthly, useDownloadSalesReport, useSalesReportCashSummary } from "@/hooks/useSalesReports";
import { useToast } from "@/hooks/use-toast";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Download, Users, BarChart3, RefreshCw, PiggyBank, Receipt } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const chartConfig = {
  occupancy: {
    label: "Occupancy %",
    color: "hsl(var(--chart-1))",
  },
  rebooker_share: {
    label: "Rebooker Share %",
    color: "hsl(var(--chart-2))",
  },
} as const;

const SalesReports = () => {
  const [academicYearId, setAcademicYearId] = useState<string | undefined>();
  const { toast } = useToast();

  const { data: demographics, isLoading: loadingDemographics } = useSalesDemographicsReport(academicYearId);
  const { data: occupancy, isLoading: loadingOccupancy } = useSalesOccupancyMonthly(academicYearId);
  const { data: rebookers, isLoading: loadingRebookers } = useSalesRebookersMonthly(academicYearId);
  const { data: cashSummary, isLoading: loadingCash } = useSalesReportCashSummary(academicYearId);
  const downloadMutation = useDownloadSalesReport();

  const handleDownload = async () => {
    try {
      await downloadMutation.mutateAsync(academicYearId);
      toast({
        title: "Sales report downloaded",
        description: "Your Excel sales report has been generated using live confirmed contracts.",
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Download failed",
        description: "We could not generate the sales report. Please try again or contact support.",
        variant: "destructive",
      });
    }
  };

  const totalContracts = demographics?.length ?? 0;
  const totalSalesValue = useMemo(
    () => (demographics ?? []).reduce((sum, row) => sum + (row.total_sales_value || 0), 0),
    [demographics],
  );
  const totalRebookers = useMemo(
    () => (demographics ?? []).filter((row) => row.is_rebooker).length,
    [demographics],
  );
  const totalSummerSales = useMemo(
    () => (demographics ?? []).reduce((sum, row) => sum + (row.summer_sales_value || 0), 0),
    [demographics],
  );

  const rebookerRate = totalContracts > 0 ? Math.round((totalRebookers / totalContracts) * 100 * 100) / 100 : 0;

  const occupancyChartData = useMemo(
    () =>
      (occupancy ?? []).map((row) => ({
        month: row.month_label,
        occupancy: row.occupancy_percentage,
      })),
    [occupancy],
  );

  const rebookerChartData = useMemo(
    () =>
      (rebookers ?? []).map((row) => ({
        month: row.month_label,
        rebooker_share: row.rebooker_share_percentage,
      })),
    [rebookers],
  );

  const academicYearName =
    demographics?.[0]?.academic_year_name ||
    occupancy?.[0]?.academic_year_name ||
    rebookers?.[0]?.academic_year_name ||
    "All Academic Years";

  const isLoading = loadingDemographics || loadingOccupancy || loadingRebookers;
  const isLoadingOverview = isLoading || loadingCash;

  return (
    <AdminLayout
      pageTitle="Sales & Demographics"
      subtitle="Live sales, occupancy, and demographics from confirmed contracts"
      mobileActionButton={
        <Button
          size="sm"
          variant="outline"
          className="rounded-full p-2 h-9 w-9 flex-shrink-0"
          onClick={handleDownload}
          disabled={downloadMutation.isPending || isLoading}
        >
          {downloadMutation.isPending ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </Button>
      }
    >
      <div className="space-y-6">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">
              Filters
            </CardTitle>
            <CardDescription>Select the academic year to analyse sales and demographics.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Academic Year</Label>
                <div className="mt-2">
                  <AcademicYearSelector value={academicYearId} onValueChange={setAcademicYearId} />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Data is always calculated from live confirmed contracts in the selected academic year.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">
                  Sales Overview
                </CardTitle>
                <CardDescription className="mt-1">
                  {academicYearName} • Live confirmed contracts only
                </CardDescription>
              </div>
              <Button
                onClick={handleDownload}
                className="hidden lg:flex rounded-full uppercase tracking-wide gap-2"
                disabled={downloadMutation.isPending || isLoading}
              >
                {downloadMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Download Excel
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Desktop: one row of 7 cards (xl). Mobile: 2 cols; sm 3; md 4 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4 mb-6">
              <div className="rounded-2xl bg-primary/5 p-3 sm:p-4 flex flex-col gap-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Confirmed Contracts</p>
                <p className="text-xl sm:text-2xl font-bold">{totalContracts}</p>
              </div>
              <div className="rounded-2xl bg-primary/5 p-3 sm:p-4 flex flex-col gap-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Sales Value</p>
                <p className="text-xs text-muted-foreground/80 hidden sm:block">Expected when all paid in full</p>
                <p className="text-xl sm:text-2xl font-bold">
                  £{Math.round(totalSalesValue).toLocaleString("en-GB")}
                </p>
              </div>
              <div className="rounded-2xl bg-primary/5 p-3 sm:p-4 flex flex-col gap-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Received</p>
                <p className="text-xs text-muted-foreground/80 hidden sm:block">Cash collected so far</p>
                {loadingCash ? (
                  <Skeleton className="h-8 w-20 sm:h-9 sm:w-24" />
                ) : (
                  <p className="text-xl sm:text-2xl font-bold text-green-700 dark:text-green-400">
                    £{Math.round(cashSummary?.total_received ?? 0).toLocaleString("en-GB")}
                  </p>
                )}
              </div>
              <div className="rounded-2xl bg-primary/5 p-3 sm:p-4 flex flex-col gap-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <PiggyBank className="h-3 w-3 flex-shrink-0" />
                  Deposits Collected
                </p>
                {loadingCash ? (
                  <Skeleton className="h-8 w-20 sm:h-9 sm:w-24" />
                ) : (
                  <p className="text-xl sm:text-2xl font-bold">
                    £{Math.round(cashSummary?.total_deposits_collected ?? 0).toLocaleString("en-GB")}
                  </p>
                )}
              </div>
              <div className="rounded-2xl bg-primary/5 p-3 sm:p-4 flex flex-col gap-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Receipt className="h-3 w-3 flex-shrink-0" />
                  Installments Collected
                </p>
                {loadingCash ? (
                  <Skeleton className="h-8 w-20 sm:h-9 sm:w-24" />
                ) : (
                  <p className="text-xl sm:text-2xl font-bold">
                    £{Math.round(cashSummary?.total_installments_collected ?? 0).toLocaleString("en-GB")}
                  </p>
                )}
              </div>
              <div className="rounded-2xl bg-primary/5 p-3 sm:p-4 flex flex-col gap-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Rebooker Share</p>
                <p className="text-xl sm:text-2xl font-bold">{rebookerRate}%</p>
              </div>
              <div className="rounded-2xl bg-primary/5 p-3 sm:p-4 flex flex-col gap-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Summer Sales</p>
                <p className="text-xl sm:text-2xl font-bold">
                  £{Math.round(totalSummerSales).toLocaleString("en-GB")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm md:text-base font-display flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Occupancy by Month
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Average occupancy percentage across studio grades per month.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  {occupancyChartData.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No occupancy data available.</p>
                  ) : (
                    <ChartContainer config={chartConfig} className="w-full h-64">
                      <LineChart data={occupancyChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={(v) => `${v}%`} width={40} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Line
                          type="monotone"
                          dataKey="occupancy"
                          stroke="var(--color-occupancy)"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm md:text-base font-display flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Rebookers by Month
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Percentage of confirmed contracts that are rebookers for each month.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  {rebookerChartData.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No rebooking data available.</p>
                  ) : (
                    <ChartContainer config={chartConfig} className="w-full h-64">
                      <LineChart data={rebookerChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={(v) => `${v}%`} width={40} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Line
                          type="monotone"
                          dataKey="rebooker_share"
                          stroke="var(--color-rebooker_share)"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">
              Demographics (Per Contract)
            </CardTitle>
            <CardDescription className="mt-1">
              Each row represents a confirmed contract, aligned with the Demographics sheet in your Excel sample.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingDemographics ? (
              <p className="text-sm text-muted-foreground">Loading demographics data…</p>
            ) : !demographics || demographics.length === 0 ? (
              <p className="text-sm text-muted-foreground">No demographics data available for this selection.</p>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="w-full text-xs md:text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 px-2 text-left">Name</th>
                      <th className="py-2 px-2 text-left">Country</th>
                      <th className="py-2 px-2 text-left">Studio</th>
                      <th className="py-2 px-2 text-left">Grade</th>
                      <th className="py-2 px-2 text-left">Partner</th>
                      <th className="py-2 px-2 text-right">Weekly Rent</th>
                      <th className="py-2 px-2 text-right">Total Value</th>
                      <th className="py-2 px-2 text-right">Cashback</th>
                      <th className="py-2 px-2 text-right">Discount</th>
                      <th className="py-2 px-2 text-right">Commission</th>
                      <th className="py-2 px-2 text-left">Rebooker</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demographics.map((row) => (
                      <tr key={row.application_id} className="border-b last:border-0">
                        <td className="py-2 px-2">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {row.first_name} {row.last_name}
                            </span>
                            {row.ucas_id && (
                              <span className="text-[10px] text-muted-foreground">UCAS: {row.ucas_id}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2">{row.country || "—"}</td>
                        <td className="py-2 px-2">{row.studio_number || "—"}</td>
                        <td className="py-2 px-2">{row.studio_grade || "—"}</td>
                        <td className="py-2 px-2">
                          {row.partner_name ? (
                            <span className="flex items-center gap-1">
                              <Badge variant="outline" className="text-[10px]">
                                {row.partner_name}
                              </Badge>
                            </span>
                          ) : (
                            "Direct"
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {row.weekly_rent != null ? `£${row.weekly_rent.toFixed(0)}` : "—"}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {row.total_sales_value != null ? `£${Math.round(row.total_sales_value).toLocaleString("en-GB")}` : "—"}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {row.cashback_value && row.cashback_value > 0 ? (
                            <span className="text-green-600 font-semibold">
                              -£{row.cashback_value.toFixed(0)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {row.discount_value && row.discount_value > 0 ? (
                            <span className="text-green-600 font-semibold">
                              -£{row.discount_value.toFixed(0)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {row.partner_commission && row.partner_commission > 0
                            ? `£${row.partner_commission.toFixed(0)}`
                            : "—"}
                        </td>
                        <td className="py-2 px-2">
                          {row.is_rebooker ? (
                            <Badge variant="default" className="text-[10px] uppercase">
                              Rebooker
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">New</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default SalesReports;


