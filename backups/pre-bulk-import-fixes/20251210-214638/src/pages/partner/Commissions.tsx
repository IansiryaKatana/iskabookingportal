import PartnerLayout from "@/components/partner/PartnerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePartnerReferrals } from "@/hooks/usePartner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { DollarSign, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

const PartnerCommissions = () => {
  const { data: referrals, isLoading } = usePartnerReferrals();

  const totalCommission = referrals?.reduce(
    (sum, r) => sum + Number(r.commission_amount),
    0,
  ) || 0;
  const paidCommission = referrals
    ?.filter((r) => r.commission_status === "paid")
    .reduce((sum, r) => sum + Number(r.commission_amount), 0) || 0;
  const pendingCommission = referrals
    ?.filter((r) => r.commission_status !== "paid")
    .reduce((sum, r) => sum + Number(r.commission_amount), 0) || 0;

  const exportToCSV = () => {
    if (!referrals || referrals.length === 0) return;

    const headers = [
      "Student Name",
      "Contract",
      "Academic Year",
      "Commission Amount",
      "Status",
      "Paid Date",
    ];

    const rows = referrals.map((r) => [
      `${r.student_first_name} ${r.student_last_name}`,
      r.contract_name,
      r.academic_year_name,
      formatCurrency(Number(r.commission_amount)),
      r.commission_status,
      r.commission_status === "paid" && r.last_payment_date
        ? format(new Date(r.last_payment_date), "yyyy-MM-dd")
        : "N/A",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `partner-commissions-${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-600 text-white">Paid</Badge>;
      case "approved":
        return <Badge className="bg-blue-500 text-white">Approved</Badge>;
      case "pending":
        return <Badge className="bg-gray-500 text-white">Pending</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <PartnerLayout title="Commissions" subtitle="Track your commission earnings and payment status">
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide">
                Total Commission
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold">{formatCurrency(totalCommission)}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">All commissions earned</p>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide">
                Paid Commission
              </CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(paidCommission)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Successfully paid out</p>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide">
                Pending Commission
              </CardTitle>
              <DollarSign className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold text-amber-500">
                  {formatCurrency(pendingCommission)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Awaiting payment</p>
            </CardContent>
          </Card>
        </div>

        {/* Commission List */}
        <Card className="rounded-3xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-display uppercase tracking-wide">
                  Commission History
                </CardTitle>
                <CardDescription>All your commission records</CardDescription>
              </div>
              {referrals && referrals.length > 0 && (
                <Button
                  onClick={exportToCSV}
                  className="rounded-full uppercase tracking-wide gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-2xl" />
                ))}
              </div>
            ) : referrals && referrals.length > 0 ? (
              <div className="space-y-4">
                {referrals.map((referral) => (
                  <Card key={referral.application_id} className="rounded-2xl">
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold">
                            {referral.student_first_name} {referral.student_last_name}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {referral.contract_name} • {referral.academic_year_name}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Commission</p>
                            <p className="text-xl font-bold text-primary">
                              {formatCurrency(Number(referral.commission_amount))}
                            </p>
                          </div>
                          {getStatusBadge(referral.commission_status)}
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
                    No Commissions Yet
                  </CardTitle>
                  <CardDescription>
                    You haven't earned any commissions yet. Start referring students to earn commissions!
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

export default PartnerCommissions;

