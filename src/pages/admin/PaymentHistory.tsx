import { useState } from "react";
import { useAllPayments } from "@/hooks/useUnifiedPayments";
import { useAdminContracts } from "@/hooks/useAdminContracts";
import { useAdminAcademicYears } from "@/hooks/useAdminAcademicYears";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Calendar, Filter } from "lucide-react";
import { format } from "date-fns";

const PaymentHistory = () => {
  const [selectedContract, setSelectedContract] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const { data: contracts } = useAdminContracts();
  const { data: academicYears } = useAdminAcademicYears();

  const filters = {
    contractId: selectedContract !== "all" ? selectedContract : undefined,
    academicYearId: selectedYear !== "all" ? selectedYear : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  };

  const { data: payments, isLoading } = useAllPayments(filters);

  const exportToCSV = () => {
    if (!payments || payments.length === 0) return;

    const headers = [
      "Payment Date",
      "Student ID",
      "Application ID",
      "Contract",
      "Academic Year",
      "Amount",
      "Currency",
      "Source",
      "Status",
      "Installment #",
      "Due Date",
      "Notes",
    ];

    const rows = payments.map((payment) => [
      format(new Date(payment.payment_date), "yyyy-MM-dd HH:mm:ss"),
      payment.student_id,
      payment.student_application_id,
      payment.contract_name || "N/A",
      payment.academic_year_name || "N/A",
      payment.amount_paid.toFixed(2),
      payment.currency,
      payment.payment_source === "stripe" ? "Stripe" : "Manual",
      payment.payment_status,
      payment.installment_number?.toString() || "N/A",
      payment.due_date ? format(new Date(payment.due_date), "yyyy-MM-dd") : "N/A",
      payment.manual_entry_notes || "N/A",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `payment-history-${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalAmount = payments?.reduce((sum, p) => sum + p.amount_paid, 0) || 0;
  const stripeCount = payments?.filter((p) => p.payment_source === "stripe").length || 0;
  const manualCount = payments?.filter((p) => p.payment_source === "manual").length || 0;

  return (
    <AdminLayout
      pageTitle="Payment History"
      subtitle="View all payment records (Stripe and manual entries)"
      mobileActionButton={
        <Button
          size="sm"
          variant="outline"
          className="rounded-full p-2 h-9 w-9 flex-shrink-0"
          onClick={exportToCSV}
          disabled={!payments || payments.length === 0}
        >
          <Download className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="hidden lg:flex items-center justify-end">
          <Button
            onClick={exportToCSV}
            disabled={!payments || payments.length === 0}
            className="rounded-full uppercase tracking-wide gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Payments</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">£{totalAmount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {payments?.length || 0} payment{payments?.length !== 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Stripe Payments</CardTitle>
              <Badge variant="outline">Stripe</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stripeCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stripeCount > 0 ? `£${payments?.filter((p) => p.payment_source === "stripe").reduce((sum, p) => sum + p.amount_paid, 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}` : "No payments"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Manual Entries</CardTitle>
              <Badge variant="outline">Manual</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{manualCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {manualCount > 0 ? `£${payments?.filter((p) => p.payment_source === "manual").reduce((sum, p) => sum + p.amount_paid, 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}` : "No entries"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display uppercase tracking-wide flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="contract">Contract</Label>
                <Select value={selectedContract} onValueChange={setSelectedContract}>
                  <SelectTrigger id="contract">
                    <SelectValue placeholder="All Contracts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Contracts</SelectItem>
                    {contracts?.map((contract) => (
                      <SelectItem key={contract.id} value={contract.id}>
                        {contract.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="year">Academic Year</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger id="year">
                    <SelectValue placeholder="All Years" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Years</SelectItem>
                    {academicYears?.map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display uppercase tracking-wide">Payment Records</CardTitle>
            <CardDescription>
              All payment transactions sorted by date (newest first)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : !payments || payments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No payments found matching your filters.
              </div>
            ) : (
              <div className="space-y-4">
                {payments.map((payment) => (
                  <div
                    key={`${payment.payment_source}-${payment.payment_id}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-lg"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={payment.payment_source === "stripe" ? "default" : "secondary"}>
                          {payment.payment_source === "stripe" ? "Stripe" : "Manual"}
                        </Badge>
                        <span className="text-sm font-medium">
                          £{payment.amount_paid.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(payment.payment_date), "MMM dd, yyyy HH:mm")}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <span>{payment.contract_name}</span>
                        {payment.installment_number && (
                          <span className="ml-2">• Installment #{payment.installment_number}</span>
                        )}
                      </div>
                      {payment.manual_entry_notes && (
                        <p className="text-xs text-muted-foreground italic">{payment.manual_entry_notes}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <Badge variant="outline">{payment.payment_status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default PaymentHistory;

