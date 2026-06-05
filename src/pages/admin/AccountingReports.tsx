import { useState, useMemo, useEffect } from "react";
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
  useUpcomingPaidInstallmentsReport,
  useFullyPaidStudentsReport,
  type UpcomingPaidInstallmentItem,
  type FullyPaidStudentItem,
} from "@/hooks/useAccountingReports";
import { useAdminAcademicYears } from "@/hooks/useAdminAcademicYears";
import { AcademicYearSelector } from "@/components/admin/AcademicYearSelector";
import { Download, FileText, TrendingUp, AlertCircle, CreditCard, Receipt, Calendar, Search, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

type ReportType =
  | "accounts-receivable"
  | "revenue-summary"
  | "outstanding-balances"
  | "deposit-installment"
  | "bank-reconciliation"
  | "upcoming-payments"
  | "paid-in-full";

const AccountingReports = () => {
  const { toast } = useToast();
  const [selectedReport, setSelectedReport] = useState<ReportType>("accounts-receivable");
  const [startDate, setStartDate] = useState<string>(
    format(new Date(new Date().getFullYear(), 0, 1), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [groupBy, setGroupBy] = useState<"month" | "quarter">("month");
  const [upcomingDueWindow, setUpcomingDueWindow] = useState<"7" | "14" | "30" | "all">("30");
  const [upcomingStatusFilter, setUpcomingStatusFilter] = useState<"all" | "upcoming" | "overdue" | "paid" | "partially_paid">("all");
  const [upcomingAcademicYearId, setUpcomingAcademicYearId] = useState<string>("all");

  const [arSearchQuery, setArSearchQuery] = useState("");
  const [arPage, setArPage] = useState(1);
  const [arAcademicYearId, setArAcademicYearId] = useState<string>("all");
  const [outstandingAcademicYearId, setOutstandingAcademicYearId] = useState<string>("all");
  const [breakdownAcademicYearId, setBreakdownAcademicYearId] = useState<string>("all");
  const AR_PER_PAGE = 10;
  const FULLY_PAID_PER_PAGE = 10;

  const [fullyPaidSearchQuery, setFullyPaidSearchQuery] = useState("");
  const [fullyPaidPage, setFullyPaidPage] = useState(1);
  const [fullyPaidAcademicYearId, setFullyPaidAcademicYearId] = useState<string>("all");

  // Fetch data based on selected report
  const { data: arData, isLoading: arLoading } = useAccountsReceivableReport();
  const { data: upcomingData, isLoading: upcomingLoading } = useUpcomingPaidInstallmentsReport();
  const { data: academicYears } = useAdminAcademicYears();
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
  const { data: fullyPaidData, isLoading: fullyPaidLoading } = useFullyPaidStudentsReport({
    academicYearId: selectedReport === "paid-in-full" && fullyPaidAcademicYearId !== "all" ? fullyPaidAcademicYearId : null,
    startDate: selectedReport === "paid-in-full" ? startDate : null,
    endDate: selectedReport === "paid-in-full" ? endDate : null,
    enabled: selectedReport === "paid-in-full",
  });

  const formatCurrency = (amount: number | null) => {
    if (!amount && amount !== 0) return "—";
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  /** Format a date string for display; returns "—" for null, undefined, empty, or invalid dates to avoid RangeError. */
  const formatDateSafe = (value: string | null | undefined, fmt: string) => {
    if (value == null || String(value).trim() === "") return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : format(d, fmt);
  };

  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const filteredArData = useMemo(() => {
    if (!arData) return [];
    let list = arData;
    if (arAcademicYearId && arAcademicYearId !== "all") {
      // Prefer ID match (stable). Fall back to name match for older report rows/views.
      const selectedYearName = academicYears?.find((ay) => ay.id === arAcademicYearId)?.name ?? null;
      list = list.filter((item) => {
        if (item.academic_year_id) return item.academic_year_id === arAcademicYearId;
        if (!selectedYearName) return true;
        return (item.academic_year_name ?? "").trim() === selectedYearName.trim();
      });
    }
    const q = arSearchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (item) =>
        (item.student_name && item.student_name.toLowerCase().includes(q)) ||
        (item.contract_name && item.contract_name.toLowerCase().includes(q)) ||
        (item.studio_grade && item.studio_grade.toLowerCase().includes(q)) ||
        (item.application_status && item.application_status.toLowerCase().includes(q)) ||
        (item.studio_number && item.studio_number.toLowerCase().includes(q)) ||
        (item.payment_status && item.payment_status.toLowerCase().includes(q)) ||
        (item.academic_year_name && item.academic_year_name.toLowerCase().includes(q))
    );
  }, [arData, arSearchQuery, arAcademicYearId, academicYears]);

  const arTotalPages = Math.max(1, Math.ceil(filteredArData.length / AR_PER_PAGE));
  const paginatedArData = useMemo(() => {
    const start = (arPage - 1) * AR_PER_PAGE;
    return filteredArData.slice(start, start + AR_PER_PAGE);
  }, [filteredArData, arPage]);

  useEffect(() => {
    setArPage(1);
  }, [arSearchQuery, arAcademicYearId]);

  useEffect(() => {
    setArPage((p) => Math.min(p, arTotalPages));
  }, [arTotalPages]);

  const filteredUpcomingData = useMemo(() => {
    if (!upcomingData) return [];
    let list = [...upcomingData];
    if (startDate) {
      list = list.filter((r) => r.due_date >= startDate);
    }
    if (endDate) {
      list = list.filter((r) => r.due_date <= endDate);
    }
    if (upcomingAcademicYearId !== "all") {
      list = list.filter((r) => r.academic_year_id === upcomingAcademicYearId);
    }
    if (upcomingDueWindow !== "all") {
      const days = parseInt(upcomingDueWindow, 10);
      const end = new Date();
      end.setDate(end.getDate() + days);
      const endStr = format(end, "yyyy-MM-dd");
      list = list.filter((r) => r.due_date >= today && r.due_date <= endStr);
    }
    if (upcomingStatusFilter !== "all") {
      list = list.filter((r) => r.status === upcomingStatusFilter);
    }
    return list.sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  }, [upcomingData, startDate, endDate, upcomingAcademicYearId, upcomingDueWindow, upcomingStatusFilter, today]);

  const filteredOutstandingData = useMemo(() => {
    if (!outstandingData) return [];
    if (!outstandingAcademicYearId || outstandingAcademicYearId === "all") return outstandingData;
    return outstandingData.filter((item) => item.academic_year_id === outstandingAcademicYearId);
  }, [outstandingData, outstandingAcademicYearId, academicYears]);

  const filteredBreakdownData = useMemo(() => {
    if (!breakdownData) return [];
    if (!breakdownAcademicYearId || breakdownAcademicYearId === "all") return breakdownData;
    return breakdownData.filter((item) => item.academic_year_id === breakdownAcademicYearId);
  }, [breakdownData, breakdownAcademicYearId, academicYears]);

  const filteredFullyPaidData = useMemo(() => {
    if (!fullyPaidData) return [];
    const q = fullyPaidSearchQuery.trim().toLowerCase();
    if (!q) return fullyPaidData;
    return fullyPaidData.filter((item) => {
      const fullName = `${item.first_name ?? ""} ${item.last_name ?? ""}`.trim().toLowerCase();
      return (
        (fullName && fullName.includes(q)) ||
        (item.email && item.email.toLowerCase().includes(q)) ||
        (item.contract_name && item.contract_name.toLowerCase().includes(q)) ||
        (item.studio_number && item.studio_number.toLowerCase().includes(q)) ||
        (item.studio_grade_name && item.studio_grade_name.toLowerCase().includes(q)) ||
        (item.academic_year_name && item.academic_year_name.toLowerCase().includes(q)) ||
        (item.application_id && item.application_id.toLowerCase().includes(q))
      );
    });
  }, [fullyPaidData, fullyPaidSearchQuery]);

  const fullyPaidTotalPages = Math.max(1, Math.ceil(filteredFullyPaidData.length / FULLY_PAID_PER_PAGE));
  const paginatedFullyPaidData = useMemo(() => {
    const start = (fullyPaidPage - 1) * FULLY_PAID_PER_PAGE;
    return filteredFullyPaidData.slice(start, start + FULLY_PAID_PER_PAGE);
  }, [filteredFullyPaidData, fullyPaidPage]);

  useEffect(() => {
    setFullyPaidPage(1);
  }, [fullyPaidSearchQuery, fullyPaidAcademicYearId, startDate, endDate, selectedReport]);

  useEffect(() => {
    setFullyPaidPage((p) => Math.min(p, fullyPaidTotalPages));
  }, [fullyPaidTotalPages]);

  const exportToCSV = () => {
    let headers: string[] = [];
    let rows: string[][] = [];
    let filename = "";

    switch (selectedReport) {
      case "accounts-receivable":
        if (!filteredArData.length) {
          toast({
            title: "No data to export",
            description: arSearchQuery.trim()
              ? "No accounts receivable records match your search."
              : "There is no accounts receivable data available.",
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
          "Discount",
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
          "Payment Plan",
        ];
        rows = filteredArData.map((item) => [
          item.application_id,
          item.student_name,
          item.application_status,
          item.contract_name,
          item.studio_grade,
          item.total_contract_value?.toString() || "",
          item.cashback_amount.toString(),
          (item as { discount_amount?: number }).discount_amount?.toString() ?? "0",
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
          item.payment_plan || "",
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
        if (!filteredOutstandingData.length) {
          toast({
            title: "No data to export",
            description: outstandingAcademicYearId !== "all"
              ? "No outstanding balance records for the selected academic year."
              : "There is no outstanding balance data available.",
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
          "Academic Year",
          "Total Due",
          "Total Paid",
          "Outstanding Balance",
          "Oldest Unpaid Due Date",
          "Days Overdue",
          "Application Date",
          "Contract Start",
          "Contract End",
          "Payment Plan",
        ];
        rows = filteredOutstandingData.map((item) => [
          item.application_id,
          item.student_name,
          item.application_status,
          item.contract_name,
          item.studio_grade,
          item.academic_year_name ?? "",
          item.total_due.toString(),
          item.total_paid.toString(),
          item.outstanding_balance.toString(),
          item.oldest_unpaid_due_date ? format(new Date(item.oldest_unpaid_due_date), "yyyy-MM-dd") : "",
          item.days_overdue.toString(),
          format(new Date(item.application_date), "yyyy-MM-dd"),
          item.contract_start ? format(new Date(item.contract_start), "yyyy-MM-dd") : "",
          item.contract_end ? format(new Date(item.contract_end), "yyyy-MM-dd") : "",
          item.payment_plan || "",
        ]);
        filename = `outstanding_balances_${format(new Date(), "yyyy-MM-dd")}.csv`;
        break;

      case "deposit-installment":
        if (!filteredBreakdownData.length) {
          toast({
            title: "No data to export",
            description: breakdownAcademicYearId !== "all"
              ? "No deposit/installment breakdown records for the selected academic year."
              : "There is no deposit/installment breakdown data available.",
            variant: "destructive",
          });
          return;
        }
        headers = [
          "Application ID",
          "Student Name",
          "Contract",
          "Studio Grade",
          "Academic Year",
          "Total Contract Value",
          "Deposit Paid",
          "Expected Deposit",
          "Installments Paid",
          "Expected Installments",
          "Deposit Payment Count",
          "Installment Payment Count",
          "Status",
          "Application Date",
          "Payment Plan",
        ];
        rows = filteredBreakdownData.map((item) => [
          item.application_id,
          item.student_name,
          item.contract_name,
          item.studio_grade,
          item.academic_year_name ?? "",
          item.total_contract_value?.toString() || "",
          item.deposit_paid.toString(),
          item.expected_deposit.toString(),
          item.installments_paid.toString(),
          item.expected_installments.toString(),
          item.deposit_payment_count.toString(),
          item.installment_payment_count.toString(),
          item.status,
          format(new Date(item.application_date), "yyyy-MM-dd"),
          item.payment_plan || "",
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
          "Payment Plan",
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
          item.payment_plan || "",
        ]);
        filename = `bank_reconciliation_${format(new Date(), "yyyy-MM-dd")}.csv`;
        break;

      case "upcoming-payments":
        if (!filteredUpcomingData || filteredUpcomingData.length === 0) {
          toast({
            title: "No data to export",
            description: "There is no upcoming/paid installments data for the selected filters.",
            variant: "destructive",
          });
          return;
        }
        headers = [
          "Student Name",
          "Studio",
          "Studio Grade",
          "Contract",
          "Academic Year",
          "Due Date",
          "Amount",
          "Amount Paid",
          "Amount Remaining",
          "Status",
          "Paid Date",
          "Installment Label",
          "Application ID",
          "Is Deposit",
          "Payment Plan",
        ];
        rows = filteredUpcomingData.map((item: UpcomingPaidInstallmentItem) => [
          item.student_name ?? "",
          item.studio_number ?? "",
          item.studio_grade ?? "",
          item.contract_name ?? "",
          item.academic_year_name ?? "",
          item.due_date ? format(new Date(item.due_date), "yyyy-MM-dd") : "",
          item.amount.toFixed(2),
          (item.amount_paid ?? 0).toFixed(2),
          (item.amount_remaining ?? 0).toFixed(2),
          item.status === "partially_paid" ? "Partially paid" : item.status,
          item.paid_date ? format(new Date(item.paid_date), "yyyy-MM-dd") : "",
          item.installment_label ?? "",
          item.application_id,
          item.is_deposit ? "Yes" : "No",
          item.payment_plan ?? "",
        ]);
        filename = `upcoming_payments_${format(new Date(), "yyyy-MM-dd")}.csv`;
        break;

      case "paid-in-full":
        if (!filteredFullyPaidData.length) {
          toast({
            title: "No data to export",
            description: fullyPaidSearchQuery.trim()
              ? "No paid-in-full applications match your search."
              : "There are no paid-in-full applications for the selected filters.",
            variant: "destructive",
          });
          return;
        }
        headers = [
          "Application ID",
          "Student Name",
          "Email",
          "Contract",
          "Academic Year",
          "Studio Number",
          "Studio Grade",
          "Total Due",
          "Total Paid",
          "Remaining Balance",
          "Payment Status",
          "Last Payment Date",
          "Application Status",
          "Application Created At",
          "Payment Plan",
        ];
        rows = filteredFullyPaidData.map((item: FullyPaidStudentItem) => [
          item.application_id,
          `${item.first_name ?? ""} ${item.last_name ?? ""}`.trim(),
          item.email ?? "",
          item.contract_name ?? "",
          item.academic_year_name ?? "",
          item.studio_number ?? "",
          item.studio_grade_name ?? "",
          String(item.total_due ?? ""),
          String(item.total_paid ?? ""),
          String(item.remaining_balance ?? ""),
          item.payment_status ?? "",
          item.last_payment_date ? format(new Date(item.last_payment_date), "yyyy-MM-dd") : "",
          item.application_status ?? "",
          item.application_created_at ? format(new Date(item.application_created_at), "yyyy-MM-dd HH:mm:ss") : "",
          item.payment_plan ?? "",
        ]);
        filename = `paid_in_full_${format(new Date(), "yyyy-MM-dd")}.csv`;
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

  const filteredArTotalOutstanding = useMemo(
    () => filteredArData.reduce((sum, item) => sum + item.outstanding_balance, 0),
    [filteredArData]
  );

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
                <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-7 h-auto gap-1 md:gap-0">
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
                  <TabsTrigger value="upcoming-payments" className="text-xs md:text-sm whitespace-nowrap flex-shrink-0 md:whitespace-normal">
                    <Calendar className="h-4 w-4 mr-2" />
                    Upcoming
                  </TabsTrigger>
                  <TabsTrigger value="paid-in-full" className="text-xs md:text-sm whitespace-nowrap flex-shrink-0 md:whitespace-normal">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Paid in Full
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Date Filters for Revenue Summary and Bank Reconciliation */}
              {(selectedReport === "revenue-summary" ||
                selectedReport === "bank-reconciliation" ||
                selectedReport === "upcoming-payments" ||
                selectedReport === "paid-in-full") && (
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
                  {selectedReport === "upcoming-payments" && (
                    <>
                      <div>
                        <Label htmlFor="academic-year">Academic year</Label>
                        <Select value={upcomingAcademicYearId} onValueChange={setUpcomingAcademicYearId}>
                          <SelectTrigger id="academic-year" className="mt-2">
                            <SelectValue placeholder="Academic year" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All academic years</SelectItem>
                            {(academicYears ?? []).map((ay) => (
                              <SelectItem key={ay.id} value={ay.id}>
                                {ay.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="due-window">Due within</Label>
                        <Select value={upcomingDueWindow} onValueChange={(v) => setUpcomingDueWindow(v as "7" | "14" | "30" | "all")}>
                          <SelectTrigger id="due-window" className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="7">Next 7 days</SelectItem>
                            <SelectItem value="14">Next 14 days</SelectItem>
                            <SelectItem value="30">Next 30 days</SelectItem>
                            <SelectItem value="all">All dates</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="status-filter">Status</Label>
                        <Select value={upcomingStatusFilter} onValueChange={(v) => setUpcomingStatusFilter(v as "all" | "upcoming" | "overdue" | "paid" | "partially_paid")}>
                          <SelectTrigger id="status-filter" className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="upcoming">Upcoming</SelectItem>
                            <SelectItem value="overdue">Overdue</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="partially_paid">Partially paid</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  {selectedReport === "paid-in-full" && (
                    <div>
                      <Label htmlFor="fully-paid-academic-year">Academic year</Label>
                      <Select value={fullyPaidAcademicYearId} onValueChange={setFullyPaidAcademicYearId}>
                        <SelectTrigger id="fully-paid-academic-year" className="mt-2">
                          <SelectValue placeholder="Academic year" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All academic years</SelectItem>
                          {(academicYears ?? []).map((ay) => (
                            <SelectItem key={ay.id} value={ay.id}>
                              {ay.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
              {selectedReport === "upcoming-payments" && (
                <p className="text-xs text-muted-foreground mt-2">
                  To see overdue installments (e.g. first installment already due), set <strong>Due within: All dates</strong> and <strong>Status: Overdue</strong>. Bulk-imported applications need schedule backfill (see docs) if nothing appears.
                </p>
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
                  {selectedReport === "upcoming-payments" && "Upcoming & Paid Installments"}
                  {selectedReport === "paid-in-full" && "Paid in Full Applications"}
                </CardTitle>
                <CardDescription className="mt-1 text-xs md:text-sm">
                  {selectedReport === "accounts-receivable" &&
                    (arLoading
                      ? "Loading..."
                      : arData
                        ? `${filteredArData.length} record${filteredArData.length !== 1 ? "s" : ""} • Total Outstanding: ${formatCurrency(filteredArTotalOutstanding)}`
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
                        ? `${filteredOutstandingData.length} record${filteredOutstandingData.length !== 1 ? "s" : ""}${outstandingAcademicYearId !== "all" ? ` • ${academicYears?.find((ay) => ay.id === outstandingAcademicYearId)?.name ?? "Year"}` : " • All years"}`
                        : "No data available")}
                  {selectedReport === "deposit-installment" &&
                    (breakdownLoading
                      ? "Loading..."
                      : breakdownData
                        ? `${filteredBreakdownData.length} record${filteredBreakdownData.length !== 1 ? "s" : ""}${breakdownAcademicYearId !== "all" ? ` • ${academicYears?.find((ay) => ay.id === breakdownAcademicYearId)?.name ?? "Year"}` : " • All years"}`
                        : "No data available")}
                  {selectedReport === "bank-reconciliation" &&
                    (bankLoading
                      ? "Loading..."
                      : bankData
                        ? `${bankData.length} payment${bankData.length !== 1 ? "s" : ""}`
                        : "No data available")}
                  {selectedReport === "upcoming-payments" &&
                    (upcomingLoading
                      ? "Loading..."
                      : `${filteredUpcomingData.length} installment${filteredUpcomingData.length !== 1 ? "s" : ""}${upcomingAcademicYearId !== "all" ? ` • ${academicYears?.find((ay) => ay.id === upcomingAcademicYearId)?.name ?? "Year"}` : ""} (${upcomingDueWindow === "all" ? "all dates" : `next ${upcomingDueWindow} days`}, ${upcomingStatusFilter === "all" ? "all statuses" : upcomingStatusFilter})`)}
                  {selectedReport === "paid-in-full" &&
                    (fullyPaidLoading
                      ? "Loading..."
                      : `${filteredFullyPaidData.length} application${filteredFullyPaidData.length !== 1 ? "s" : ""}${fullyPaidAcademicYearId !== "all" ? ` • ${academicYears?.find((ay) => ay.id === fullyPaidAcademicYearId)?.name ?? "Year"}` : ""}`)}
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
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                      <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search by student, contract, studio, status..."
                          value={arSearchQuery}
                          onChange={(e) => setArSearchQuery(e.target.value)}
                          className="rounded-full pl-9"
                        />
                      </div>
                      <div className="w-full sm:w-56">
                        <AcademicYearSelector
                          value={arAcademicYearId}
                          onValueChange={(id) => setArAcademicYearId(id ?? "all")}
                          allowEmpty
                          label="Academic year"
                          className="[&_button]:rounded-full"
                        />
                      </div>
                      <div className="text-sm text-muted-foreground self-center shrink-0">
                        {filteredArData.length} record{filteredArData.length !== 1 ? "s" : ""}
                        {(arSearchQuery.trim() || (arAcademicYearId && arAcademicYearId !== "all")) ? " (filtered)" : ""}
                      </div>
                    </div>
                  </div>
                  {paginatedArData.length > 0 ? (
                    <>
                      {paginatedArData.map((item) => (
                        <Card key={item.application_id} className="rounded-2xl">
                          <CardContent className="p-6">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <h3 className="text-sm md:text-lg font-bold">{item.student_name}</h3>
                                  <Badge
                                    variant="outline"
                                    className={`uppercase text-xs ${item.application_status === "confirmed" ? "bg-green-600 text-white border-green-600 hover:bg-green-600" : ""}`}
                                  >
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
                                    <span className="font-medium">Payment Plan:</span> {item.payment_plan || "—"}
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
                      {filteredArData.length > AR_PER_PAGE && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
                          <div className="text-sm text-muted-foreground">
                            Showing {(arPage - 1) * AR_PER_PAGE + 1} to{" "}
                            {Math.min(arPage * AR_PER_PAGE, filteredArData.length)} of {filteredArData.length}
                          </div>
                          <Pagination>
                            <PaginationContent>
                              <PaginationItem>
                                <PaginationPrevious
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    if (arPage > 1) setArPage(arPage - 1);
                                  }}
                                  className={arPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                />
                              </PaginationItem>
                              {Array.from({ length: arTotalPages }, (_, i) => i + 1).map((page) => {
                                if (
                                  page === 1 ||
                                  page === arTotalPages ||
                                  (page >= arPage - 1 && page <= arPage + 1)
                                ) {
                                  return (
                                    <PaginationItem key={page}>
                                      <PaginationLink
                                        href="#"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          setArPage(page);
                                        }}
                                        isActive={arPage === page}
                                        className="cursor-pointer"
                                      >
                                        {page}
                                      </PaginationLink>
                                    </PaginationItem>
                                  );
                                } else if (page === arPage - 2 || page === arPage + 2) {
                                  return (
                                    <PaginationItem key={page}>
                                      <PaginationEllipsis />
                                    </PaginationItem>
                                  );
                                }
                                return null;
                              })}
                              <PaginationItem>
                                <PaginationNext
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    if (arPage < arTotalPages) setArPage(arPage + 1);
                                  }}
                                  className={arPage === arTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                />
                              </PaginationItem>
                            </PaginationContent>
                          </Pagination>
                        </div>
                      )}
                    </>
                  ) : (
                    <Card className="rounded-3xl border-dashed">
                      <CardHeader>
                        <CardTitle>No matches</CardTitle>
                        <CardDescription>
                          No accounts receivable records match &quot;{arSearchQuery}&quot;. Try a different search.
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  )}
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
                    <CardDescription>
                      No revenue in the selected period. Revenue is from Stripe and manual payments only (no backfill).
                      Try a wider date range, or confirm payments exist under Payment History and that migrations are applied.
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}

            {/* Outstanding Balances Report */}
            {selectedReport === "outstanding-balances" &&
              (outstandingLoading ? (
                <ReportSkeleton />
              ) : outstandingData && outstandingData.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                    <div className="w-full sm:w-56">
                      <AcademicYearSelector
                        value={outstandingAcademicYearId}
                        onValueChange={(id) => setOutstandingAcademicYearId(id ?? "all")}
                        allowEmpty
                        label="Academic year"
                        className="[&_button]:rounded-full"
                      />
                    </div>
                    <div className="text-xs md:text-sm text-muted-foreground">
                      {filteredOutstandingData.length} record{filteredOutstandingData.length !== 1 ? "s" : ""}
                      {outstandingAcademicYearId !== "all" ? " (filtered)" : ""}
                    </div>
                  </div>
                  {filteredOutstandingData.length > 0 ? (
                    filteredOutstandingData.map((item) => (
                      <Card key={item.application_id} className="rounded-2xl">
                        <CardContent className="p-6">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <h3 className="text-sm md:text-lg font-bold">{item.student_name}</h3>
                              {item.academic_year_name && (
                                <Badge variant="secondary" className="text-xs font-normal">
                                  {item.academic_year_name}
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className={`uppercase text-xs ${item.application_status === "confirmed" ? "bg-green-600 text-white border-green-600 hover:bg-green-600" : ""}`}
                              >
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
                                <span className="font-medium">Payment Plan:</span> {item.payment_plan || "—"}
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
                                  {formatDateSafe(item.oldest_unpaid_due_date, "MMM d, yyyy")}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card className="rounded-3xl border-dashed">
                      <CardHeader>
                        <CardTitle>No Records for Selected Year</CardTitle>
                        <CardDescription>No outstanding balances for the selected academic year. Try "All years".</CardDescription>
                      </CardHeader>
                    </Card>
                  )}
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
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                    <div className="w-full sm:w-56">
                      <AcademicYearSelector
                        value={breakdownAcademicYearId}
                        onValueChange={(id) => setBreakdownAcademicYearId(id ?? "all")}
                        allowEmpty
                        label="Academic year"
                        className="[&_button]:rounded-full"
                      />
                    </div>
                    <div className="text-xs md:text-sm text-muted-foreground">
                      {filteredBreakdownData.length} record{filteredBreakdownData.length !== 1 ? "s" : ""}
                      {breakdownAcademicYearId !== "all" ? " (filtered)" : ""}
                    </div>
                  </div>
                  {filteredBreakdownData.length > 0 ? (
                    filteredBreakdownData.map((item) => (
                      <Card key={item.application_id} className="rounded-2xl">
                        <CardContent className="p-6">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <h3 className="text-sm md:text-lg font-bold">{item.student_name}</h3>
                              {item.academic_year_name && (
                                <Badge variant="secondary" className="text-xs font-normal">
                                  {item.academic_year_name}
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className={`uppercase text-xs ${item.status === "confirmed" ? "bg-green-600 text-white border-green-600 hover:bg-green-600" : ""}`}
                              >
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
                                <span className="font-medium text-muted-foreground">Payment Plan:</span>{" "}
                                {item.payment_plan || "—"}
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
                  ))
                  ) : (
                    <Card className="rounded-3xl border-dashed">
                      <CardHeader>
                        <CardTitle>No Records for Selected Year</CardTitle>
                        <CardDescription>No deposit/installment breakdown for the selected academic year. Try "All years".</CardDescription>
                      </CardHeader>
                    </Card>
                  )}
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
                          <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Payment Plan</th>
                          <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Invoice #</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bankData.map((item, index) => (
                          <tr key={item.payment_id} className={index % 2 === 0 ? "bg-muted/30" : ""}>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm">
                              {formatDateSafe(item.payment_date, "MMM d, yyyy")}
                            </td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-medium">{item.student_name || "—"}</td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm text-right font-semibold">{formatCurrency(item.amount_paid)}</td>
                            <td className="py-2 md:py-3 px-2 md:px-4">
                              <Badge variant="outline" className="text-xs">{item.payment_method}</Badge>
                            </td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm">{item.payment_type}</td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm">{item.payment_plan || "—"}</td>
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
                    <CardDescription>
                      No payments in the selected period. Reconciliation lists Stripe and manual payments only (no backfill).
                      Try a wider date range, or confirm payments under Payment History and that migrations are applied.
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}

            {/* Upcoming & Paid Installments Report */}
            {selectedReport === "upcoming-payments" &&
              (upcomingLoading ? (
                <ReportSkeleton />
              ) : filteredUpcomingData && filteredUpcomingData.length > 0 ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Student</th>
                          <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Studio</th>
                          <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Contract</th>
                          <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Payment Plan</th>
                          <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Due Date</th>
                          <th className="text-right py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Amount</th>
                          <th className="text-right py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Paid</th>
                          <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Status</th>
                          <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold uppercase">Paid Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUpcomingData.map((item, index) => (
                          <tr key={`${item.installment_id}-${item.application_id}`} className={index % 2 === 0 ? "bg-muted/30" : ""}>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-medium">{item.student_name ?? "—"}</td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm">{item.studio_number ?? "—"} {item.studio_grade ? `(${item.studio_grade})` : ""}</td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm">{item.contract_name ?? "—"}</td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm">{item.payment_plan ?? "—"}</td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm">{formatDateSafe(item.due_date, "MMM d, yyyy")}</td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm text-right font-semibold">{formatCurrency(item.amount)}</td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm text-right">
                              {item.status === "paid"
                                ? formatCurrency(item.amount)
                                : item.status === "partially_paid" && item.amount_paid != null
                                  ? `${formatCurrency(item.amount_paid)} / ${formatCurrency(item.amount)}`
                                  : "—"}
                            </td>
                            <td className="py-2 md:py-3 px-2 md:px-4">
                              <Badge
                                variant={
                                  item.status === "paid"
                                    ? "default"
                                    : item.status === "overdue"
                                      ? "destructive"
                                      : item.status === "partially_paid"
                                        ? "secondary"
                                        : "outline"
                                }
                                className="text-xs capitalize"
                              >
                                {item.status === "partially_paid" ? "Partially paid" : item.status}
                              </Badge>
                            </td>
                            <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm">{formatDateSafe(item.paid_date, "MMM d, yyyy")}</td>
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
                    <CardDescription>
                      {upcomingData?.length === 0
                        ? "There are no installments in the system for confirmed applications."
                        : "No installments match the selected filters (academic year, due window, or status). Try selecting All academic years or All dates."}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}

            {/* Paid in Full Applications */}
            {selectedReport === "paid-in-full" &&
              (fullyPaidLoading ? (
                <ReportSkeleton />
              ) : filteredFullyPaidData && filteredFullyPaidData.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                      <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search by student, email, contract, studio..."
                          value={fullyPaidSearchQuery}
                          onChange={(e) => setFullyPaidSearchQuery(e.target.value)}
                          className="rounded-full pl-9"
                        />
                      </div>
                      <div className="text-sm text-muted-foreground self-center shrink-0">
                        {filteredFullyPaidData.length} record{filteredFullyPaidData.length !== 1 ? "s" : ""}
                        {(fullyPaidSearchQuery.trim() || (fullyPaidAcademicYearId && fullyPaidAcademicYearId !== "all")) ? " (filtered)" : ""}
                      </div>
                    </div>
                  </div>

                  {paginatedFullyPaidData.length > 0 ? (
                    <>
                      {paginatedFullyPaidData.map((item) => {
                        const studentName = `${item.first_name ?? ""} ${item.last_name ?? ""}`.trim() || "—";
                        return (
                          <Card key={item.application_id} className="rounded-2xl">
                            <CardContent className="p-6">
                              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <div className="flex-1 space-y-2">
                                  <div className="flex items-center gap-3 flex-wrap">
                                    <h3 className="text-sm md:text-lg font-bold">{studentName}</h3>
                                    <Badge variant="default" className="text-xs capitalize">
                                      Paid in full
                                    </Badge>
                                    {item.academic_year_name && (
                                      <Badge variant="secondary" className="text-xs font-normal">
                                        {item.academic_year_name}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs md:text-sm text-muted-foreground">
                                    <div>
                                      <span className="font-medium">Email:</span> {item.email || "—"}
                                    </div>
                                    <div>
                                      <span className="font-medium">Contract:</span> {item.contract_name || "—"}
                                    </div>
                                    <div>
                                      <span className="font-medium">Payment Plan:</span> {item.payment_plan || "—"}
                                    </div>
                                    <div>
                                      <span className="font-medium">Studio:</span>{" "}
                                      {item.studio_number ? item.studio_number : "—"}{" "}
                                      {item.studio_grade_name ? `(${item.studio_grade_name})` : ""}
                                    </div>
                                    <div>
                                      <span className="font-medium">Last payment:</span>{" "}
                                      {formatDateSafe(item.last_payment_date, "MMM d, yyyy")}
                                    </div>
                                    <div>
                                      <span className="font-medium">Total due:</span> {formatCurrency(item.total_due)}
                                    </div>
                                    <div>
                                      <span className="font-medium">Total paid:</span> {formatCurrency(item.total_paid)}
                                    </div>
                                  </div>
                                  <div className="text-base md:text-lg font-bold text-green-700">
                                    Remaining Balance: {formatCurrency(item.remaining_balance)}
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}

                      {filteredFullyPaidData.length > FULLY_PAID_PER_PAGE && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
                          <div className="text-sm text-muted-foreground">
                            Showing {(fullyPaidPage - 1) * FULLY_PAID_PER_PAGE + 1} to{" "}
                            {Math.min(fullyPaidPage * FULLY_PAID_PER_PAGE, filteredFullyPaidData.length)} of{" "}
                            {filteredFullyPaidData.length}
                          </div>
                          <Pagination>
                            <PaginationContent>
                              <PaginationItem>
                                <PaginationPrevious
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    if (fullyPaidPage > 1) setFullyPaidPage(fullyPaidPage - 1);
                                  }}
                                  className={fullyPaidPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                />
                              </PaginationItem>
                              {Array.from({ length: fullyPaidTotalPages }, (_, i) => i + 1).map((page) => {
                                if (
                                  page === 1 ||
                                  page === fullyPaidTotalPages ||
                                  (page >= fullyPaidPage - 1 && page <= fullyPaidPage + 1)
                                ) {
                                  return (
                                    <PaginationItem key={page}>
                                      <PaginationLink
                                        href="#"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          setFullyPaidPage(page);
                                        }}
                                        isActive={fullyPaidPage === page}
                                        className="cursor-pointer"
                                      >
                                        {page}
                                      </PaginationLink>
                                    </PaginationItem>
                                  );
                                } else if (page === fullyPaidPage - 2 || page === fullyPaidPage + 2) {
                                  return (
                                    <PaginationItem key={page}>
                                      <PaginationEllipsis />
                                    </PaginationItem>
                                  );
                                }
                                return null;
                              })}
                              <PaginationItem>
                                <PaginationNext
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    if (fullyPaidPage < fullyPaidTotalPages) setFullyPaidPage(fullyPaidPage + 1);
                                  }}
                                  className={
                                    fullyPaidPage === fullyPaidTotalPages
                                      ? "pointer-events-none opacity-50"
                                      : "cursor-pointer"
                                  }
                                />
                              </PaginationItem>
                            </PaginationContent>
                          </Pagination>
                        </div>
                      )}
                    </>
                  ) : (
                    <Card className="rounded-3xl border-dashed">
                      <CardHeader>
                        <CardTitle>No matches</CardTitle>
                        <CardDescription>
                          No paid-in-full applications match &quot;{fullyPaidSearchQuery}&quot;. Try a different search.
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  )}
                </div>
              ) : (
                <Card className="rounded-3xl border-dashed">
                  <CardHeader>
                    <CardTitle>No Records Found</CardTitle>
                    <CardDescription>
                      No paid-in-full applications match the selected filters (date range / academic year).
                    </CardDescription>
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

