import { useMemo, useId } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Users, Globe, CreditCard, TrendingUp, PiggyBank, Receipt } from "lucide-react";
import type { SalesDemographicsRow, SalesOccupancyMonthlyRow, SalesRebookersMonthlyRow } from "@/hooks/useSalesReports";

const occupancyChartConfig = {
  occupancy: { label: "Occupancy %", color: "hsl(var(--chart-1))" },
} as const;

const rebookerChartConfig = {
  rebooker_share: { label: "Rebooker Share %", color: "hsl(var(--chart-2))" },
} as const;

const countryChartConfig = {
  contracts: { label: "Contracts", color: "hsl(var(--chart-4))" },
} as const;

function aggregateOccupancyByMonth(rows: SalesOccupancyMonthlyRow[]) {
  const byMonth = new Map<
    string,
    { month: string; month_start: string; confirmed: number; capacity: number }
  >();

  for (const row of rows) {
    const existing = byMonth.get(row.month_start) ?? {
      month: row.month_label,
      month_start: row.month_start,
      confirmed: 0,
      capacity: 0,
    };
    existing.confirmed += row.confirmed_contracts;
    existing.capacity += row.capacity;
    byMonth.set(row.month_start, existing);
  }

  return Array.from(byMonth.values())
    .sort((a, b) => a.month_start.localeCompare(b.month_start))
    .map((entry) => ({
      month: entry.month,
      occupancy:
        entry.capacity > 0
          ? Math.round((entry.confirmed / entry.capacity) * 10000) / 100
          : 0,
    }));
}

function sortRebookersByMonth(rows: SalesRebookersMonthlyRow[]) {
  return [...rows]
    .sort((a, b) => a.month_start.localeCompare(b.month_start))
    .map((row) => ({
      month: row.month_label,
      rebooker_share: row.rebooker_share_percentage,
      rebooker_contracts: row.rebooker_contracts,
      total_contracts: row.total_contracts,
    }));
}

