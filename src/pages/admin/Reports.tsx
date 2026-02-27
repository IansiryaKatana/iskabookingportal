import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  useReport,
  useOccupancyReport,
  useStudioAllocationReport,
  useApplicationsPipelineReport,
  usePendingDocumentsReport,
  useMoveOutsReport,
  type ReportType,
  type MoveOutWindow,
} from "@/hooks/useReports";
import { Download, FileText, AlertCircle, CreditCard, Users, Building2, LayoutGrid } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AcademicYearSelector } from "@/components/admin/AcademicYearSelector";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";

type ExtendedReportType =
  | ReportType
  | "applications-pipeline"
  | "weekly-payments"
  | "move-outs"
  | "ota-vs-direct"
  | "document-status";

const reportTypes: Array<{ value: ExtendedReportType; label: string; icon: typeof FileText; description: string }> = [
  {
    value: "awaiting_signatures",
    label: "Awaiting Signatures",
    icon: FileText,
    description: "Students who need to sign agreements",
  },
  {
    value: "awaiting_deposit",
    label: "Awaiting Deposit",
    icon: CreditCard,
    description: "Students who haven't paid their deposit",
  },
  {
    value: "overdue_payments",
    label: "Overdue Payments",
    icon: AlertCircle,
    description: "Students with overdue instalment payments",
  },
  {
    value: "debtors",
    label: "Debtors",
    icon: AlertCircle,
    description: "Students with outstanding balances",
  },
  {
    value: "applications-pipeline",
    label: "Applications Pipeline (Summary)",
    icon: Users,
    description: "Counts of applications in each pipeline stage",
  },
  {
    value: "move-outs",
    label: "Upcoming Move-outs",
    icon: Building2,
    description: "Confirmed bookings with contracts ending soon",
  },
  {
    value: "document-status",
    label: "Document Verification",
    icon: FileText,
    description: "Applications with pending document verification",
  },
  {
    value: "weekly-payments",
    label: "Weekly Payment Summary",
    icon: CreditCard,
    description: "Summary of payments for a given week",
  },
  {
    value: "occupancy",
    label: "Occupancy",
    icon: Building2,
    description: "All confirmed bookings and occupancy status",
  },
  {
    value: "studio-allocation",
    label: "Studio Allocation",
    icon: LayoutGrid,
    description: "Studio allocation counts by grade and allocation type",
  },
  {
    value: "ota-vs-direct",
    label: "OTA vs Direct Allocation",
    icon: LayoutGrid,
    description: "Studios allocated via OTA vs direct student bookings",
  },
];

