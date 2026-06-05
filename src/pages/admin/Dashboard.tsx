import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Users, FileText, TrendingUp, AlertCircle, Gift, CreditCard } from "lucide-react";
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
  // Only show skeleton while auth is loading or dashboard queries are in flight
  const isLoading = !authReady || statsLoading;
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
      pageTitle="Overview"
      subtitle="Monitor performance and jump into the modules you need."
    >
      <div className="mb-6 flex items-center justify-start md:justify-end">
        <AcademicYearSelector
          value={selectedAcademicYearId}
          onValueChange={(value) => setSelectedAcademicYearId(value)}
          className="w-full md:w-64"
          allowEmpty={false}
        />
      </div>
      {isLoading ? (
        <>
          <section className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4 mb-10">
            {/* Occupancy Overview Skeleton */}
            <Card className="bg-primary text-primary-foreground rounded-3xl shadow-lg">
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
            <Card className="rounded-3xl shadow-md bg-yellow-50 dark:bg-yellow-950/20">
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
            {/* Pending Verifications Skeleton */}
            <Card className="rounded-3xl shadow-md">
              <CardHeader>
                <div className="h-6 w-44 bg-muted animate-pulse rounded" />
                <div className="h-4 w-full bg-muted animate-pulse rounded mt-2" />
                <div className="h-4 w-3/4 bg-muted animate-pulse rounded mt-1" />
              </CardHeader>
              <CardContent>
                <div className="h-4 w-full bg-muted animate-pulse rounded" />
                <div className="h-4 w-4/5 bg-muted animate-pulse rounded mt-2" />
              </CardContent>
            </Card>
          </section>

          <section>
            <div className="h-6 w-32 bg-muted animate-pulse rounded mb-4" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="rounded-3xl shadow-sm">
                  <CardHeader>
                    <div className="h-5 w-32 bg-muted animate-pulse rounded" />
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="h-4 w-full bg-muted animate-pulse rounded" />
                    <div className="h-4 w-5/6 bg-muted animate-pulse rounded" />
                    <div className="h-10 w-full bg-muted animate-pulse rounded-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4 mb-10">
            <Card className="bg-primary text-primary-foreground rounded-3xl shadow-lg border border-border/60">
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
              <CardContent>
                <p className="text-2xl md:text-4xl font-bold font-display tracking-tight">
                  {stats?.occupancy.percentage ?? 0}%
                </p>
                <p className="text-xs uppercase tracking-[0.3em] text-primary-foreground/80 mt-2">
                  {stats?.occupancy.total ? (
                    `${stats.occupancy.occupied} occupied / ${stats.occupancy.total} total`
                  ) : (
                    "Populate data to unlock insights"
                  )}
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-3xl shadow-md border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/20">
              <CardHeader>
                <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide flex items-center gap-2">
                  <Gift className="h-4 w-4 md:h-5 md:w-5 text-yellow-600 dark:text-yellow-400" />
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
              <CardContent>
                {campaignsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                ) : activeCampaigns && activeCampaigns.length > 0 ? (
                  <div className="space-y-3">
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
                              <div className="mt-1 w-20 h-1.5 bg-yellow-200 dark:bg-yellow-900/50 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-yellow-500 dark:bg-yellow-400 rounded-full transition-all"
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
                        variant="ghost"
                        size="sm"
                        className="w-full text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
                        onClick={() => navigate("/admin/cashback-campaigns")}
                      >
                        View all {activeCampaigns.length} campaigns
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
                      className="rounded-full uppercase tracking-wide border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
                      onClick={() => navigate("/admin/cashback-campaigns")}
                    >
                      Create Campaign
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="rounded-3xl shadow-md border border-border/60">
              <CardHeader>
                <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 md:h-5 md:w-5" />
                  Pending Verifications
                </CardTitle>
                <CardDescription>
                  {stats?.pendingVerifications ? (
                    <>
                      {stats.pendingVerifications} document{stats.pendingVerifications !== 1 ? "s" : ""} awaiting review
                    </>
                  ) : (
                    "Document checks appear in this queue"
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stats?.pendingVerifications ? (
                  <div className="space-y-2">
                    <p className="text-2xl font-bold font-display">
                      {stats.pendingVerifications}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full uppercase tracking-wide"
                      onClick={() => navigate("/admin/applications")}
                    >
                      Review Documents
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No outstanding items. Keep an eye here to approve documents fast and keep allocations moving.
                  </p>
                )}
              </CardContent>
            </Card>
            {showPaymentRequestQueue && (
              <Card className="rounded-3xl shadow-md border border-border/60">
                <CardHeader>
                  <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide flex items-center gap-2">
                    <CreditCard className="h-4 w-4 md:h-5 md:w-5" />
                    Payment Approvals
                  </CardTitle>
                  <CardDescription>
                    {pendingPaymentRequestsLoading
                      ? "Loading payment requests..."
                      : pendingPaymentRequests > 0
                        ? `${pendingPaymentRequests} student payment request${pendingPaymentRequests !== 1 ? "s" : ""} awaiting approval`
                        : "Student bank transfer requests appear here"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {pendingPaymentRequestsLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-8 w-12" />
                      <Skeleton className="h-9 w-36" />
                    </div>
                  ) : pendingPaymentRequests > 0 ? (
                    <div className="space-y-2">
                      <p className="text-2xl font-bold font-display">{pendingPaymentRequests}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full uppercase tracking-wide"
                        onClick={() => navigate("/admin/manual-payment-entry")}
                      >
                        Review Requests
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No pending student payment requests right now.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </section>

          {/* Statistics Grid */}
          <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-10">
            <Card className="rounded-3xl border border-border/60 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-display uppercase tracking-wide">
                  Total Students
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display">{stats?.totalStudents ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Registered students
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-3xl border border-border/60 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-display uppercase tracking-wide">
                  Total Applications
                </CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display">{stats?.totalApplications ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.confirmedApplications ? `${stats.confirmedApplications} confirmed` : "All applications"}
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-3xl border border-border/60 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-display uppercase tracking-wide">
                  Total Revenue
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display">
                  {formatCurrency(stats?.totalRevenue ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  From completed payments
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-3xl border border-border/60 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-display uppercase tracking-wide">
                  Recent Applications
                </CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display">{stats?.recentApplications ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Last 7 days
                </p>
              </CardContent>
            </Card>
          </section>

          <section className="mb-10">
            <h3 className="text-lg font-semibold uppercase tracking-wide mb-4">
              Students Breakdown
            </h3>
            {breakdownsLoading ? (
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Card key={i} className="rounded-3xl border border-border/60 shadow-sm">
                    <CardContent className="p-4">
                      <Skeleton className="h-4 w-24 mb-3" />
                      <Skeleton className="h-8 w-12" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-5">
                <Card className="rounded-3xl border border-border/60 shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Students</p>
                    <p className="text-2xl font-bold font-display mt-2">{breakdowns?.students.total ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">All registered student profiles</p>
                  </CardContent>
                </Card>
                <Card className="rounded-3xl border border-border/60 shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">With Applications</p>
                    <p className="text-2xl font-bold font-display mt-2">{breakdowns?.students.withApplication ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">Students who submitted at least one application</p>
                  </CardContent>
                </Card>
                <Card className="rounded-3xl border border-border/60 shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Confirmed Students</p>
                    <p className="text-2xl font-bold font-display mt-2">{breakdowns?.students.confirmed ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">Unique students with a confirmed booking</p>
                  </CardContent>
                </Card>
                <Card className="rounded-3xl border border-border/60 shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">In Pipeline</p>
                    <p className="text-2xl font-bold font-display mt-2">{breakdowns?.students.inPipeline ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">Awaiting signature or awaiting deposit</p>
                  </CardContent>
                </Card>
                <Card className="rounded-3xl border border-border/60 shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Without Applications</p>
                    <p className="text-2xl font-bold font-display mt-2">{breakdowns?.students.withoutApplication ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">Registered students with no application yet</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </section>

          <section>
            <h3 className="text-lg font-semibold uppercase tracking-wide mb-4">
              Applications Breakdown
            </h3>
            {breakdownsLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Card key={i} className="rounded-3xl border border-border/60 shadow-sm">
                    <CardContent className="p-4">
                      <Skeleton className="h-4 w-24 mb-3" />
                      <Skeleton className="h-8 w-12" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <Card className="rounded-3xl border border-primary/20 bg-primary/5 shadow-sm">
                  <CardContent className="p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Contract Type Mix</p>
                      <p className="text-lg font-semibold mt-1">Applications by default vs custom contracts</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 w-full md:w-auto">
                      <div className="rounded-2xl border border-border/60 bg-background px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Default Contracts</p>
                        <p className="text-xl font-bold font-display">{breakdowns?.applications.defaultContracts ?? 0}</p>
                      </div>
                      <div className="rounded-2xl border border-border/60 bg-background px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Custom Contracts</p>
                        <p className="text-xl font-bold font-display">{breakdowns?.applications.customContracts ?? 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <Card className="rounded-3xl border border-border/60 shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Applications</p>
                    <p className="text-2xl font-bold font-display mt-2">{breakdowns?.applications.total ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">Every application row in current scope</p>
                  </CardContent>
                </Card>
                <Card className="rounded-3xl border border-border/60 shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Confirmed</p>
                    <p className="text-2xl font-bold font-display mt-2">{breakdowns?.applications.byStatus.confirmed ?? 0}</p>
                  </CardContent>
                </Card>
                <Card className="rounded-3xl border border-border/60 shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Awaiting Deposit</p>
                    <p className="text-2xl font-bold font-display mt-2">{breakdowns?.applications.byStatus.awaiting_deposit ?? 0}</p>
                  </CardContent>
                </Card>
                <Card className="rounded-3xl border border-border/60 shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Awaiting Signature</p>
                    <p className="text-2xl font-bold font-display mt-2">{breakdowns?.applications.byStatus.awaiting_signature ?? 0}</p>
                  </CardContent>
                </Card>
                <Card className="rounded-3xl border border-border/60 shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Other Statuses</p>
                    {otherStatusEntries.length > 0 ? (
                      <div className="mt-2 space-y-1.5">
                        {otherStatusEntries.map(([status, count]) => (
                          <div key={status} className="flex items-center justify-between text-sm">
                            <span className="capitalize text-muted-foreground">{status.replace(/_/g, " ")}</span>
                            <span className="font-bold font-display">{count}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-2">No additional statuses</p>
                    )}
                  </CardContent>
                </Card>
              </div>
              </div>
            )}
          </section>
        </>
      )}
    </AdminLayout>
  );
};

export default Dashboard;