function buildPaymentPlanBreakdown(demographics: SalesDemographicsRow[]) {
  const counts = new Map<string, number>();
  for (const row of demographics) {
    const plan = row.payment_plan?.trim() || "Not set";
    counts.set(plan, (counts.get(plan) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function buildCountryBreakdown(demographics: SalesDemographicsRow[]) {
  const counts = new Map<string, number>();
  for (const row of demographics) {
    const country = row.country?.trim() || "Unknown";
    counts.set(country, (counts.get(country) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 5).map(([name, contracts]) => ({ name, contracts }));
  const otherTotal = sorted.slice(5).reduce((sum, [, count]) => sum + count, 0);
  if (otherTotal > 0) {
    top.push({ name: "Other", contracts: otherTotal });
  }
  return top;
}

function averageOf(values: number[]) {
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100;
}

function ChartLoadingSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 px-4 text-center">
      <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

type SalesReportChartsProps = {
  occupancy: SalesOccupancyMonthlyRow[] | undefined;
  rebookers: SalesRebookersMonthlyRow[] | undefined;
  demographics: SalesDemographicsRow[] | undefined;
  loadingOccupancy: boolean;
  loadingRebookers: boolean;
  loadingDemographics: boolean;
  loadingCash: boolean;
  totalReceived: number;
  totalDepositsCollected: number;
  totalInstallmentsCollected: number;
  totalSalesValue: number;
};

export function SalesReportCharts({
  occupancy,
  rebookers,
  demographics,
  loadingOccupancy,
  loadingRebookers,
  loadingDemographics,
  loadingCash,
  totalReceived,
  totalDepositsCollected,
  totalInstallmentsCollected,
  totalSalesValue,
}: SalesReportChartsProps) {
  const occupancyGradientId = useId().replace(/:/g);
  const rebookerGradientId = useId().replace(/:/g);

  const occupancyChartData = useMemo(() => aggregateOccupancyByMonth(occupancy ?? []), [occupancy]);
  const rebookerChartData = useMemo(() => sortRebookersByMonth(rebookers ?? []), [rebookers]);
  const paymentPlanData = useMemo(
    () => buildPaymentPlanBreakdown(demographics ?? []),
    [demographics],
  );
  const countryData = useMemo(() => buildCountryBreakdown(demographics ?? []), [demographics]);

  const avgOccupancy = averageOf(occupancyChartData.map((d) => d.occupancy));
  const peakOccupancy = occupancyChartData.reduce(
    (best, row) => (row.occupancy > best.occupancy ? row : best),
    { month: "—", occupancy: 0 },
  );
  const avgRebookerShare = averageOf(rebookerChartData.map((d) => d.rebooker_share));
  const latestRebooker = rebookerChartData[rebookerChartData.length - 1];

  const collectionRate =
    totalSalesValue > 0
      ? Math.min(100, Math.round((totalReceived / totalSalesValue) * 10000) / 100)
      : 0;
  const depositShareOfReceived =
    totalReceived > 0 ? Math.round((totalDepositsCollected / totalReceived) * 10000) / 100 : 0;
  const installmentShareOfReceived =
    totalReceived > 0 ? Math.round((totalInstallmentsCollected / totalReceived) * 10000) / 100 : 0;

  const percentFormatter = (value: number) => `${value}%`;
  const formatCurrency = (amount: number) => `£${Math.round(amount).toLocaleString("en-GB")}`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm font-display md:text-base">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Occupancy by Month
                </CardTitle>
                <CardDescription className="text-xs">
                  Weighted occupancy across all studio grades (confirmed contracts only).
                </CardDescription>
              </div>
              {!loadingOccupancy && occupancyChartData.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="rounded-md text-[10px]">
                    Avg {avgOccupancy}%
                  </Badge>
                  <Badge variant="outline" className="rounded-md text-[10px]">
                    Peak {peakOccupancy.occupancy}% · {peakOccupancy.month}
                  </Badge>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingOccupancy ? (
              <ChartLoadingSkeleton />
            ) : occupancyChartData.length === 0 ? (
              <EmptyChartState message="No occupancy data for this academic year yet." />
            ) : (
              <ChartContainer config={occupancyChartConfig} className="aspect-auto h-64 w-full">
                <AreaChart data={occupancyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={occupancyGradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-occupancy)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-occupancy)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickMargin={8} />
                  <YAxis
                    tickFormatter={percentFormatter}
                    width={44}
                    domain={[0, 100]}
                    tick={{ fontSize: 10 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => [percentFormatter(Number(value)), "Occupancy"]}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="occupancy"
                    stroke="var(--color-occupancy)"
                    strokeWidth={2}
                    fill={`url(#${occupancyGradientId})`}
                    dot={{ r: 3, fill: "var(--color-occupancy)", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm font-display md:text-base">
                  <Users className="h-4 w-4 text-primary" />
                  Rebookers by Month
                </CardTitle>
                <CardDescription className="text-xs">
                  Share of confirmed contracts that are returning students.
                </CardDescription>
              </div>
              {!loadingRebookers && rebookerChartData.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="rounded-md text-[10px]">
                    Avg {avgRebookerShare}%
                  </Badge>
                  {latestRebooker && (
                    <Badge variant="outline" className="rounded-md text-[10px]">
                      Latest {latestRebooker.rebooker_share}% ({latestRebooker.rebooker_contracts}/
                      {latestRebooker.total_contracts})
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingRebookers ? (
              <ChartLoadingSkeleton />
            ) : rebookerChartData.length === 0 ? (
              <EmptyChartState message="No rebooking data for this academic year yet." />
            ) : (
              <ChartContainer config={rebookerChartConfig} className="aspect-auto h-64 w-full">
                <AreaChart data={rebookerChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={rebookerGradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-rebooker_share)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-rebooker_share)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickMargin={8} />
                  <YAxis
                    tickFormatter={percentFormatter}
                    width={44}
                    domain={[0, 100]}
                    tick={{ fontSize: 10 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, _name, item) => {
                          const payload = item.payload as {
                            rebooker_contracts?: number;
                            total_contracts?: number;
                          };
                          const detail =
                            payload.rebooker_contracts != null && payload.total_contracts != null
                              ? ` (${payload.rebooker_contracts}/${payload.total_contracts})`
                              : "";
                          return [`${value}%${detail}`, "Rebooker share"];
                        }}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="rebooker_share"
                    stroke="var(--color-rebooker_share)"
                    strokeWidth={2}
                    fill={`url(#${rebookerGradientId})`}
                    dot={{ r: 3, fill: "var(--color-rebooker_share)", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-display md:text-base">
              <CreditCard className="h-4 w-4 text-primary" />
              Payment Plans
            </CardTitle>
            <CardDescription className="text-xs">
              Distribution for the selected application statuses.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingDemographics ? (
              <ChartLoadingSkeleton />
            ) : paymentPlanData.length === 0 ? (
              <EmptyChartState message="No contracts in the selected statuses yet." />
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-xl border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Payment Plan</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Contracts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentPlanData.map((item, index) => (
                      <tr
                        key={item.name}
                        className={index % 2 === 0 ? "bg-background" : "bg-muted/30"}
                      >
                        <td className="px-3 py-2.5 font-medium">{item.name}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold">{item.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-display md:text-base">
              <Globe className="h-4 w-4 text-primary" />
              Top Countries
            </CardTitle>
            <CardDescription className="text-xs">
              Where your selected contracts are coming from.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingDemographics ? (
              <ChartLoadingSkeleton />
            ) : countryData.length === 0 ? (
              <EmptyChartState message="No country data for the current selection." />
            ) : (
              <ChartContainer config={countryChartConfig} className="aspect-auto h-64 w-full">
                <BarChart data={countryData} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={72}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => (value.length > 12 ? `${value.slice(0, 12)}…` : value)}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => [`${value} contracts`, "Count"]}
                        labelFormatter={(label) => String(label)}
                      />
                    }
                  />
                  <Bar dataKey="contracts" fill="var(--color-contracts)" radius={[0, 6, 6, 0]} barSize={18} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl md:col-span-2 xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-display md:text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Cash Collection
            </CardTitle>
            <CardDescription className="text-xs">
              Received vs expected sales value for the academic year.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingCash ? (
              <ChartLoadingSkeleton />
            ) : (
              <div className="flex min-h-64 flex-col justify-center gap-4 py-1">
                <div className="space-y-2">
                  <div className="flex items-end justify-between gap-2">
                    <span className="text-3xl font-bold tabular-nums">{collectionRate}%</span>
                    <span className="text-xs text-muted-foreground">of expected sales</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-md bg-muted">
                    <div
                      className="h-full rounded-md bg-primary transition-all duration-500"
                      style={{ width: `${Math.min(collectionRate, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{formatCurrency(totalReceived)} received</span>
                    <span>{formatCurrency(totalSalesValue)} expected</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        <PiggyBank className="h-3 w-3" />
                        Deposit collection
                      </p>
                      <span className="text-sm font-bold tabular-nums">{formatCurrency(totalDepositsCollected)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-md bg-muted">
                      <div
                        className="h-full rounded-md bg-amber-500 transition-all duration-500"
                        style={{ width: `${depositShareOfReceived}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">{depositShareOfReceived}% of cash received</p>
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        <Receipt className="h-3 w-3" />
                        Installment collection
                      </p>
                      <span className="text-sm font-bold tabular-nums">{formatCurrency(totalInstallmentsCollected)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-md bg-muted">
                      <div
                        className="h-full rounded-md bg-green-600 transition-all duration-500"
                        style={{ width: `${installmentShareOfReceived}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {installmentShareOfReceived}% of cash received
                    </p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Outstanding: {formatCurrency(Math.max(0, totalSalesValue - totalReceived))}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
