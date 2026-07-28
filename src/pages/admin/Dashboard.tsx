import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, constrainedButtonClassName } from "@/components/ui/button";
import { Info, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useDashboardStats, useDashboardBreakdowns } from "@/hooks/useDashboardStats";
import { useActiveCashbackCampaigns } from "@/hooks/useCashback";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AcademicYearSelector } from "@/components/admin/AcademicYearSelector";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const metricSectionLabelClass =
  "text-[11px] uppercase tracking-wide text-muted-foreground";

const dashboardMetricValueClass =
  "font-black font-display tabular-nums leading-none tracking-tight text-4xl sm:text-5xl xl:text-5xl 2xl:text-6xl";

function MetricLabelWithTooltip({
  label,
  tooltip,
  className,
}: {
  label: string;
  tooltip: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5 min-w-0", className)}>
      <span className="truncate">{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label={`About ${label}`}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  total,
  tooltip,
  accentClass = "bg-primary",
  stretch = false,
}: {
  label: string;
  value: number;
  total: number;
  tooltip?: string;
  accentClass?: string;
  stretch?: boolean;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div
      className={cn(
        "flex flex-col min-h-0",
        stretch ? "flex-1 gap-2" : "space-y-1.5",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-sm shrink-0">
        {tooltip ? (
          <MetricLabelWithTooltip
            label={label}
            tooltip={tooltip}
            className="text-muted-foreground font-medium"
          />
        ) : (
          <span className="text-muted-foreground font-medium truncate">{label}</span>
        )}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
          <span className="font-bold font-display tabular-nums">{value}</span>
        </div>
      </div>
      <div
        className={cn(
          "w-full rounded-md bg-muted overflow-hidden",
          stretch ? "flex-1 min-h-[10px]" : "h-2",
        )}
      >
        <div
          className={cn("h-full rounded-md transition-all", accentClass)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

type OverviewMetricAccent = "students" | "applications" | "revenue" | "recent";

const overviewMetricStyles: Record<
  OverviewMetricAccent,
  { card: string; value: string }
> = {
  students: {
    card: "border-blue-200/80 dark:border-blue-800/40 bg-gradient-to-br from-blue-50 via-sky-50/90 to-white dark:from-blue-950/45 dark:via-blue-900/20 dark:to-background",
    value: "text-blue-950 dark:text-blue-50",
  },
  applications: {
    card: "border-violet-200/80 dark:border-violet-800/40 bg-gradient-to-br from-violet-50 via-purple-50/90 to-white dark:from-violet-950/45 dark:via-violet-900/20 dark:to-background",
    value: "text-violet-950 dark:text-violet-50",
  },
  revenue: {
    card: "border-emerald-200/80 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 via-green-50/90 to-white dark:from-emerald-950/45 dark:via-emerald-900/20 dark:to-background",
    value: "text-emerald-950 dark:text-emerald-50",
  },
  recent: {
    card: "border-amber-200/80 dark:border-amber-800/40 bg-gradient-to-br from-amber-50 via-yellow-50/90 to-white dark:from-amber-950/45 dark:via-amber-900/20 dark:to-background",
    value: "text-amber-950 dark:text-amber-50",
  },
};

const reviewQueueLabelClass =
  "text-[10px] uppercase tracking-wide text-muted-foreground leading-snug";

const reviewQueueMetricValueClass =
  "font-black font-display tabular-nums leading-none tracking-tight text-3xl sm:text-4xl";

const reviewQueueDescriptionClass = "text-[11px] leading-snug text-muted-foreground";

const reviewQueueGridClass =
  "grid gap-3 h-full min-w-0 grid-cols-1 md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2";

const reviewQueueCellClass =
  "rounded-2xl border border-border/60 bg-muted/20 p-3 sm:p-4 flex flex-col gap-2 sm:gap-3 min-w-0";

const reviewQueueActionClassName = cn(
  constrainedButtonClassName,
  "rounded-md uppercase tracking-wide mt-auto border-0 shadow-none text-[11px] sm:text-xs",
  "bg-yellow-400 hover:bg-yellow-500 text-yellow-950 dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-yellow-950",
);

function OverviewMetric({
  label,
  value,
  tooltip,
  formatted,
  accent,
  compactValue = false,
}: {
  label: string;
  value: number;
  tooltip: string;
  accent: OverviewMetricAccent;
  formatted?: string;
  compactValue?: boolean;
}) {
  const styles = overviewMetricStyles[accent];

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 flex flex-col gap-3 h-full min-h-[5.5rem]",
        styles.card,
      )}
    >
      <MetricLabelWithTooltip
        label={label}
        tooltip={tooltip}
        className={metricSectionLabelClass}
      />
      <p
        className={cn(
          "font-black font-display tabular-nums leading-none mt-auto tracking-tight min-w-0 break-words",
          compactValue
            ? "text-xl sm:text-2xl xl:text-3xl"
            : "text-4xl sm:text-5xl xl:text-5xl 2xl:text-6xl",
          styles.value,
        )}
      >
        {formatted ?? value}
      </p>
    </div>
  );
}

const Dashboard = () => {
  const { loading, profile, role, session } = useAuth();
  const navigate = useNavigate();
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string | undefined>(undefined);
  const { data: stats, isLoading: statsLoading } = useDashboardStats(selectedAcademicYearId);
  const { data: breakdowns, isLoading: breakdownsLoading } = useDashboardBreakdowns(selectedAcademicYearId);
  const { data: activeCampaigns, isLoading: campaignsLoading } = useActiveCashbackCampaigns(
    undefined, 
    selectedAcademicYearId
  );
  const showPaymentRequestQueue = role === "accountant" || role === "staff" || role === "superadmin";
  const { data: pendingPaymentRequests = 0, isLoading: pendingPaymentRequestsLoading } = useQuery({
    queryKey: ["manual-payment-requests-pending-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("manual_payment_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: showPaymentRequestQueue && !!session && !loading,
  });

  const authReady = !!session && !loading;
  const showSkeleton = !authReady || (statsLoading && !stats);
  const otherStatusEntries = Object.entries(breakdowns?.applications.byStatus ?? {})
    .filter(
      ([status]) =>
        status !== "confirmed" &&
        status !== "awaiting_deposit" &&
        status !== "awaiting_signature",
    )
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <AdminLayout
      hideDesktopHeader
      pageTitle="Dashboard"
      subtitle="Overview of occupancy, applications, and operational queues"
      pageToolbar={
        <AcademicYearSelector
          value={selectedAcademicYearId}
          onValueChange={(value) => setSelectedAcademicYearId(value)}
          className="w-full md:w-64"
          allowEmpty={false}
        />
      }
    >
      {showSkeleton ? (
        <>
          <section className="grid gap-6 lg:grid-cols-3 mb-10 items-stretch">
            {/* Occupancy Overview Skeleton */}
            <Card className="bg-primary text-primary-foreground rounded-3xl">
              <CardHeader>
                <div className="h-6 w-48 bg-primary-foreground/20 animate-pulse rounded" />
                <div className="h-4 w-full bg-primary-foreground/20 animate-pulse rounded mt-2" />
                <div className="h-4 w-3/4 bg-primary-foreground/20 animate-pulse rounded mt-1" />
              </CardHeader>
              <CardContent>
                <div className="h-12 w-16 bg-primary-foreground/20 animate-pulse rounded" />
                <div className="h-3 w-40 bg-primary-foreground/20 animate-pulse rounded mt-2" />
              </CardContent>
            </Card>
            {/* Active Cashback Campaign Skeleton */}
            <Card className="rounded-3xl bg-yellow-50 dark:bg-yellow-950/20">
              <CardHeader>
                <div className="h-6 w-40 bg-yellow-100 dark:bg-yellow-900/30 animate-pulse rounded" />
                <div className="h-4 w-full bg-yellow-100 dark:bg-yellow-900/30 animate-pulse rounded mt-2" />
                <div className="h-4 w-2/3 bg-yellow-100 dark:bg-yellow-900/30 animate-pulse rounded mt-1" />
              </CardHeader>
              <CardContent>
                <div className="h-4 w-full bg-yellow-100 dark:bg-yellow-900/30 animate-pulse rounded" />
                <div className="h-4 w-5/6 bg-yellow-100 dark:bg-yellow-900/30 animate-pulse rounded mt-2" />
              </CardContent>
            </Card>
            {/* Review queue skeleton */}
            <Card className="rounded-3xl border border-border/60">
              <CardHeader>
                <div className="h-6 w-44 bg-muted animate-pulse rounded" />
                <div className="h-4 w-full bg-muted animate-pulse rounded mt-2" />
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                  <div className="h-24 bg-muted animate-pulse rounded-2xl" />
                  <div className="h-24 bg-muted animate-pulse rounded-2xl" />
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-3 mb-10 items-stretch">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="rounded-3xl border border-border/60 h-full flex flex-col">
                <CardHeader>
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-4 w-full mt-2" />
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  {[1, 2, 3, 4, 5].map((j) => (
                    <Skeleton key={j} className="h-10 w-full rounded-lg" />
                  ))}
                </CardContent>
              </Card>
            ))}
          </section>
        </>
      ) : (
        <TooltipProvider delayDuration={200}>
        <>
          <section className="grid gap-6 lg:grid-cols-3 mb-10 items-stretch">
            <Card className="bg-primary text-primary-foreground rounded-3xl border border-border/60 h-full flex flex-col">
              <CardHeader>
                <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">
                  Occupancy Overview
                </CardTitle>
                <CardDescription className="text-primary-foreground/80">
                  {stats?.occupancy.total ? (
                    <>
                      {stats.occupancy.occupied} of {stats.occupancy.total} studios occupied
                    </>
                  ) : (
                    "View live occupancy by studio grade and academic year"
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col pt-0 min-h-0">
                <div className="flex-1 flex items-center">
                  <p className="text-6xl sm:text-7xl md:text-8xl font-black font-display tracking-tight leading-none">
                    {stats?.occupancy.percentage ?? 0}%
                  </p>
                </div>
                <p className={cn(metricSectionLabelClass, "text-primary-foreground/80 mt-auto tracking-[0.3em]")}>
                  {stats?.occupancy.total ? (
                    `${stats.occupancy.occupied} occupied / ${stats.occupancy.total} total`
                  ) : (
                    "Populate data to unlock insights"
                  )}
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-3xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/20 h-full flex flex-col">
              <CardHeader>
                <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">
                  Active Cashback Campaign
                </CardTitle>
                <CardDescription>
                  {campaignsLoading ? (
                    "Loading campaign data..."
                  ) : activeCampaigns && activeCampaigns.length > 0 ? (
                    <>
                      {activeCampaigns.length} active campaign{activeCampaigns.length !== 1 ? "s" : ""} running
                    </>
                  ) : (
                    "No active cashback campaigns at the moment"
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col min-h-0">
                {campaignsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                ) : activeCampaigns && activeCampaigns.length > 0 ? (
                  <div className="space-y-3 flex-1 flex flex-col">
                    {activeCampaigns.slice(0, 2).map((campaign) => (
                      <div key={campaign.id} className="space-y-2 pb-3 border-b border-yellow-200 dark:border-yellow-800 last:border-0 last:pb-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-bold text-base md:text-lg text-yellow-900 dark:text-yellow-100">
                              {campaign.name}
                            </p>
                            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                              {formatCurrency(campaign.cashback_amount)} cashback
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">
                              {campaign.current_uses}
                              {campaign.max_uses ? ` / ${campaign.max_uses}` : ""} uses
                            </p>
                            {campaign.max_uses && (
                              <div className="mt-1 w-20 h-1.5 bg-yellow-200 dark:bg-yellow-900/50 rounded-md overflow-hidden">
                                <div
                                  className="h-full bg-yellow-500 dark:bg-yellow-400 rounded-md transition-all"
                                  style={{
                                    width: `${Math.min((campaign.current_uses / campaign.max_uses) * 100, 100)}%`,
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-yellow-600 dark:text-yellow-400">
                          {format(new Date(campaign.start_date), "MMM d")} - {format(new Date(campaign.end_date), "MMM d, yyyy")}
                        </p>
                      </div>
                    ))}
                    {activeCampaigns.length > 2 && (
                      <Button
                        size="sm"
                        className="mt-auto w-full flex justify-between items-center bg-black hover:bg-black/90 text-white hover:text-white border-0 rounded-md"
                        onClick={() => navigate("/admin/cashback-campaigns")}
                      >
                        <span>View all {activeCampaigns.length} campaigns</span>
                        <ArrowUpRight className="h-4 w-4 shrink-0" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      No active campaigns. Create one to incentivize bookings.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-md uppercase tracking-wide border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
                      onClick={() => navigate("/admin/cashback-campaigns")}
                    >
                      Create Campaign
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="rounded-3xl border border-border/60 h-full flex flex-col">
              <CardHeader>
                <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">
                  Review Queue
                </CardTitle>
                <CardDescription>
                  {stats?.pendingVerifications || (showPaymentRequestQueue && pendingPaymentRequests > 0)
                    ? "Documents and payments waiting for staff action"
                    : "Document checks and payment requests appear here"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 min-w-0">
                <div
                  className={cn(
                    reviewQueueGridClass,
                    !showPaymentRequestQueue && "grid-cols-1 md:grid-cols-1 2xl:grid-cols-1",
                  )}
                >
                  <div className={reviewQueueCellClass}>
                    <p className={reviewQueueLabelClass}>
                      Pending Verifications
                    </p>
                    {stats?.pendingVerifications ? (
                      <>
                        <p className={reviewQueueMetricValueClass}>
                          {stats.pendingVerifications}
                        </p>
                        <p className={reviewQueueDescriptionClass}>
                          document{stats.pendingVerifications !== 1 ? "s" : ""} awaiting review
                        </p>
                        <Button
                          size="sm"
                          className={reviewQueueActionClassName}
                          onClick={() => navigate("/admin/applications")}
                        >
                          Review documents
                        </Button>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground flex-1">
                        No documents awaiting review.
                      </p>
                    )}
                  </div>

                  {showPaymentRequestQueue && (
                    <div className={reviewQueueCellClass}>
                      <p className={reviewQueueLabelClass}>
                        Payment Approvals
                      </p>
                      {pendingPaymentRequestsLoading ? (
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-8 w-12" />
                          <Skeleton className="h-9 w-full" />
                        </div>
                      ) : pendingPaymentRequests > 0 ? (
                        <>
                          <p className={reviewQueueMetricValueClass}>
                            {pendingPaymentRequests}
                          </p>
                          <p className={reviewQueueDescriptionClass}>
                            payment request{pendingPaymentRequests !== 1 ? "s" : ""} awaiting approval
                          </p>
                          <Button
                            size="sm"
                            className={reviewQueueActionClassName}
                            onClick={() => navigate("/admin/manual-payment-entry")}
                          >
                            Review requests
                          </Button>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground flex-1">
                          No pending payment requests.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Overview · Students · Applications — three equal columns */}
          <section className="grid gap-6 lg:grid-cols-3 mb-10 items-stretch">
            {/* Column 1: Key metrics */}
            <Card className="rounded-3xl border border-border/60 h-full flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle
                  className="text-base font-display font-bold uppercase tracking-wide"
                  tooltip="Headline metrics for the selected academic year"
                  tooltipLabel="About Overview"
                >
                  Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col min-h-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3 flex-1 h-full auto-rows-fr">
                  <OverviewMetric
                    label="Total Students"
                    value={stats?.totalStudents ?? 0}
                    tooltip="Registered students in scope for the selected academic year."
                    accent="students"
                  />
                  <OverviewMetric
                    label="Total Applications"
                    value={stats?.totalApplications ?? 0}
                    tooltip="All applications for the selected academic year, including confirmed, pending, and other statuses."
                    accent="applications"
                  />
                  <OverviewMetric
                    label="Total Revenue"
                    value={stats?.totalRevenue ?? 0}
                    formatted={formatCurrency(stats?.totalRevenue ?? 0)}
                    tooltip="Total collected from completed payments."
                    accent="revenue"
                    compactValue
                  />
                  <OverviewMetric
                    label="Recent Applications"
                    value={stats?.recentApplications ?? 0}
                    tooltip="Applications created in the last 7 days."
                    accent="recent"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Column 2: Students breakdown */}
            <Card className="rounded-3xl border border-border/60 h-full flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-display font-bold uppercase tracking-wide">
                  Students
                </CardTitle>
                <CardDescription>
                  {breakdownsLoading
                    ? "Loading student breakdown…"
                    : `${breakdowns?.students.total ?? 0} registered · share of total population`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col min-h-0">
                {breakdownsLoading ? (
                  <div className="space-y-4 flex-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <>
                    <p className="text-3xl font-bold font-display tabular-nums mb-4 shrink-0">
                      {breakdowns?.students.total ?? 0}
                      <span className={cn(metricSectionLabelClass, "ml-2")}>total</span>
                    </p>
                    <div className="flex flex-col flex-1 gap-3 min-h-0">
                      <BreakdownRow
                        stretch
                        label="With Applications"
                        value={breakdowns?.students.withApplication ?? 0}
                        total={breakdowns?.students.total ?? 0}
                        tooltip="Students who submitted at least one application."
                        accentClass="bg-blue-500"
                      />
                      <BreakdownRow
                        stretch
                        label="Confirmed"
                        value={breakdowns?.students.confirmed ?? 0}
                        total={breakdowns?.students.total ?? 0}
                        tooltip="Unique students with a confirmed booking."
                        accentClass="bg-emerald-500"
                      />
                      <BreakdownRow
                        stretch
                        label="In Pipeline"
                        value={breakdowns?.students.inPipeline ?? 0}
                        total={breakdowns?.students.total ?? 0}
                        tooltip="Awaiting signature or awaiting deposit."
                        accentClass="bg-amber-500"
                      />
                      <BreakdownRow
                        stretch
                        label="Without Applications"
                        value={breakdowns?.students.withoutApplication ?? 0}
                        total={breakdowns?.students.total ?? 0}
                        tooltip="Registered students with no application yet."
                        accentClass="bg-muted-foreground/40"
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Column 3: Applications breakdown */}
            <Card className="rounded-3xl border border-border/60 h-full flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-display font-bold uppercase tracking-wide">
                  Applications
                </CardTitle>
                <CardDescription>
                  {breakdownsLoading
                    ? "Loading application breakdown…"
                    : "Status pipeline and contract mix"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-4 min-h-0">
                {breakdownsLoading ? (
                  <div className="space-y-4 flex-1">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 shrink-0">
                      <div className="flex flex-col justify-center sm:flex-1 sm:basis-0 min-w-0 sm:border-r sm:border-border/60 sm:pr-6">
                        <p className="text-3xl font-bold font-display tabular-nums leading-none">
                          {breakdowns?.applications.total ?? 0}
                          <span className={cn(metricSectionLabelClass, "ml-2")}>total</span>
                        </p>
                        <p className={cn(metricSectionLabelClass, "mt-2")}>
                          Every application
                          <br />
                          in current scope
                        </p>
                      </div>

                      {(breakdowns?.applications.total ?? 0) > 0 && (
                        <div className="flex flex-col flex-1 justify-center gap-2 min-w-0">
                          <MetricLabelWithTooltip
                            label="Contract type mix"
                            tooltip="Applications on default vs custom contract templates."
                            className={metricSectionLabelClass}
                          />
                          <div className="flex h-2.5 w-full rounded-md overflow-hidden bg-muted">
                            <div
                              className="bg-primary transition-all h-full"
                              style={{
                                width: `${Math.round(
                                  ((breakdowns?.applications.defaultContracts ?? 0) /
                                    (breakdowns?.applications.total ?? 1)) *
                                    100,
                                )}%`,
                              }}
                              title="Default contracts"
                            />
                            <div
                              className="bg-violet-500 transition-all h-full"
                              style={{
                                width: `${Math.round(
                                  ((breakdowns?.applications.customContracts ?? 0) /
                                    (breakdowns?.applications.total ?? 1)) *
                                    100,
                                )}%`,
                              }}
                              title="Custom contracts"
                            />
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            <span className={cn("flex items-center gap-1.5", metricSectionLabelClass)}>
                              <span className="h-2 w-2 rounded-sm bg-primary shrink-0" />
                              Default
                              <strong className="font-display text-foreground tabular-nums">
                                {breakdowns?.applications.defaultContracts ?? 0}
                              </strong>
                            </span>
                            <span className={cn("flex items-center gap-1.5", metricSectionLabelClass)}>
                              <span className="h-2 w-2 rounded-sm bg-violet-500 shrink-0" />
                              Custom
                              <strong className="font-display text-foreground tabular-nums">
                                {breakdowns?.applications.customContracts ?? 0}
                              </strong>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col flex-1 gap-3 min-h-0">
                      <BreakdownRow
                        stretch
                        label="Confirmed"
                        value={breakdowns?.applications.byStatus.confirmed ?? 0}
                        total={breakdowns?.applications.total ?? 0}
                        accentClass="bg-emerald-500"
                      />
                      <BreakdownRow
                        stretch
                        label="Awaiting Deposit"
                        value={breakdowns?.applications.byStatus.awaiting_deposit ?? 0}
                        total={breakdowns?.applications.total ?? 0}
                        accentClass="bg-amber-500"
                      />
                      <BreakdownRow
                        stretch
                        label="Awaiting Signature"
                        value={breakdowns?.applications.byStatus.awaiting_signature ?? 0}
                        total={breakdowns?.applications.total ?? 0}
                        accentClass="bg-blue-500"
                      />
                      {otherStatusEntries.length > 0 ? (
                        otherStatusEntries.map(([status, count]) => (
                          <BreakdownRow
                            stretch
                            key={status}
                            label={status.replace(/_/g, " ")}
                            value={count}
                            total={breakdowns?.applications.total ?? 0}
                            accentClass="bg-muted-foreground/50"
                          />
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground pt-1">No other statuses in scope</p>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </section>
        </>
        </TooltipProvider>
      )}
    </AdminLayout>
  );
};

export default Dashboard;

