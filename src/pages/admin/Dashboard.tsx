import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const quickLinks = [
  {
    title: "Studio Grades",
    description: "Manage grade content, galleries, and amenities.",
    actionLabel: "Go to grades",
  },
  {
    title: "Academic Years",
    description: "Configure pricing, contracts, and payment plans.",
    actionLabel: "Manage years",
  },
  {
    title: "Applications",
    description: "Review student submissions, documents, and signatures.",
    actionLabel: "View pipeline",
  },
];

const Dashboard = () => {
  const { loading, profile } = useAuth();
  
  // Only show skeleton while auth is actually loading
  // Once loading is false, show content (even if profile is null, it will show empty state)
  const isLoading = loading;

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
            <Card className="bg-primary text-primary-foreground rounded-3xl shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl font-display uppercase tracking-wide">
                  Occupancy Overview
                </CardTitle>
                <CardDescription className="text-primary-foreground/80">
                  Coming soon – view live occupancy by studio grade and academic
                  year.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold font-display tracking-tight">
                  0%
                </p>
                <p className="text-xs uppercase tracking-[0.3em] text-primary-foreground/80 mt-2">
                  Populate data to unlock insights
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-3xl shadow-md">
              <CardHeader>
                <CardTitle className="text-xl font-display uppercase tracking-wide">
                  Upcoming Instalments
                </CardTitle>
                <CardDescription>
                  Stripe integrations will surface invoices and due dates here.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                No instalments scheduled yet. Configure payment plans to see
                automatic reminders.
              </CardContent>
            </Card>
            <Card className="rounded-3xl shadow-md">
              <CardHeader>
                <CardTitle className="text-xl font-display uppercase tracking-wide">
                  Pending Verifications
                </CardTitle>
                <CardDescription>
                  Once students begin submissions, document checks appear in this
                  queue.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                No outstanding items. Keep an eye here to approve documents fast and
                keep allocations moving.
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
                    <Button variant="outline" className="w-full justify-between">
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