const OccupancyDetailsCollapsible = ({
  gradeName,
  details,
}: {
  gradeName: string;
  details: Array<{
    studio_id: string;
    studio_number: string;
    student_name: string;
    student_email: string;
    contract_name: string;
    contract_start: string | null;
    contract_end: string | null;
    application_id: string;
  }>;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between">
          <span>View Occupied Studios ({details.length})</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-4 space-y-2 border-t pt-4">
          {details.map((detail) => (
            <Card key={detail.studio_id} className="rounded-xl">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-bold">Studio {detail.studio_number}</span>
                      <Badge variant="outline" className="uppercase">Occupied</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                      <div>
                        <span className="font-medium">Student:</span> {detail.student_name}
                      </div>
                      <div>
                        <span className="font-medium">Email:</span> {detail.student_email}
                      </div>
                      <div>
                        <span className="font-medium">Contract:</span> {detail.contract_name}
                      </div>
                      <div>
                        <span className="font-medium">Period:</span>{" "}
                        {detail.contract_start && detail.contract_end
                          ? `${format(new Date(detail.contract_start), "MMM d, yyyy")} - ${format(new Date(detail.contract_end), "MMM d, yyyy")}`
                          : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const Reports = () => {
  const { toast } = useToast();
  const [selectedReport, setSelectedReport] = useState<ExtendedReportType>("awaiting_signatures");
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string | undefined>();
  const [moveOutWindow] = useState<MoveOutWindow>("30");

  const listReportType: ReportType =
    selectedReport === "awaiting_signatures" ||
    selectedReport === "awaiting_deposit" ||
    selectedReport === "overdue_payments" ||
    selectedReport === "debtors"
      ? selectedReport
      : "awaiting_signatures";

  const { data: reportData, isLoading } = useReport(listReportType);
  const { data: occupancyReport, isLoading: isLoadingOccupancy } = useOccupancyReport(
    selectedReport === "occupancy" ? selectedAcademicYearId : undefined
  );
  const { data: studioAllocationReport, isLoading: isLoadingStudioAllocation } = useStudioAllocationReport();
  const { data: pipelineReport, isLoading: isLoadingPipeline } = useApplicationsPipelineReport(
    selectedAcademicYearId
  );
  const { data: pendingDocuments, isLoading: isLoadingPendingDocuments } = usePendingDocumentsReport();
  const { data: moveOutsReport, isLoading: isLoadingMoveOuts } = useMoveOutsReport(
    moveOutWindow,
    selectedAcademicYearId
  );

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "—";
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const exportToCSV = () => {
    if (selectedReport === "studio-allocation") {
      if (!studioAllocationReport || studioAllocationReport.length === 0) {
        toast({
          title: "No data to export",
          description: "There is no studio allocation data available for this report.",
          variant: "destructive",
        });
        return;
      }

      // Export studio allocation report
      const headers = [
        "Studio Grade",
        "Total Studios",
        "Active Studios",
        "Allocated to Students",
        "Allocated to OTA",
        "Allocated to Keyworkers",
        "Unallocated",
        "Status: Available",
        "Status: Occupied",
        "Status: Reserved",
        "Status: Maintenance",
      ];

      const rows = studioAllocationReport.map((item) => [
        item.studio_grade_name,
        item.total_studios.toString(),
        item.active_studios.toString(),
        item.allocated_to_students.toString(),
        item.allocated_to_ota.toString(),
        item.allocated_to_keyworkers.toString(),
        item.unallocated.toString(),
        item.status_available.toString(),
        item.status_occupied.toString(),
        item.status_reserved.toString(),
        item.status_maintenance.toString(),
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `studio_allocation_report_${format(new Date(), "yyyy-MM-dd")}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Report exported",
        description: `Successfully exported studio allocation report to CSV.`,
      });
      return;
    }

    if (selectedReport === "occupancy") {
      if (!occupancyReport || occupancyReport.by_grade.length === 0) {
        toast({
          title: "No data to export",
          description: "There is no occupancy data available for this report.",
          variant: "destructive",
        });
        return;
      }

      // Export occupancy report
      const headers = [
        "Academic Year",
        "Studio Grade",
        "Total Studios",
        "Occupied",
        "Available",
        "Reserved",
        "Maintenance",
        "Occupancy %",
        "Studio Number",
        "Student Name",
        "Student Email",
        "Contract",
        "Contract Start",
        "Contract End",
      ];

      const rows: string[][] = [];
      occupancyReport.by_grade.forEach((grade) => {
        if (grade.occupied_details.length > 0) {
          grade.occupied_details.forEach((detail) => {
            rows.push([
              occupancyReport.academic_year_name || "All Years",
              grade.studio_grade_name,
              grade.total_studios.toString(),
              grade.occupied_studios.toString(),
              grade.available_studios.toString(),
              grade.reserved_studios.toString(),
              grade.maintenance_studios.toString(),
              grade.occupancy_percentage.toString(),
              detail.studio_number,
              detail.student_name,
              detail.student_email,
              detail.contract_name,
              detail.contract_start ? format(new Date(detail.contract_start), "yyyy-MM-dd") : "",
              detail.contract_end ? format(new Date(detail.contract_end), "yyyy-MM-dd") : "",
            ]);
          });
        } else {
          // Add summary row even if no occupied studios
          rows.push([
            occupancyReport.academic_year_name || "All Years",
            grade.studio_grade_name,
            grade.total_studios.toString(),
            grade.occupied_studios.toString(),
            grade.available_studios.toString(),
            grade.reserved_studios.toString(),
            grade.maintenance_studios.toString(),
            grade.occupancy_percentage.toString(),
            "",
            "",
            "",
            "",
            "",
            "",
          ]);
        }
      });

      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `occupancy_report_${format(new Date(), "yyyy-MM-dd")}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Report exported",
        description: `Successfully exported occupancy report to CSV.`,
      });
      return;
    }

    // Regular reports export
    if (!reportData || reportData.length === 0) {
      toast({
        title: "No data to export",
        description: "There is no data available for this report.",
        variant: "destructive",
      });
      return;
    }

    const headers = [
      "Student Name",
      "Email",
      "Phone",
      "Contract",
      "Studio Grade",
      "Status",
      "Deposit Paid",
      "Total Contract Value",
      "Cashback Amount",
      "Discount Amount",
      "Adjusted Total",
      "Partner Referral",
      "Commission Amount",
      "Assigned Studio",
      "Contract Start",
      "Contract End",
      "Created At",
      ...(selectedReport === "overdue_payments" || selectedReport === "debtors"
        ? ["Overdue Amount", "Overdue Days"]
        : []),
    ];

    const rows = reportData.map((item) => [
      item.student_name,
      item.student_email,
      item.student_phone || "",
      item.contract_name,
      item.studio_grade,
      item.status,
      item.deposit_paid ? "Yes" : "No",
      item.total_contract_value?.toString() || "",
      item.cashback_amount?.toString() || "0",
      item.discount_amount?.toString() || "0",
      item.adjusted_total?.toString() || item.total_contract_value?.toString() || "",
      item.partner_name || "N/A",
      item.commission_amount?.toString() || "0",
      item.assigned_studio || "",
      item.contract_start ? format(new Date(item.contract_start), "yyyy-MM-dd") : "",
      item.contract_end ? format(new Date(item.contract_end), "yyyy-MM-dd") : "",
      format(new Date(item.created_at), "yyyy-MM-dd HH:mm:ss"),
      ...(selectedReport === "overdue_payments" || selectedReport === "debtors"
        ? [
            item.overdue_amount?.toString() || "",
            item.overdue_days?.toString() || "",
          ]
        : []),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${selectedReport}_${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Report exported",
      description: `Successfully exported ${reportData.length} records to CSV.`,
    });
  };

  const ReportSkeleton = () => (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="rounded-3xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
              <Skeleton className="h-10 w-32 rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const currentReport = reportTypes.find((r) => r.value === selectedReport);
  const Icon = currentReport?.icon || FileText;

  return (
    <AdminLayout
      pageTitle="Reports"
      subtitle="Generate and export reports for student bookings"
      mobileActionButton={
        ((selectedReport === "occupancy" && occupancyReport && occupancyReport.by_grade.length > 0) ||
          (selectedReport === "studio-allocation" && studioAllocationReport && studioAllocationReport.length > 0) ||
          (selectedReport !== "occupancy" &&
            selectedReport !== "studio-allocation" &&
            reportData &&
            reportData.length > 0)) ? (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full p-2 h-9 w-9 flex-shrink-0"
            onClick={exportToCSV}
          >
            <Download className="h-4 w-4" />
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {/* Report Type Selector */}
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">
              Select Report Type
            </CardTitle>
            <CardDescription>Choose a report to view and export</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="report-type">Report Type</Label>
                <Select value={selectedReport} onValueChange={(value) => setSelectedReport(value as ReportType)}>
                  <SelectTrigger id="report-type" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {reportTypes.map((type) => {
                      const TypeIcon = type.icon;
                      return (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <TypeIcon className="h-4 w-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              {currentReport && (
                <div className="flex items-center gap-3 p-4 bg-muted/40 rounded-2xl">
                  <Icon className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">{currentReport.label}</p>
                    <p className="text-sm text-muted-foreground">{currentReport.description}</p>
                  </div>
                </div>
              )}
              {(selectedReport === "occupancy" ||
                selectedReport === "applications-pipeline" ||
                selectedReport === "move-outs") && (
                <div className="mt-4">
                  <Label htmlFor="academic-year">Academic Year (Optional)</Label>
                  <div className="mt-2">
                    <AcademicYearSelector
                      value={selectedAcademicYearId}
                      onValueChange={(id) => setSelectedAcademicYearId(id)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Leave empty to view all academic years
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Report Results */}
        <Card className="rounded-3xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide flex items-center gap-2">
                  <Icon className="h-4 w-4 md:h-5 md:w-5" />
                  {currentReport?.label}
                </CardTitle>
                <CardDescription className="mt-1">
                  {selectedReport === "studio-allocation"
                    ? isLoadingStudioAllocation
                      ? "Loading studio allocation data..."
                      : studioAllocationReport
                        ? `${studioAllocationReport.length} studio grade${studioAllocationReport.length !== 1 ? "s" : ""} • ${studioAllocationReport.reduce((sum, g) => sum + g.total_studios, 0)} total studios`
                        : "No studio allocation data available"
                    : selectedReport === "occupancy"
                    ? isLoadingOccupancy
                      ? "Loading occupancy data..."
                      : occupancyReport
                        ? `${occupancyReport.total_studios} studios, ${occupancyReport.total_occupied} occupied (${occupancyReport.overall_occupancy_percentage}%)`
                        : "No occupancy data available"
                    : selectedReport === "applications-pipeline"
                    ? isLoadingPipeline
                      ? "Loading pipeline summary..."
                      : pipelineReport
                        ? `${pipelineReport.total} application${pipelineReport.total !== 1 ? "s" : ""} across ${pipelineReport.byStatus.length} status${pipelineReport.byStatus.length !== 1 ? "es" : ""}`
                        : "No applications found for this pipeline"
                    : selectedReport === "move-outs"
                    ? isLoadingMoveOuts
                      ? "Loading upcoming move-outs..."
                      : moveOutsReport
                        ? `${moveOutsReport.length} upcoming move-out${moveOutsReport.length !== 1 ? "s" : ""}${moveOutWindow !== "all" ? ` in the next ${moveOutWindow} days` : ""}`
                        : "No upcoming move-outs in this period"
                    : selectedReport === "document-status"
                    ? isLoadingPendingDocuments
                      ? "Loading pending documents..."
                      : pendingDocuments
                        ? `${pendingDocuments.length} pending document${pendingDocuments.length !== 1 ? "s" : ""} awaiting verification`
                        : "No pending documents at the moment"
                    : selectedReport === "weekly-payments"
                    ? "Open the Weekly Payments report for a detailed weekly breakdown."
                    : selectedReport === "ota-vs-direct"
                    ? isLoadingStudioAllocation
                      ? "Loading allocation data..."
                      : studioAllocationReport
                        ? (() => {
                            const totalStudents = studioAllocationReport.reduce(
                              (sum, g) => sum + g.allocated_to_students,
                              0,
                            );
                            const totalOta = studioAllocationReport.reduce(
                              (sum, g) => sum + g.allocated_to_ota,
                              0,
                            );
                            const totalKeyworkers = studioAllocationReport.reduce(
                              (sum, g) => sum + g.allocated_to_keyworkers,
                              0,
                            );
                            const totalAllocated = totalStudents + totalOta + totalKeyworkers;
                            return `${totalAllocated} allocated studios • ${totalStudents} student, ${totalOta} OTA, ${totalKeyworkers} keyworker`;
                          })()
                        : "No allocation data available"
                    : isLoading
                      ? "Loading report data..."
                      : reportData
                        ? `${reportData.length} record${reportData.length !== 1 ? "s" : ""} found`
                        : "No data available"}
                </CardDescription>
              </div>
              {((selectedReport === "studio-allocation" && studioAllocationReport && studioAllocationReport.length > 0) ||
                (selectedReport === "occupancy" && occupancyReport && occupancyReport.by_grade.length > 0) ||
                (selectedReport !== "occupancy" &&
                  selectedReport !== "studio-allocation" &&
                  selectedReport !== "applications-pipeline" &&
                  selectedReport !== "move-outs" &&
                  selectedReport !== "document-status" &&
                  selectedReport !== "weekly-payments" &&
                  selectedReport !== "ota-vs-direct" &&
                  reportData &&
                  reportData.length > 0)) && (
                <Button
                  onClick={exportToCSV}
                  className="rounded-full uppercase tracking-wide gap-2 hidden lg:flex"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {selectedReport === "studio-allocation" ? (
              isLoadingStudioAllocation ? (
                <ReportSkeleton />
              ) : studioAllocationReport && studioAllocationReport.length > 0 ? (
                <div className="space-y-6">
                  {/* Overall Summary */}
                  <Card className="rounded-2xl bg-primary/5">
                    <CardHeader>
                      <CardTitle className="text-base md:text-lg font-display font-bold uppercase">
                        Overall Allocation Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Studios</p>
                          <p className="text-xl md:text-2xl font-bold">
                            {studioAllocationReport.reduce((sum, g) => sum + g.total_studios, 0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Allocated to Students</p>
                          <p className="text-xl md:text-2xl font-bold text-primary">
                            {studioAllocationReport.reduce((sum, g) => sum + g.allocated_to_students, 0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Allocated to OTA</p>
                          <p className="text-xl md:text-2xl font-bold text-blue-600">
                            {studioAllocationReport.reduce((sum, g) => sum + g.allocated_to_ota, 0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Allocated to Keyworkers</p>
                          <p className="text-xl md:text-2xl font-bold text-purple-600">
                            {studioAllocationReport.reduce((sum, g) => sum + g.allocated_to_keyworkers, 0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Unallocated</p>
                          <p className="text-xl md:text-2xl font-bold text-gray-600">
                            {studioAllocationReport.reduce((sum, g) => sum + g.unallocated, 0)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* By Studio Grade */}
                  <div className="space-y-4">
                    <h3 className="text-base md:text-lg font-bold">By Studio Grade</h3>
                    {studioAllocationReport.map((grade) => (
                      <Card key={grade.studio_grade_id} className="rounded-2xl">
                        <CardHeader>
                          <CardTitle className="text-base md:text-lg font-display font-bold uppercase">
                            {grade.studio_grade_name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            <div>
                              <p className="text-xs md:text-sm text-muted-foreground">Total Studios</p>
                              <p className="text-lg md:text-xl font-bold">{grade.total_studios}</p>
                            </div>
                            <div>
                              <p className="text-xs md:text-sm text-muted-foreground">Active Studios</p>
                              <p className="text-lg md:text-xl font-bold">{grade.active_studios}</p>
                            </div>
                            <div>
                              <p className="text-xs md:text-sm text-muted-foreground">Allocated to Students</p>
                              <p className="text-lg md:text-xl font-bold text-primary">{grade.allocated_to_students}</p>
                            </div>
                            <div>
                              <p className="text-xs md:text-sm text-muted-foreground">Allocated to OTA</p>
                              <p className="text-lg md:text-xl font-bold text-blue-600">{grade.allocated_to_ota}</p>
                            </div>
                            <div>
                              <p className="text-xs md:text-sm text-muted-foreground">Allocated to Keyworkers</p>
                              <p className="text-lg md:text-xl font-bold text-purple-600">{grade.allocated_to_keyworkers}</p>
                            </div>
                            <div>
                              <p className="text-xs md:text-sm text-muted-foreground">Unallocated</p>
                              <p className="text-lg md:text-xl font-bold text-gray-600">{grade.unallocated}</p>
                            </div>
                            <div>
                              <p className="text-xs md:text-sm text-muted-foreground">Status: Available</p>
                              <p className="text-lg md:text-xl font-bold text-green-600">{grade.status_available}</p>
                            </div>
                            <div>
                              <p className="text-xs md:text-sm text-muted-foreground">Status: Occupied</p>
                              <p className="text-lg md:text-xl font-bold text-orange-600">{grade.status_occupied}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : (
                <Card className="rounded-3xl border-dashed">
                  <CardHeader>
                    <CardTitle>No Data Found</CardTitle>
                    <CardDescription>There is no studio allocation data available.</CardDescription>
                  </CardHeader>
                </Card>
              )
            ) : selectedReport === "occupancy" ? (
              isLoadingOccupancy ? (
                <ReportSkeleton />
              ) : occupancyReport ? (
                <div className="space-y-6">
                  {/* Overall Summary */}
                  <Card className="rounded-2xl bg-primary/5">
                    <CardHeader>
                      <CardTitle className="text-base md:text-lg font-display font-bold uppercase">
                        Overall Occupancy Summary
                        {occupancyReport.academic_year_name && (
                          <span className="text-sm md:text-base font-normal normal-case ml-2">
                            ({occupancyReport.academic_year_name})
                          </span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Studios</p>
                          <p className="text-xl md:text-2xl font-bold">{occupancyReport.total_studios}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Occupied</p>
                          <p className="text-xl md:text-2xl font-bold text-primary">{occupancyReport.total_occupied}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Available</p>
                          <p className="text-xl md:text-2xl font-bold text-green-600">{occupancyReport.total_available}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Reserved</p>
                          <p className="text-xl md:text-2xl font-bold text-yellow-600">{occupancyReport.total_reserved}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Occupancy %</p>
                          <p className="text-xl md:text-2xl font-bold">{occupancyReport.overall_occupancy_percentage}%</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* By Studio Grade */}
                  <div className="space-y-4">
                    <h3 className="text-base md:text-lg font-bold">By Studio Grade</h3>
                    {occupancyReport.by_grade.map((grade) => (
                      <Card key={grade.studio_grade_id} className="rounded-2xl">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base md:text-lg font-display font-bold uppercase">
                              {grade.studio_grade_name}
                            </CardTitle>
                            <Badge variant="outline" className="text-sm md:text-lg px-3 py-1">
                              {grade.occupancy_percentage}% Occupied
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                            <div>
                              <p className="text-sm text-muted-foreground">Total</p>
                              <p className="text-lg md:text-xl font-bold">{grade.total_studios}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Occupied</p>
                              <p className="text-lg md:text-xl font-bold text-primary">{grade.occupied_studios}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Available</p>
                              <p className="text-lg md:text-xl font-bold text-green-600">{grade.available_studios}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Reserved</p>
                              <p className="text-lg md:text-xl font-bold text-yellow-600">{grade.reserved_studios}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Maintenance</p>
                              <p className="text-lg md:text-xl font-bold text-gray-600">{grade.maintenance_studios}</p>
                            </div>
                          </div>

                          {grade.occupied_details.length > 0 && (
                            <OccupancyDetailsCollapsible
                              gradeName={grade.studio_grade_name}
                              details={grade.occupied_details}
                            />
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : (
                <Card className="rounded-3xl border-dashed">
                  <CardHeader>
                    <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">
                      No Occupancy Data Found
                    </CardTitle>
                    <CardDescription>
                      There is no occupancy data available for the selected academic year.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )
            ) : selectedReport === "applications-pipeline" ? (
              isLoadingPipeline ? (
                <ReportSkeleton />
              ) : pipelineReport && pipelineReport.byStatus.length > 0 ? (
                <div className="space-y-6">
                  <Card className="rounded-2xl bg-primary/5">
                    <CardHeader>
                      <CardTitle className="text-base md:text-lg font-display font-bold uppercase">
                        Pipeline Overview
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {pipelineReport.total} application
                        {pipelineReport.total !== 1 ? "s" : ""} across{" "}
                        {pipelineReport.byStatus.length} status
                        {pipelineReport.byStatus.length !== 1 ? "es" : ""}.
                      </p>
                    </CardContent>
                  </Card>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {pipelineReport.byStatus.map((item) => (
                      <Card key={item.status} className="rounded-2xl">
                        <CardContent className="p-4 space-y-1">
                          <p className="text-xs md:text-sm text-muted-foreground uppercase truncate">
                            {item.status.replace(/_/g, " ")}
                          </p>
                          <p className="text-xl md:text-2xl font-bold">{item.count}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : (
                <Card className="rounded-3xl border-dashed">
                  <CardHeader>
                    <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">
                      No Applications Found
                    </CardTitle>
                    <CardDescription>
                      There are no applications to show in the pipeline for the selected academic year.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )
            ) : selectedReport === "move-outs" ? (
              isLoadingMoveOuts ? (
                <ReportSkeleton />
              ) : moveOutsReport && moveOutsReport.length > 0 ? (
                <div className="space-y-4">
                  {moveOutsReport.map((item) => (
                    <Card key={item.application_id} className="rounded-2xl">
                      <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <h3 className="text-base md:text-lg font-bold">{item.student_name}</h3>
                              {item.academic_year_name && (
                                <Badge variant="outline" className="uppercase text-xs">
                                  {item.academic_year_name}
                                </Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-muted-foreground">
                              <div>
                                <span className="font-medium">Email:</span> {item.student_email || "—"}
                              </div>
                              <div>
                                <span className="font-medium">Contract:</span> {item.contract_name}
                              </div>
                              <div>
                                <span className="font-medium">Studio:</span>{" "}
                                {item.studio_number || "Unassigned"}
                              </div>
                              <div>
                                <span className="font-medium">Contract end:</span>{" "}
                                {format(new Date(item.contract_end), "yyyy-MM-dd")}
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
                    <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">
                      No Upcoming Move-outs
                    </CardTitle>
                    <CardDescription>
                      There are no confirmed contracts ending in the selected time window.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )
            ) : selectedReport === "document-status" ? (
              isLoadingPendingDocuments ? (
                <ReportSkeleton />
              ) : pendingDocuments && pendingDocuments.length > 0 ? (
                <div className="space-y-4">
                  {pendingDocuments.map((doc) => (
                    <Card key={doc.id} className="rounded-2xl">
                      <CardContent className="p-6">
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="text-base md:text-lg font-bold">{doc.student_name}</h3>
                            <Badge variant="outline" className="uppercase text-xs">
                              {doc.document_type}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-muted-foreground">
                            <div>
                              <span className="font-medium">Email:</span> {doc.student_email || "—"}
                            </div>
                            <div>
                              <span className="font-medium">Status:</span>{" "}
                              <span className="uppercase">{doc.status}</span>
                            </div>
                            <div>
                              <span className="font-medium">Uploaded:</span>{" "}
                              {doc.uploaded_at ? format(new Date(doc.uploaded_at), "yyyy-MM-dd") : "—"}
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
                    <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">
                      No Pending Documents
                    </CardTitle>
                    <CardDescription>
                      There are currently no documents awaiting verification.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )
            ) : selectedReport === "weekly-payments" ? (
              <div className="space-y-4">
                <Card className="rounded-2xl bg-primary/5">
                  <CardHeader>
                    <CardTitle className="text-base md:text-lg font-display font-bold uppercase">
                      Weekly Payment Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      Use the dedicated Weekly Payments report to run a detailed weekly breakdown,
                      export CSV, and inspect individual payments.
                    </p>
                    <Button asChild className="rounded-full">
                      <Link to="/admin/weekly-payment-report">Open Weekly Payments</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : selectedReport === "ota-vs-direct" ? (
              isLoadingStudioAllocation ? (
                <ReportSkeleton />
              ) : studioAllocationReport && studioAllocationReport.length > 0 ? (
                <div className="space-y-6">
                  <Card className="rounded-2xl bg-primary/5">
                    <CardHeader>
                      <CardTitle className="text-base md:text-lg font-display font-bold uppercase">
                        Overall Allocation Mix
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const totalStudents = studioAllocationReport.reduce(
                          (sum, g) => sum + g.allocated_to_students,
                          0,
                        );
                        const totalOta = studioAllocationReport.reduce(
                          (sum, g) => sum + g.allocated_to_ota,
                          0,
                        );
                        const totalKeyworkers = studioAllocationReport.reduce(
                          (sum, g) => sum + g.allocated_to_keyworkers,
                          0,
                        );
                        const totalAllocated = totalStudents + totalOta + totalKeyworkers;
                        const pct = (value: number) =>
                          totalAllocated > 0
                            ? Math.round((value / totalAllocated) * 100 * 10) / 10
                            : 0;

                        return (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <p className="text-sm text-muted-foreground">Student allocation</p>
                              <p className="text-xl md:text-2xl font-bold">
                                {totalStudents} ({pct(totalStudents)}%)
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">OTA allocation</p>
                              <p className="text-xl md:text-2xl font-bold">
                                {totalOta} ({pct(totalOta)}%)
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Keyworker allocation</p>
                              <p className="text-xl md:text-2xl font-bold">
                                {totalKeyworkers} ({pct(totalKeyworkers)}%)
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                  <div className="space-y-4">
                    <h3 className="text-base md:text-lg font-bold">By Studio Grade</h3>
                    {studioAllocationReport.map((grade) => {
                      const totalAllocated =
                        grade.allocated_to_students +
                        grade.allocated_to_ota +
                        grade.allocated_to_keyworkers;
                      const pct = (value: number) =>
                        totalAllocated > 0
                          ? Math.round((value / totalAllocated) * 100 * 10) / 10
                          : 0;
                      return (
                        <Card key={grade.studio_grade_id} className="rounded-2xl">
                          <CardHeader>
                            <CardTitle className="text-base md:text-lg font-display font-bold uppercase">
                              {grade.studio_grade_name}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <p className="text-xs md:text-sm text-muted-foreground">
                                  Student allocation
                                </p>
                                <p className="text-lg md:text-xl font-bold">
                                  {grade.allocated_to_students} ({pct(grade.allocated_to_students)}%)
                                </p>
                              </div>
                              <div>
                                <p className="text-xs md:text-sm text-muted-foreground">
                                  OTA allocation
                                </p>
                                <p className="text-lg md:text-xl font-bold">
                                  {grade.allocated_to_ota} ({pct(grade.allocated_to_ota)}%)
                                </p>
                              </div>
                              <div>
                                <p className="text-xs md:text-sm text-muted-foreground">
                                  Keyworker allocation
                                </p>
                                <p className="text-lg md:text-xl font-bold">
                                  {grade.allocated_to_keyworkers} (
                                  {pct(grade.allocated_to_keyworkers)}%)
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <Card className="rounded-3xl border-dashed">
                  <CardHeader>
                    <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">
                      No Allocation Data Found
                    </CardTitle>
                    <CardDescription>
                      There is no allocation data available to compare OTA vs direct bookings.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )
            ) : isLoading ? (
              <ReportSkeleton />
            ) : reportData && reportData.length > 0 ? (
              <div className="space-y-4">
                {reportData.map((item) => (
                  <Card key={item.id} className="rounded-2xl">
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3">
                            <h3 className="text-base md:text-lg font-bold">{item.student_name}</h3>
                            <Badge variant="outline" className="uppercase">
                              {item.status}
                            </Badge>
                            {item.deposit_paid && (
                              <Badge variant="default" className="uppercase">
                                Deposit Paid
                              </Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                            <div>
                              <span className="font-medium">Email:</span> {item.student_email}
                            </div>
                            <div>
                              <span className="font-medium">Phone:</span> {item.student_phone || "—"}
                            </div>
                            <div>
                              <span className="font-medium">Contract Value:</span>{" "}
                              {formatCurrency(item.total_contract_value)}
                            </div>
                            {item.cashback_amount && item.cashback_amount > 0 && (
                              <div>
                                <span className="font-medium">Cashback:</span>{" "}
                                <span className="text-green-600 font-bold">
                                  -{formatCurrency(item.cashback_amount)}
                                </span>
                              </div>
                            )}
                            {item.discount_amount && item.discount_amount > 0 && (
                              <div>
                                <span className="font-medium">Discount:</span>{" "}
                                <span className="text-green-600 font-bold">
                                  -{formatCurrency(item.discount_amount)}
                                </span>
                              </div>
                            )}
                            {item.adjusted_total && (
                              <div>
                                <span className="font-medium">Adjusted Total:</span>{" "}
                                <span className="font-bold">
                                  {formatCurrency(item.adjusted_total)}
                                </span>
                              </div>
                            )}
                          </div>
                          {item.partner_name && (
                            <div className="text-sm text-muted-foreground mb-2">
                              <span className="font-medium">Partner:</span>{" "}
                              <span className="font-bold">{item.partner_name}</span>
                              {item.commission_amount && (
                                <span className="ml-2 text-primary">
                                  (Commission: {formatCurrency(item.commission_amount)})
                                </span>
                              )}
                            </div>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Contract:</span>{" "}
                              <span className="font-medium">{item.contract_name}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Studio Grade:</span>{" "}
                              <span className="font-medium">{item.studio_grade}</span>
                            </div>
                            {item.assigned_studio && (
                              <div>
                                <span className="text-muted-foreground">Studio:</span>{" "}
                                <span className="font-medium">{item.assigned_studio}</span>
                              </div>
                            )}
                          </div>
                          {(selectedReport === "overdue_payments" || selectedReport === "debtors") &&
                            item.overdue_amount && (
                              <div className="flex items-center gap-4 text-sm">
                                <div className="text-destructive font-bold">
                                  Overdue: {formatCurrency(item.overdue_amount)}
                                </div>
                                {item.overdue_days && (
                                  <div className="text-muted-foreground">
                                    {item.overdue_days} day{item.overdue_days !== 1 ? "s" : ""} overdue
                                  </div>
                                )}
                              </div>
                            )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="rounded-3xl border-dashed">
                <CardHeader>
                  <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">
                    No Records Found
                  </CardTitle>
                  <CardDescription>
                    There are no records matching this report type at the moment.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default Reports;

