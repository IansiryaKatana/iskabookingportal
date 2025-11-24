import PartnerLayout from "@/components/partner/PartnerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePartnerReferrals } from "@/hooks/usePartner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Users, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

const PartnerReferrals = () => {
  const { data: referrals, isLoading } = usePartnerReferrals();

  const exportToCSV = () => {
    if (!referrals || referrals.length === 0) return;

    const headers = [
      "Full Name",
      "Application ID",
      "Contract",
      "Academic Year",
      "Contract Value",
      "Total Paid",
      "Remaining Balance",
      "Payment Status",
      "Commission Amount",
      "Commission Status",
      "Last Payment Date",
    ];

    const rows = referrals.map((r) => [
      `${r.student_first_name} ${r.student_last_name}`,
      r.application_id,
      r.contract_name,
      r.academic_year_name,
      formatCurrency(Number(r.total_contract_value)),
      formatCurrency(Number(r.total_paid)),
      formatCurrency(Number(r.remaining_balance)),
      r.payment_status,
      formatCurrency(Number(r.commission_amount)),
      r.commission_status,
      r.last_payment_date ? format(new Date(r.last_payment_date), "yyyy-MM-dd") : "N/A",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `partner-referrals-${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case "fully_paid":
        return <Badge className="bg-green-600 text-white">Fully Paid</Badge>;
      case "partially_paid":
        return <Badge className="bg-amber-500 text-white">Partially Paid</Badge>;
      default:
        return <Badge className="bg-gray-500 text-white">Unpaid</Badge>;
    }
  };

  const getCommissionStatusBadge = (status: string) => {
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
    <PartnerLayout 
      title="My Referrals" 
      subtitle="Track all students you've referred and their payment status"
      actionButton={
        referrals && referrals.length > 0 ? (
          <Button
            onClick={exportToCSV}
            size="sm"
            className="rounded-full uppercase tracking-wide gap-2 bg-red-600 hover:bg-red-700 text-white"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <div className="hidden md:flex md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-display uppercase tracking-wide">My Referrals</h2>
            <p className="text-muted-foreground text-sm mt-1">
              View all students you've referred and track their payment status
            </p>
          </div>
          {referrals && referrals.length > 0 && (
            <Button
              onClick={exportToCSV}
              className="rounded-full uppercase tracking-wide gap-2 bg-red-600 hover:bg-red-700 text-white"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-2xl" />
            ))}
          </div>
        ) : referrals && referrals.length > 0 ? (
          <div className="space-y-4">
            {referrals.map((referral) => (
              <Card key={referral.application_id} className="rounded-2xl">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <div>
                        <div className="flex flex-col md:flex-row md:items-center md:gap-4 gap-2 mb-2">
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Full Name</p>
                            <h3 className="text-lg font-semibold">
                              {referral.student_first_name || referral.student_last_name
                                ? `${referral.student_first_name || ''} ${referral.student_last_name || ''}`.trim()
                                : 'Name not available'}
                            </h3>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Application ID</p>
                            <p className="text-sm font-mono font-medium text-primary">
                              {referral.application_id}
                            </p>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {referral.contract_name} • {referral.academic_year_name}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Contract Value:</span>
                          <p className="font-semibold">{formatCurrency(Number(referral.total_contract_value))}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Total Paid:</span>
                          <p className="font-semibold text-green-600">
                            {formatCurrency(Number(referral.total_paid))}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Remaining:</span>
                          <p className="font-semibold">
                            {formatCurrency(Number(referral.remaining_balance))}
                          </p>
                        </div>
                      </div>
                      {referral.last_payment_date && (
                        <p className="text-xs text-muted-foreground">
                          Last payment: {format(new Date(referral.last_payment_date), "dd MMM yyyy")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <div className="flex flex-col items-end gap-2">
                        {getPaymentStatusBadge(referral.payment_status)}
                        {getCommissionStatusBadge(referral.commission_status)}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Commission</p>
                        <p className="text-lg font-bold text-primary">
                          {formatCurrency(Number(referral.commission_amount))}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="rounded-3xl border-dashed">
            <CardHeader>
              <CardTitle className="text-xl font-display uppercase tracking-wide flex items-center gap-2">
                <Users className="h-5 w-5" />
                No Referrals Yet
              </CardTitle>
              <CardDescription>
                You haven't referred any students yet. Start referring students to earn commissions!
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </PartnerLayout>
  );
};

export default PartnerReferrals;

