import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  useAccountsReceivableReport,
  useRevenueSummary,
  useOutstandingBalancesReport,
  useDepositInstallmentBreakdown,
  useBankReconciliationReport,
} from "@/hooks/useAccountingReports";
import { Download, FileText, TrendingUp, AlertCircle, CreditCard, Receipt } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ReportType =
  | "accounts-receivable"
  | "revenue-summary"
  | "outstanding-balances"
  | "deposit-installment"
  | "bank-reconciliation";

const AccountingReports = () => {
  const { toast } = useToast();
  const [selectedReport, setSelectedReport] = useState<ReportType>("accounts-receivable");
  const [startDate, setStartDate] = useState<string>(
    format(new Date(new Date().getFullYear(), 0, 1), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [groupBy, setGroupBy] = useState<"month" | "quarter">("month");

  // Fetch data based on selected report
  const { data: arData, isLoading: arLoading } = useAccountsReceivableReport();
  const { data: revenueData, isLoading: revenueLoading } = useRevenueSummary(
    selectedReport === "revenue-summary" ? startDate : undefined,
    selectedReport === "revenue-summary" ? endDate : undefined,
    groupBy
  );
  const { data: outstandingData, isLoading: outstandingLoading } = useOutstandingBalancesReport();
  const { data: breakdownData, isLoading: breakdownLoading } = useDepositInstallmentBreakdown();
  const { data: bankData, isLoading: bankLoading } = useBankReconciliationReport(
    selectedReport === "bank-reconciliation" ? startDate : undefined,
    selectedReport === "bank-reconciliation" ? endDate : undefined
  );

  const formatCurrency = (amount: number | null) => {
    if (!amount && amount !== 0) return "—";
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const exportToCSV = () => {
    let headers: string[] = [];
    let rows: string[][] = [];
    let filename = "";

    switch (selectedReport) {
      case "accounts-receivable":
        if (!arData || arData.length === 0) {
          toast({
            title: "No data to export",
            description: "There is no accounts receivable data available.",
            variant: "destructive",
          });
          return;
        }
        headers = [
          "Application ID",
          "Student Name",
          "Status",
          "Contract",
          "Studio Grade",
          "Total Contract Value",
          "Cashback",
          "Adjusted Contract Value",
          "Total Due",
          "Total Paid",
          "Outstanding Balance",
          "Payment Status",
          "Studio Number",
          "Application Date",
          "Contract Start",
          "Contract End",
          "Academic Year",
        ];
        rows = arData.map((item) => [
          item.application_id,
          item.student_name,
          item.application_status,
          item.contract_name,
          item.studio_grade,
          item.total_contract_value?.toString() || "",
          item.cashback_amount.toString(),
          item.adjusted_contract_value.toString(),
          item.total_due.toString(),
          item.total_paid.toString(),
          item.outstanding_balance.toString(),
          item.payment_status,
          item.studio_number || "",
          format(new Date(item.application_date), "yyyy-MM-dd"),
          item.contract_start ? format(new Date(item.contract_start), "yyyy-MM-dd") : "",
          item.contract_end ? format(new Date(item.contract_end), "yyyy-MM-dd") : "",
          item.academic_year_name || "",
        ]);
        filename = `accounts_receivable_${format(new Date(), "yyyy-MM-dd")}.csv`;
        break;

      case "revenue-summary":
        if (!revenueData || revenueData.length === 0) {
          toast({
            title: "No data to export",
            description: "There is no revenue data available for the selected period.",
            variant: "destructive",
          });
          return;
        }
        headers = [
          "Period",
          "Period Start",
          "Period End",
          "Deposit Revenue",
          "Installment Revenue",
          "Total Revenue",
          "Payment Count",
          "Stripe Revenue",
          "Manual Revenue",
        ];
        rows = revenueData.map((item) => [
          item.period_label,
          format(new Date(item.period_start), "yyyy-MM-dd"),
          format(new Date(item.period_end), "yyyy-MM-dd"),
          item.deposit_revenue.toString(),
          item.installment_revenue.toString(),
          item.total_revenue.toString(),
          item.payment_count.toString(),
          item.stripe_revenue.toString(),
          item.manual_revenue.toString(),
        ]);
        filename = `revenue_summary_${format(new Date(), "yyyy-MM-dd")}.csv`;
        break;

      case "outstanding-balances":
        if (!outstandingData || outstandingData.length === 0) {
          toast({
            title: "No data to export",
            description: "There is no outstanding balance data available.",
            variant: "destructive",
          });
          return;
        }
        headers = [
          "Application ID",
          "Student Name",
          "Status",
          "Contract",
          "Studio Grade",
          "Total Due",
          "Total Paid",
          "Outstanding Balance",
          "Oldest Unpaid Due Date",
          "Days Overdue",
          "Application Date",
          "Contract Start",
          "Contract End",
        ];
        rows = outstandingData.map((item) => [
          item.application_id,
          item.student_name,
          item.application_status,
          item.contract_name,
          item.studio_grade,
          item.total_due.toString(),
          item.total_paid.toString(),
          item.outstanding_balance.toString(),
          item.oldest_unpaid_due_date ? format(new Date(item.oldest_unpaid_due_date), "yyyy-MM-dd") : "",
          item.days_overdue.toString(),
          format(new Date(item.application_date), "yyyy-MM-dd"),
          item.contract_start ? format(new Date(item.contract_start), "yyyy-MM-dd") : "",
          item.contract_end ? format(new Date(item.contract_end), "yyyy-MM-dd") : "",
        ]);
        filename = `outstanding_balances_${format(new Date(), "yyyy-MM-dd")}.csv`;
        break;

      case "deposit-installment":
        if (!breakdownData || breakdownData.length === 0) {
          toast({
            title: "No data to export",
            description: "There is no deposit/installment breakdown data available.",
            variant: "destructive",
          });
          return;
        }
        headers = [
          "Application ID",
          "Student Name",
          "Contract",
          "Studio Grade",
          "Total Contract Value",
          "Deposit Paid",
          "Expected Deposit",
          "Installments Paid",
          "Expected Installments",
          "Deposit Payment Count",
          "Installment Payment Count",
          "Status",
          "Application Date",
        ];
        rows = breakdownData.map((item) => [
          item.application_id,
          item.student_name,
          item.contract_name,
          item.studio_grade,
          item.total_contract_value?.toString() || "",
          item.deposit_paid.toString(),
          item.expected_deposit.toString(),
          item.installments_paid.toString(),
          item.expected_installments.toString(),
          item.deposit_payment_count.toString(),
          item.installment_payment_count.toString(),
          item.status,
          format(new Date(item.application_date), "yyyy-MM-dd"),
        ]);
        filename = `deposit_installment_breakdown_${format(new Date(), "yyyy-MM-dd")}.csv`;
        break;

      case "bank-reconciliation":
        if (!bankData || bankData.length === 0) {
          toast({
            title: "No data to export",
            description: "There is no bank reconciliation data available for the selected period.",
            variant: "destructive",
          });
          return;
        }
        headers = [
          "Payment ID",
          "Payment Source",
          "Student Name",
          "Amount",
          "Currency",
          "Payment Status",
          "Payment Date",
          "Payment Method",
          "Payment Type",
          "Stripe Payment Intent ID",
          "Manual Entry Notes",
          "Entered By",
          "Contract",
          "Studio Grade",
          "Invoice Number",
          "Invoice Generated At",
        ];
        rows = bankData.map((item) => [
          item.payment_id,
          item.payment_source,
          item.student_name,
          item.amount_paid.toString(),
          item.currency,
          item.payment_status,
          format(new Date(item.payment_date), "yyyy-MM-dd HH:mm:ss"),
          item.payment_method,
          item.payment_type,
          item.stripe_payment_intent_id || "",
          item.manual_entry_notes || "",
          item.entered_by_name || "",
          item.contract_name || "",
          item.studio_grade || "",
          item.invoice_number || "",
          item.invoice_generated_at ? format(new Date(item.invoice_generated_at), "yyyy-MM-dd HH:mm:ss") : "",
        ]);
        filename = `bank_reconciliation_${format(new Date(), "yyyy-MM-dd")}.csv`;
        break;
    }

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Report exported",
      description: `Successfully exported ${rows.length} records to CSV.`,
    });
  };

  const ReportSkeleton = () => (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="rounded-3xl">
          <CardContent className="p-6">
            <Skeleton className="h-6 w-full mb-2" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const getTotalOutstanding = () => {
    if (!arData) return 0;
    return arData.reduce((sum, item) => sum + item.outstanding_balance, 0);
  };

  const getTotalRevenue = () => {
    if (!revenueData) return 0;
    return revenueData.reduce((sum, item) => sum + item.total_revenue, 0);
  };

  return (
    <AdminLayout
      pageTitle="Accounting Reports"
      subtitle="Financial reports for accounting and reconciliation"
      mobileActionButton={
        <Button
          size="sm"
          variant="outline"
          className="rounded-full p-2 h-9 w-9 flex-shrink-0"
          onClick={exportToCSV}
        >
          <Download className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Report Type Selector */}
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-sm md:text-xl font-display font-bold uppercase tracking-wide">
              Select Report Type
            </CardTitle>
            <CardDescription className="text-xs md:text-base">Choose an accounting report to view and export</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedReport} onValueChange={(value) => setSelectedReport(value as ReportType)}>
              <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 mb-4 scrollbar-hide scroll-smooth">
                <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-5 h-auto gap-1 md:gap-0">
                  <TabsTrigger value="accounts-receivable" className="text-xs md:text-sm whitespace-nowrap flex-shrink-0 md:whitespace-normal">
                    <CreditCard className="h-4 w-4 mr-2" />
                    AR Report
                  </TabsTrigger>
                  <TabsTrigger value="revenue-summary" className="text-xs md:text-sm whitespace-nowrap flex-shrink-0 md:whitespace-normal">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Revenue
                  </TabsTrigger>
                  <TabsTrigger value="outstanding-balances" className="text-xs md:text-sm whitespace-nowrap flex-shrink-0 md:whitespace-normal">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    Outstanding
                  </TabsTrigger>
                  <TabsTrigger value="deposit-installment" className="text-xs md:text-sm whitespace-nowrap flex-shrink-0 md:whitespace-normal">
                    <Receipt className="h-4 w-4 mr-2" />
                    Breakdown
                  </TabsTrigger>
                  <TabsTrigger value="bank-reconciliation" className="text-xs md:text-sm whitespace-nowrap flex-shrink-0 md:whitespace-normal">
                    <FileText className="h-4 w-4 mr-2" />
                    Reconciliation
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Date Filters for Revenue Summary and Bank Reconciliation */}
              {(selectedReport === "revenue-summary" || selectedReport === "bank-reconciliation") && (
                <div className="grid gap-4 md:grid-cols-3 mt-4">
                  <div>
                    <Label htmlFor="start-date">Start Date</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="end-date">End Date</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  {selectedReport === "revenue-summary" && (
                    <div>
                      <Label htmlFor="group-by">Group By</Label>
                      <Select value={groupBy} onValueChange={(value) => setGroupBy(value as "month" | "quarter")}>
                        <SelectTrigger id="group-by" className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="month">Month</SelectItem>
                          <SelectItem value="quarter">Quarter</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </Tabs>
          </CardContent>
        </Card>

        {/* Report Results */}
        <Card className="rounded-3xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm md:text-xl font-display font-bold uppercase tracking-wide">
                  {selectedReport === "accounts-receivable" && "Accounts Receivable Report"}
                  {selectedReport === "revenue-summary" && "Revenue Summary Report"}
                  {selectedReport === "outstanding-balances" && "Outstanding Balances Report"}
                  {selectedReport === "deposit-installment" && "Deposit vs Installment Breakdown"}
                  {selectedReport === "bank-reconciliation" && "Bank Reconciliation Report"}
                </CardTitle>
                <CardDescription className="mt-1 text-xs md:text-sm">
                  {selectedReport === "accounts-receivable" &&
                    (arLoading
                      ? "Loading..."
                      : arData
                        ? `${arData.length} record${arData.length !== 1 ? "s" : ""} • Total Outstanding: ${formatCurrency(getTotalOutstanding())}`
                        : "No data available")}
                  {selectedReport === "revenue-summary" &&
                    (revenueLoading
                      ? "Loading..."
                      : revenueData
                        ? `${revenueData.length} period${revenueData.length !== 1 ? "s" : ""} • Total Revenue: ${formatCurrency(getTotalRevenue())}`
                        : "No data available")}
                  {selectedReport === "outstanding-balances" &&
                    (outstandingLoading
                      ? "Loading..."
                      : outstandingData
                        ? `${outstandingData.length} record${outstandingData.length !== 1 ? "s" : ""}`
                        : "No data available")}
                  {selectedReport === "deposit-installment" &&
                    (breakdownLoading
                      ? "Loading..."
                      : breakdownData
                        ? `${breakdownData.length} record${breakdownData.length !== 1 ? "s" : ""}`
                        : "No data available")}
                  {selectedReport === "bank-reconciliation" &&
                    (bankLoading
                      ? "Loading..."
                      : bankData
                        ? `${bankData.length} payment${bankData.length !== 1 ? "s" : ""}`
                        : "No data available")}
                </CardDescription>
              </div>
              <Button
                onClick={exportToCSV}
                className="rounded-full uppercase tracking-wide gap-2 hidden lg:flex"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Accounts Receivable Report */}
            {selectedReport === "accounts-receivable" &&
              (arLoading ? (
                <ReportSkeleton />
              ) : arData && arData.length > 0 ? (
                <div className="space-y-4">
                  {arData.map((item) => (
                    <Card key={item.application_id} className="rounded-2xl">
                      <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <h3 className="text-sm md:text-lg font-bold">{item.student_name}</h3>
                              <Badge variant="outline" className="uppercase text-xs">
                                {item.application_status}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs md:text-sm text-muted-foreground">
                              <div>
                                <span className="font-medium">Contract:</span> {item.contract_name}
                              </div>
                              <div>
                                <span className="font-medium">Studio Grade:</span> {item.studio_grade}
                              </div>
                              <div>
                                <span className="font-medium">Total Due:</span> {formatCurrency(item.total_due)}
                              </div>
                              <div>
                                <span className="font-medium">Total Paid:</span> {formatCurrency(item.total_paid)}
                              </div>
                            </div>
                            <div className="text-base md:text-lg font-bold text-destructive">
                              Outstanding Balance: {formatCurrency(item.outstanding_balance)}
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
                    <CardTitle>No Records Found</CardTitle>
                    <CardDescription>There are no accounts receivable records at the moment.</CardDescription>
                  </CardHeader>
                </Card>
              ))}

            {/* Revenue Summary Report */}
            {selectedReport === "revenue-summary" &&
              (revenueLoading ? (
                <ReportSkeleton />
              ) : revenueData && revenueData.length > 0 ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Period</th>
                          <th className="text-right py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Deposit Revenue</th>
                          <th className="text-right py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Installment Revenue</th>
                          <th className="text-right py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Total Revenue</th>
                          <th className="text-right py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Payments</th>
                          <th className="text-right py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Stripe</th>
                          <th className="text-right py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Manual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {revenueData.map((item, index) => (
                          <tr key={item.period_start} className={index % 2 === 0 ? "bg-muted/30" : ""}>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-medium">{item.period_label}</td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm text-right">{formatCurrency(item.deposit_revenue)}</td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm text-right">{formatCurrency(item.installment_revenue)}</td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm text-right font-semibold">{formatCurrency(item.total_revenue)}</td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm text-right">{item.payment_count}</td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm text-right">{formatCurrency(item.stripe_revenue)}</td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm text-right">{formatCurrency(item.manual_revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <Card className="rounded-3xl border-dashed">
                  <CardHeader>
                    <CardTitle>No Data Found</CardTitle>
                    <CardDescription>There is no revenue data for the selected period.</CardDescription>
                  </CardHeader>
                </Card>
              ))}

            {/* Outstanding Balances Report */}
            {selectedReport === "outstanding-balances" &&
              (outstandingLoading ? (
                <ReportSkeleton />
              ) : outstandingData && outstandingData.length > 0 ? (
                <div className="space-y-4">
                  {outstandingData.map((item) => (
                    <Card key={item.application_id} className="rounded-2xl">
                      <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <h3 className="text-sm md:text-lg font-bold">{item.student_name}</h3>
                              <Badge variant="outline" className="uppercase text-xs">
                                {item.application_status}
                              </Badge>
                              {item.days_overdue > 0 && (
                                <Badge variant="destructive" className="text-xs">
                                  {item.days_overdue} day{item.days_overdue !== 1 ? "s" : ""} overdue
                                </Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs md:text-sm text-muted-foreground">
                              <div>
                                <span className="font-medium">Contract:</span> {item.contract_name}
                              </div>
                              <div>
                                <span className="font-medium">Outstanding:</span>{" "}
                                <span className="font-bold text-destructive">
                                  {formatCurrency(item.outstanding_balance)}
                                </span>
                              </div>
                              {item.oldest_unpaid_due_date && (
                                <div>
                                  <span className="font-medium">Oldest Unpaid Due Date:</span>{" "}
                                  {format(new Date(item.oldest_unpaid_due_date), "MMM d, yyyy")}
                                </div>
                              )}
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
                    <CardTitle>No Records Found</CardTitle>
                    <CardDescription>There are no outstanding balances at the moment.</CardDescription>
                  </CardHeader>
                </Card>
              ))}

            {/* Deposit vs Installment Breakdown */}
            {selectedReport === "deposit-installment" &&
              (breakdownLoading ? (
                <ReportSkeleton />
              ) : breakdownData && breakdownData.length > 0 ? (
                <div className="space-y-4">
                  {breakdownData.map((item) => (
                    <Card key={item.application_id} className="rounded-2xl">
                      <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <h3 className="text-sm md:text-lg font-bold">{item.student_name}</h3>
                              <Badge variant="outline" className="uppercase text-xs">
                                {item.status}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs md:text-sm">
                              <div>
                                <span className="font-medium text-muted-foreground">Deposit Paid:</span>{" "}
                                <span className="font-bold">{formatCurrency(item.deposit_paid)}</span> /{" "}
                                {formatCurrency(item.expected_deposit)}
                              </div>
                              <div>
                                <span className="font-medium text-muted-foreground">Installments Paid:</span>{" "}
                                <span className="font-bold">{formatCurrency(item.installments_paid)}</span> /{" "}
                                {formatCurrency(item.expected_installments)}
                              </div>
                              <div>
                                <span className="font-medium text-muted-foreground">Total Contract Value:</span>{" "}
                                {formatCurrency(item.total_contract_value)}
                              </div>
                              <div>
                                <span className="font-medium text-muted-foreground">Payment Count:</span>{" "}
                                {item.deposit_payment_count} deposit{item.deposit_payment_count !== 1 ? "s" : ""},{" "}
                                {item.installment_payment_count} installment
                                {item.installment_payment_count !== 1 ? "s" : ""}
                              </div>
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
                    <CardTitle>No Records Found</CardTitle>
                    <CardDescription>There is no deposit/installment breakdown data available.</CardDescription>
                  </CardHeader>
                </Card>
              ))}

            {/* Bank Reconciliation Report */}
            {selectedReport === "bank-reconciliation" &&
              (bankLoading ? (
                <ReportSkeleton />
              ) : bankData && bankData.length > 0 ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Date</th>
                          <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Student</th>
                          <th className="text-right py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Amount</th>
                          <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Method</th>
                          <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Type</th>
                          <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Invoice #</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bankData.map((item, index) => (
                          <tr key={item.payment_id} className={index % 2 === 0 ? "bg-muted/30" : ""}>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm">
                              {format(new Date(item.payment_date), "MMM d, yyyy")}
                            </td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-medium">{item.student_name || "—"}</td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm text-right font-semibold">{formatCurrency(item.amount_paid)}</td>
                            <td className="py-2 md:py-3 px-2 md:px-4">
                              <Badge variant="outline" className="text-xs">{item.payment_method}</Badge>
                            </td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm">{item.payment_type}</td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm">{item.invoice_number || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <Card className="rounded-3xl border-dashed">
                  <CardHeader>
                    <CardTitle>No Records Found</CardTitle>
                    <CardDescription>There is no bank reconciliation data for the selected period.</CardDescription>
                  </CardHeader>
                </Card>
              ))}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AccountingReports;

