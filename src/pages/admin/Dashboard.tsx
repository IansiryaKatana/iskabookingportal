import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Calendar, CheckCircle2, Users, FileText, TrendingUp, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const quickLinks = [
  {
    title: "Studio Grades",
    description: "Manage grade content, galleries, and amenities.",
    actionLabel: "Go to grades",
    path: "/admin/studio-grades",
  },
  {
    title: "Academic Years",
    description: "Configure pricing, contracts, and payment plans.",
    actionLabel: "Manage years",
    path: "/admin/academic-years",
  },
  {
    title: "Applications",
    description: "Review student submissions, documents, and signatures.",
    actionLabel: "View pipeline",
    path: "/admin/applications",
  },
];

const Dashboard = () => {
  const { loading, profile } = useAuth();
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  
  // Only show skeleton while auth is actually loading
  // Once loading is false, show content (even if profile is null, it will show empty state)
  const isLoading = loading || statsLoading;

  return (
    <AdminLayout
      pageTitle="Overview"
      subtitle="Monitor performance and jump into the modules you need."
    >
      {isLoading ? (
        <>
          <section className="grid gap-6 lg:grid-cols-3 mb-10">
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
            {/* Upcoming Instalments Skeleton */}
            <Card className="rounded-3xl shadow-md">
              <CardHeader>
                <div className="h-6 w-40 bg-muted animate-pulse rounded" />
                <div className="h-4 w-full bg-muted animate-pulse rounded mt-2" />
                <div className="h-4 w-2/3 bg-muted animate-pulse rounded mt-1" />
              </CardHeader>
              <CardContent>
                <div className="h-4 w-full bg-muted animate-pulse rounded" />
                <div className="h-4 w-5/6 bg-muted animate-pulse rounded mt-2" />
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
            <div className="grid gap-4 md:grid-cols-3">
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
          <section className="grid gap-6 lg:grid-cols-3 mb-10">
            <Card className="bg-primary text-primary-foreground rounded-3xl shadow-lg border border-border/60">
              <CardHeader>
                <CardTitle className="text-xl font-display uppercase tracking-wide">
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
                <p className="text-4xl font-bold font-display tracking-tight">
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
            <Card className="rounded-3xl shadow-md border border-border/60">
              <CardHeader>
                <CardTitle className="text-xl font-display uppercase tracking-wide flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Upcoming Instalments
                </CardTitle>
                <CardDescription>
                  {stats?.upcomingInstalments.count ? (
                    <>
                      {stats.upcomingInstalments.count} instalment{stats.upcomingInstalments.count !== 1 ? "s" : ""} due in next 30 days
                    </>
                  ) : (
                    "Payment schedules will appear here when configured"
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stats?.upcomingInstalments.count ? (
                  <div className="space-y-2">
                    <p className="text-2xl font-bold font-display">
                      {formatCurrency(stats.upcomingInstalments.totalAmount)}
                    </p>
                    {stats.upcomingInstalments.nextDueDate && (
                      <p className="text-sm text-muted-foreground">
                        Next due: {format(new Date(stats.upcomingInstalments.nextDueDate), "MMM dd, yyyy")}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No instalments scheduled yet. Configure payment plans to see automatic reminders.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="rounded-3xl shadow-md border border-border/60">
              <CardHeader>
                <CardTitle className="text-xl font-display uppercase tracking-wide flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
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

          <section>
            <h3 className="text-lg font-semibold uppercase tracking-wide mb-4">
              Quick actions
            </h3>
            <div className="grid gap-4 md:grid-cols-3">
              {quickLinks.map((item) => (
                <Card key={item.title} className="rounded-3xl shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold">
                      {item.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {item.description}
                    </p>
                    <Button
                      variant="outline"
                      className="w-full justify-between rounded-full uppercase tracking-wide"
                      onClick={() => navigate(item.path)}
                    >
                      {item.actionLabel}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </>
      )}
    </AdminLayout>
  );
};

export default Dashboard;

