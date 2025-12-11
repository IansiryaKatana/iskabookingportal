import PartnerLayout from "@/components/partner/PartnerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePartnerDashboardStats, usePartnerReferrals } from "@/hooks/usePartner";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, DollarSign, CheckCircle2, Clock, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const PartnerDashboard = () => {
  const { data: stats, isLoading: loadingStats } = usePartnerDashboardStats();
  const { data: referrals, isLoading: loadingReferrals } = usePartnerReferrals();

  const formatCurrencyValue = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "£0.00";
    return formatCurrency(value);
  };

  return (
    <PartnerLayout title="Dashboard" subtitle="Overview of your referrals and commissions">
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide">
                Total Referrals
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">{stats?.total_referrals || 0}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">All referred students</p>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide">
                Confirmed Applications
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">{stats?.confirmed_applications || 0}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Successfully confirmed</p>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide">
                Total Commission
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold">
                  {formatCurrencyValue(stats?.total_commission)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">All commissions earned</p>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide">
                Pending Commission
              </CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold">
                  {formatCurrencyValue(stats?.pending_commission)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Awaiting payment</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Referrals */}
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-xl font-display uppercase tracking-wide">
              Recent Referrals
            </CardTitle>
            <CardDescription>Your most recent student referrals</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingReferrals ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-2xl" />
                ))}
              </div>
            ) : referrals && referrals.length > 0 ? (
              <div className="space-y-4">
                {referrals.slice(0, 5).map((referral) => (
                  <Card key={referral.application_id} className="rounded-2xl">
                    <CardContent className="p-4">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">
                            {referral.student_first_name} {referral.student_last_name}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {referral.contract_name} • {referral.academic_year_name}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-sm">
                            <span className="text-muted-foreground">
                              Contract Value: <span className="font-semibold">{formatCurrencyValue(referral.total_contract_value)}</span>
                            </span>
                            <span className="text-muted-foreground">
                              Commission: <span className="font-semibold text-primary">{formatCurrencyValue(referral.commission_amount)}</span>
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span
                            className={`text-xs px-3 py-1 rounded-full ${
                              referral.payment_status === "fully_paid"
                                ? "bg-green-600 text-white"
                                : referral.payment_status === "partially_paid"
                                  ? "bg-amber-500 text-white"
                                  : "bg-gray-500 text-white"
                            }`}
                          >
                            {referral.payment_status === "fully_paid"
                              ? "Fully Paid"
                              : referral.payment_status === "partially_paid"
                                ? "Partially Paid"
                                : "Unpaid"}
                          </span>
                          <span
                            className={`text-xs px-3 py-1 rounded-full ${
                              referral.commission_status === "paid"
                                ? "bg-green-600 text-white"
                                : referral.commission_status === "approved"
                                  ? "bg-blue-500 text-white"
                                  : "bg-gray-500 text-white"
                            }`}
                          >
                            {referral.commission_status.charAt(0).toUpperCase() +
                              referral.commission_status.slice(1)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="rounded-3xl border-dashed">
                <CardHeader>
                  <CardTitle className="text-xl font-display uppercase tracking-wide">
                    No Referrals Yet
                  </CardTitle>
                  <CardDescription>
                    You haven't referred any students yet. Start referring students to earn commissions!
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </PartnerLayout>
  );
};

export default PartnerDashboard;

