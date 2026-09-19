import { useEffect, useState } from "react";
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
  useCheckInStatusReport,
  type ReportType,
  type MoveOutWindow,
  type CheckInStatusFilter,
  type ReportItem,
  type CheckInStatusReportItem,
  type MoveOutReportItem,
  type PendingDocumentReportItem,
  type StudioAllocationReportItem,
} from "@/hooks/useReports";
import { FileText, AlertCircle, CreditCard, Users, Building2, LayoutGrid, UserCheck } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AcademicYearSelector } from "@/components/admin/AcademicYearSelector";
import { ExportButton } from "@/components/admin/ExportButton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";
import { STAY_STATUS_LABELS } from "@/utils/stayStatus";
import { ReportDataTable, type ReportTableColumn } from "@/components/admin/reports/ReportDataTable";
import {
  ApplicationStatusBadge,
  BookingSourceBadge,
  DepositPaidBadge,
  DocumentStatusBadge,
  StayStatusBadge,
} from "@/components/admin/reports/reportBadges";

type ExtendedReportType =
  | ReportType
  | "applications-pipeline"
  | "weekly-payments"
  | "move-outs"
  | "check-in-status"
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
    value: "no_instalment_payments",
    label: "No Instalment Payments",
    icon: CreditCard,
    description: "Applications with no instalment payments recorded (deposit may or may not be paid)",
  },
  {
    value: "applications-pipeline",
    label: "Applications Pipeline (Summary)",
    icon: Users,
    description: "Counts of applications in each pipeline stage",
  },
  {
    value: "check-in-status",
    label: "Check-in Status",
    icon: UserCheck,
    description: "In House vs Awaiting Check-in totals and student list",
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
        <div className="mt-4 border-t pt-4">
          <ReportDataTable
            rows={details}
            getRowId={(row) => row.studio_id}
            selectedIds={[]}
            onSelectedIdsChange={() => {}}
            selectable={false}
            columns={[
              {
                id: "studio",
                header: "Studio",
                cell: (row) => <span className="font-medium">{row.studio_number}</span>,
              },
              {
                id: "student",
                header: "Student",
                cell: (row) => (
                  <div>
                    <div className="font-medium">{row.student_name}</div>
                    <div className="text-xs text-muted-foreground">{row.student_email}</div>
                  </div>
                ),
              },
              {
                id: "contract",
                header: "Contract",
                cell: (row) => row.contract_name,
              },
              {
                id: "period",
                header: "Period",
                cell: (row) =>
                  row.contract_start && row.contract_end
                    ? `${format(new Date(row.contract_start), "MMM d, yyyy")} – ${format(new Date(row.contract_end), "MMM d, yyyy")}`
                    : "—",
              },
              {
                id: "status",
                header: "Status",
                cell: () => (
                  <Badge className="uppercase rounded-md px-2.5 py-0.5 text-[10px] font-medium bg-orange-500 hover:bg-orange-600 text-white">
                    Occupied
                  </Badge>
                ),
              },
              {
                id: "actions",
                header: "",
                headClassName: "text-right",
                className: "text-right",
                cell: (row) => (
                  <Button variant="outline" size="sm" className="rounded-md" asChild>
                    <Link to={`/admin/applications/${row.application_id}`}>View</Link>
                  </Button>
                ),
              },
            ]}
          />
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
  const [checkInStayFilter, setCheckInStayFilter] = useState<CheckInStatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedIds([]);
  }, [selectedReport, selectedAcademicYearId, checkInStayFilter, moveOutWindow]);

  const listReportType: ReportType =
    selectedReport === "awaiting_signatures" ||
    selectedReport === "awaiting_deposit" ||
    selectedReport === "overdue_payments" ||
    selectedReport === "debtors" ||
    selectedReport === "no_instalment_payments"
      ? selectedReport
      : "awaiting_signatures";

  const { data: reportData, isLoading } = useReport(
    listReportType,
    selectedReport === "awaiting_signatures" ||
      selectedReport === "awaiting_deposit" ||
      selectedReport === "overdue_payments" ||
      selectedReport === "debtors" ||
      selectedReport === "no_instalment_payments"
      ? selectedAcademicYearId
      : undefined,
  );
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
  const { data: checkInStatusReport, isLoading: isLoadingCheckInStatus } = useCheckInStatusReport(
    selectedAcademicYearId,
    selectedReport === "check-in-status",
  );

  const checkInFilteredItems =
    checkInStatusReport?.items.filter((item) =>
      checkInStayFilter === "all" ? true : item.stay_status === checkInStayFilter,
    ) ?? [];

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "—";
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const checkInColumns: ReportTableColumn<CheckInStatusReportItem>[] = [
    {
      id: "student",
      header: "Student",
      cell: (item) => (
        <div>
          <div className="font-medium">{item.student_name}</div>
          <div className="text-xs text-muted-foreground">{item.student_email || "—"}</div>
        </div>
      ),
    },
    {
      id: "stay",
      header: "Stay",
      cell: (item) => <StayStatusBadge status={item.stay_status} />,
    },
    {
      id: "studio",
      header: "Studio",
      cell: (item) => (
        <div>
          <div className="font-medium">{item.studio_number || "Unassigned"}</div>
          {item.studio_grade && (
            <div className="text-xs text-muted-foreground">{item.studio_grade}</div>
          )}
        </div>
      ),
    },
    {
      id: "contract",
      header: "Contract",
      cell: (item) => (
        <div>
          <div className="font-medium">{item.contract_name}</div>
          {item.academic_year_name && (
            <div className="text-xs text-muted-foreground">{item.academic_year_name}</div>
          )}
        </div>
      ),
    },
    {
      id: "dates",
      header: "Dates",
      cell: (item) => (
        <div className="text-xs space-y-0.5">
          <div>
            Start:{" "}
            {item.contract_start ? format(new Date(item.contract_start), "dd MMM yyyy") : "—"}
          </div>
          <div>
            Check-in:{" "}
            {item.actual_check_in_date
              ? format(new Date(item.actual_check_in_date), "dd MMM yyyy")
              : "—"}
          </div>
        </div>
      ),
    },
    {
      id: "source",
      header: "Source",
      cell: (item) => <BookingSourceBadge source={item.booking_source} />,
    },
    {
      id: "actions",
      header: "",
      headClassName: "text-right",
      className: "text-right",
      cell: (item) => (
        <Button variant="outline" size="sm" className="rounded-md" asChild>
          <Link to={`/admin/applications/${item.application_id}`}>View</Link>
        </Button>
      ),
    },
  ];

  const moveOutColumns: ReportTableColumn<MoveOutReportItem>[] = [
    {
      id: "student",
      header: "Student",
      cell: (item) => (
        <div>
          <div className="font-medium">{item.student_name}</div>
          <div className="text-xs text-muted-foreground">{item.student_email || "—"}</div>
        </div>
      ),
    },
    {
      id: "year",
      header: "Year",
      cell: (item) =>
        item.academic_year_name ? (
          <Badge variant="outline" className="uppercase text-[10px]">
            {item.academic_year_name}
          </Badge>
        ) : (
          "—"
        ),
    },
    {
      id: "contract",
      header: "Contract",
      cell: (item) => item.contract_name,
    },
    {
      id: "studio",
      header: "Studio",
      cell: (item) => item.studio_number || "Unassigned",
    },
    {
      id: "end",
      header: "Contract End",
      cell: (item) => format(new Date(item.contract_end), "dd MMM yyyy"),
    },
    {
      id: "actions",
      header: "",
      headClassName: "text-right",
      className: "text-right",
      cell: (item) => (
        <Button variant="outline" size="sm" className="rounded-md" asChild>
          <Link to={`/admin/applications/${item.application_id}`}>View</Link>
        </Button>
      ),
    },
  ];

  const documentColumns: ReportTableColumn<PendingDocumentReportItem>[] = [
    {
      id: "student",
      header: "Student",
      cell: (doc) => (
        <div>
          <div className="font-medium">{doc.student_name}</div>
          <div className="text-xs text-muted-foreground">{doc.student_email || "—"}</div>
        </div>
      ),
    },
    {
      id: "type",
      header: "Document",
      cell: (doc) => (
        <Badge variant="outline" className="uppercase text-[10px]">
          {doc.document_type}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (doc) => <DocumentStatusBadge status={doc.status} />,
    },
    {
      id: "uploaded",
      header: "Uploaded",
      cell: (doc) =>
        doc.uploaded_at ? format(new Date(doc.uploaded_at), "dd MMM yyyy") : "—",
    },
    {
      id: "actions",
      header: "",
      headClassName: "text-right",
      className: "text-right",
      cell: (doc) => (
        <Button variant="outline" size="sm" className="rounded-md" asChild>
          <Link to={`/admin/applications/${doc.application_id}`}>View</Link>
        </Button>
      ),
    },
  ];

  const listReportColumns: ReportTableColumn<ReportItem>[] = [
    {
      id: "student",
      header: "Student",
      cell: (item) => (
        <div>
          <div className="font-medium">{item.student_name}</div>
          <div className="text-xs text-muted-foreground">{item.student_email}</div>
          {item.student_phone && (
            <div className="text-xs text-muted-foreground">{item.student_phone}</div>
          )}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (item) => (
        <div className="flex flex-wrap gap-1">
          <ApplicationStatusBadge status={item.status} />
          <DepositPaidBadge paid={item.deposit_paid} />
        </div>
      ),
    },
    {
      id: "contract",
      header: "Contract",
      cell: (item) => (
        <div>
          <div className="font-medium">{item.contract_name}</div>
          <div className="text-xs text-muted-foreground">{item.studio_grade}</div>
        </div>
      ),
    },
    {
      id: "studio",
      header: "Studio",
      cell: (item) => item.assigned_studio || "—",
    },
    {
      id: "value",
      header: "Value",
      cell: (item) => (
        <div className="text-xs space-y-0.5">
          <div>{formatCurrency(item.adjusted_total ?? item.total_contract_value)}</div>
          {item.partner_name && (
            <div className="text-muted-foreground">Partner: {item.partner_name}</div>
          )}
        </div>
      ),
    },
    ...(selectedReport === "overdue_payments" || selectedReport === "debtors"
      ? ([
          {
            id: "overdue",
            header: "Overdue",
            cell: (item: ReportItem) => (
              <div className="text-xs">
                <div className="font-bold text-destructive">
                  {formatCurrency(item.overdue_amount)}
                </div>
                {item.overdue_days != null && (
                  <div className="text-muted-foreground">
                    {item.overdue_days} day{item.overdue_days !== 1 ? "s" : ""}
                  </div>
                )}
              </div>
            ),
          },
        ] as ReportTableColumn<ReportItem>[])
      : []),
    {
      id: "actions",
      header: "",
      headClassName: "text-right",
      className: "text-right",
      cell: (item) => (
        <Button variant="outline" size="sm" className="rounded-md" asChild>
          <Link to={`/admin/applications/${item.application_id}`}>View</Link>
        </Button>
      ),
    },
  ];

  const allocationColumns: ReportTableColumn<StudioAllocationReportItem>[] = [
    {
      id: "grade",
      header: "Studio Grade",
      cell: (grade) => <span className="font-medium">{grade.studio_grade_name}</span>,
    },
    {
      id: "total",
      header: "Total",
      cell: (grade) => grade.total_studios,
    },
    {
      id: "students",
      header: "Students",
      cell: (grade) => (
        <Badge className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-[10px] uppercase">
          {grade.allocated_to_students}
        </Badge>
      ),
    },
    {
      id: "ota",
      header: "OTA",
      cell: (grade) => (
        <Badge className="bg-blue-500 hover:bg-blue-600 text-white rounded-md text-[10px] uppercase">
          {grade.allocated_to_ota}
        </Badge>
      ),
    },
    {
      id: "keyworkers",
      header: "Keyworkers",
      cell: (grade) => (
        <Badge className="bg-purple-500 hover:bg-purple-600 text-white rounded-md text-[10px] uppercase">
          {grade.allocated_to_keyworkers}
        </Badge>
      ),
    },
    {
      id: "unallocated",
      header: "Unallocated",
      cell: (grade) => (
        <Badge variant="outline" className="rounded-md text-[10px] uppercase">
          {grade.unallocated}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Status Mix",
      cell: (grade) => (
        <div className="flex flex-wrap gap-1">
          <Badge className="bg-green-500 text-white rounded-md text-[10px] uppercase">
            Avail {grade.status_available}
          </Badge>
          <Badge className="bg-orange-500 text-white rounded-md text-[10px] uppercase">
            Occ {grade.status_occupied}
          </Badge>
          <Badge className="bg-yellow-500 text-white rounded-md text-[10px] uppercase">
            Res {grade.status_reserved}
          </Badge>
        </div>
      ),
    },
  ];

  const exportToCSV = () => {
    if (selectedReport === "move-outs") {
      const rowsToExport =
        selectedIds.length > 0 && moveOutsReport
          ? moveOutsReport.filter((item) => selectedIds.includes(item.application_id))
          : moveOutsReport ?? [];

      if (!rowsToExport.length) {
        toast({
          title: "No data to export",
          description: "There is no move-out data available for this report.",
          variant: "destructive",
        });
        return;
      }

      const headers = [
        "Student Name",
        "Email",
        "Contract",
        "Studio",
        "Academic Year",
        "Contract End",
      ];
      const rows = rowsToExport.map((item) => [
        item.student_name,
        item.student_email,
        item.contract_name,
        item.studio_number || "Unassigned",
        item.academic_year_name || "",
        format(new Date(item.contract_end), "yyyy-MM-dd"),
      ]);
      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
      ].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `move_outs_${format(new Date(), "yyyy-MM-dd")}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({
        title: "Report exported",
        description: `Successfully exported ${rowsToExport.length} move-out records to CSV.`,
      });
      return;
    }

    if (selectedReport === "check-in-status") {
      const rowsToExport =
        selectedIds.length > 0
          ? checkInFilteredItems.filter((item) => selectedIds.includes(item.application_id))
          : checkInFilteredItems;

      if (!rowsToExport.length) {
        toast({
          title: "No data to export",
          description: "There is no check-in status data available for this report.",
          variant: "destructive",
        });
        return;
      }

      const headers = [
        "Student Name",
        "Email",
        "Stay Status",
        "Studio",
        "Studio Grade",
        "Contract",
        "Academic Year",
        "Booking Source",
        "Contract Start",
        "Contract End",
        "Actual Check-in Date",
        "Checked In At",
        "Actual Check-out Date",
        "Application Status",
      ];

      const rows = rowsToExport.map((item) => [
        item.student_name,
        item.student_email,
        item.stay_status_label,
        item.studio_number || "Unassigned",
        item.studio_grade || "",
        item.contract_name,
        item.academic_year_name || "",
        item.booking_source || "",
        item.contract_start ? format(new Date(item.contract_start), "yyyy-MM-dd") : "",
        item.contract_end ? format(new Date(item.contract_end), "yyyy-MM-dd") : "",
        item.actual_check_in_date ? format(new Date(item.actual_check_in_date), "yyyy-MM-dd") : "",
        item.checked_in_at ? format(new Date(item.checked_in_at), "yyyy-MM-dd HH:mm:ss") : "",
        item.actual_check_out_date ? format(new Date(item.actual_check_out_date), "yyyy-MM-dd") : "",
        item.application_status,
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `check_in_status_${checkInStayFilter}_${format(new Date(), "yyyy-MM-dd")}.csv`,
      );
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Report exported",
        description: `Successfully exported ${rowsToExport.length} check-in status records to CSV.`,
      });
      return;
    }

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
    const listRows =
      selectedIds.length > 0 && reportData
        ? reportData.filter((item) => selectedIds.includes(item.id))
        : reportData;

    if (!listRows || listRows.length === 0) {
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

    const rows = listRows.map((item) => [
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
      description: `Successfully exported ${listRows.length} records to CSV.`,
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
              <Skeleton className="h-10 w-32 rounded-md" />
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
          (selectedReport === "check-in-status" && checkInFilteredItems.length > 0) ||
          (selectedReport === "move-outs" && moveOutsReport && moveOutsReport.length > 0) ||
          (selectedReport !== "occupancy" &&
            selectedReport !== "studio-allocation" &&
            selectedReport !== "check-in-status" &&
            selectedReport !== "move-outs" &&
            reportData &&
            reportData.length > 0)) ? (
          <ExportButton
            size="sm"
            variant="outline"
            className="rounded-md p-2 h-9 w-9 flex-shrink-0"
            iconOnly
            label="Export CSV"
            onExport={exportToCSV}
          />
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
                <Select
                  value={selectedReport}
                  onValueChange={(value) => setSelectedReport(value as ExtendedReportType)}
                >
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
                selectedReport === "move-outs" ||
                selectedReport === "check-in-status" ||
                selectedReport === "awaiting_signatures" ||
                selectedReport === "awaiting_deposit" ||
                selectedReport === "overdue_payments" ||
                selectedReport === "debtors" ||
                selectedReport === "no_instalment_payments") && (
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
              {selectedReport === "check-in-status" && (
                <div className="mt-4">
                  <Label htmlFor="stay-filter">Stay Status</Label>
                  <Select
                    value={checkInStayFilter}
                    onValueChange={(value) => setCheckInStayFilter(value as CheckInStatusFilter)}
                  >
                    <SelectTrigger id="stay-filter" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All stays</SelectItem>
                      <SelectItem value="in_house">{STAY_STATUS_LABELS.in_house}</SelectItem>
                      <SelectItem value="awaiting_check_in">
                        {STAY_STATUS_LABELS.awaiting_check_in}
                      </SelectItem>
                      <SelectItem value="checked_out">{STAY_STATUS_LABELS.checked_out}</SelectItem>
                    </SelectContent>
                  </Select>
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
                    : selectedReport === "check-in-status"
                    ? isLoadingCheckInStatus
                      ? "Loading check-in status..."
                      : checkInStatusReport
                        ? `${checkInStatusReport.totals.in_house} in house · ${checkInStatusReport.totals.awaiting_check_in} awaiting · ${checkInStatusReport.totals.checked_out} checked out (${checkInFilteredItems.length} shown)`
                        : "No check-in status data available"
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
                (selectedReport === "check-in-status" && checkInFilteredItems.length > 0) ||
                (selectedReport === "move-outs" && moveOutsReport && moveOutsReport.length > 0) ||
                (selectedReport !== "occupancy" &&
                  selectedReport !== "studio-allocation" &&
                  selectedReport !== "applications-pipeline" &&
                  selectedReport !== "move-outs" &&
                  selectedReport !== "check-in-status" &&
                  selectedReport !== "document-status" &&
                  selectedReport !== "weekly-payments" &&
                  selectedReport !== "ota-vs-direct" &&
                  reportData &&
                  reportData.length > 0)) && (
                <ExportButton
                  onExport={exportToCSV}
                  className="rounded-md uppercase tracking-wide gap-2 hidden lg:flex"
                  label="Export CSV"
                />
              )}
            </div>
          </CardHeader>
          <CardContent>
            {selectedReport === "studio-allocation" ? (
              isLoadingStudioAllocation ? (
                <ReportSkeleton />
              ) : studioAllocationReport && studioAllocationReport.length > 0 ? (
                <div className="space-y-6">
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

                  <ReportDataTable
                    rows={studioAllocationReport}
                    columns={allocationColumns}
                    getRowId={(grade) => grade.studio_grade_id}
                    selectedIds={selectedIds}
                    onSelectedIdsChange={setSelectedIds}
                    selectable={false}
                  />
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
                    <ReportDataTable
                      rows={occupancyReport.by_grade}
                      getRowId={(grade) => grade.studio_grade_id}
                      selectedIds={[]}
                      onSelectedIdsChange={() => {}}
                      selectable={false}
                      columns={[
                        {
                          id: "grade",
                          header: "Studio Grade",
                          cell: (grade) => (
                            <span className="font-medium">{grade.studio_grade_name}</span>
                          ),
                        },
                        {
                          id: "total",
                          header: "Total",
                          cell: (grade) => grade.total_studios,
                        },
                        {
                          id: "occupied",
                          header: "Occupied",
                          cell: (grade) => (
                            <Badge className="bg-orange-500 text-white rounded-md text-[10px] uppercase">
                              {grade.occupied_studios}
                            </Badge>
                          ),
                        },
                        {
                          id: "available",
                          header: "Available",
                          cell: (grade) => (
                            <Badge className="bg-green-500 text-white rounded-md text-[10px] uppercase">
                              {grade.available_studios}
                            </Badge>
                          ),
                        },
                        {
                          id: "reserved",
                          header: "Reserved",
                          cell: (grade) => (
                            <Badge className="bg-yellow-500 text-white rounded-md text-[10px] uppercase">
                              {grade.reserved_studios}
                            </Badge>
                          ),
                        },
                        {
                          id: "maintenance",
                          header: "Maintenance",
                          cell: (grade) => (
                            <Badge variant="outline" className="rounded-md text-[10px] uppercase">
                              {grade.maintenance_studios}
                            </Badge>
                          ),
                        },
                        {
                          id: "pct",
                          header: "Occupancy",
                          cell: (grade) => (
                            <Badge variant="outline" className="rounded-md text-[10px] uppercase">
                              {grade.occupancy_percentage}%
                            </Badge>
                          ),
                        },
                      ]}
                    />
                    {occupancyReport.by_grade.map((grade) =>
                      grade.occupied_details.length > 0 ? (
                        <div key={`${grade.studio_grade_id}-details`} className="space-y-2">
                          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            {grade.studio_grade_name} — Occupied Details
                          </h4>
                          <OccupancyDetailsCollapsible
                            gradeName={grade.studio_grade_name}
                            details={grade.occupied_details}
                          />
                        </div>
                      ) : null,
                    )}
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
                  <ReportDataTable
                    rows={pipelineReport.byStatus}
                    getRowId={(item) => item.status}
                    selectedIds={[]}
                    onSelectedIdsChange={() => {}}
                    selectable={false}
                    columns={[
                      {
                        id: "status",
                        header: "Status",
                        cell: (item) => <ApplicationStatusBadge status={item.status} />,
                      },
                      {
                        id: "count",
                        header: "Count",
                        cell: (item) => (
                          <span className="text-lg font-bold">{item.count}</span>
                        ),
                      },
                      {
                        id: "share",
                        header: "Share",
                        cell: (item) => {
                          const pct =
                            pipelineReport.total > 0
                              ? Math.round((item.count / pipelineReport.total) * 1000) / 10
                              : 0;
                          return (
                            <Badge variant="outline" className="rounded-md text-[10px] uppercase">
                              {pct}%
                            </Badge>
                          );
                        },
                      },
                    ]}
                  />
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
                <ReportDataTable
                  rows={moveOutsReport}
                  columns={moveOutColumns}
                  getRowId={(item) => item.application_id}
                  selectedIds={selectedIds}
                  onSelectedIdsChange={setSelectedIds}
                  selectionActions={
                    <ExportButton
                      onExport={exportToCSV}
                      size="sm"
                      variant="outline"
                      className="rounded-md"
                      label="Export selected"
                    />
                  }
                />
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
            ) : selectedReport === "check-in-status" ? (
              isLoadingCheckInStatus ? (
                <ReportSkeleton />
              ) : checkInStatusReport && checkInStatusReport.totals.total > 0 ? (
                <div className="space-y-6">
                  <Card className="rounded-2xl bg-primary/5">
                    <CardHeader>
                      <CardTitle className="text-base md:text-lg font-display font-bold uppercase">
                        Check-in Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Total</p>
                          <p className="text-xl md:text-2xl font-bold">
                            {checkInStatusReport.totals.total}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="text-left rounded-xl p-2 -m-2 hover:bg-background/60 transition-colors"
                          onClick={() => setCheckInStayFilter("in_house")}
                        >
                          <p className="text-sm text-muted-foreground">{STAY_STATUS_LABELS.in_house}</p>
                          <p className="text-xl md:text-2xl font-bold text-emerald-600">
                            {checkInStatusReport.totals.in_house}
                          </p>
                        </button>
                        <button
                          type="button"
                          className="text-left rounded-xl p-2 -m-2 hover:bg-background/60 transition-colors"
                          onClick={() => setCheckInStayFilter("awaiting_check_in")}
                        >
                          <p className="text-sm text-muted-foreground">
                            {STAY_STATUS_LABELS.awaiting_check_in}
                          </p>
                          <p className="text-xl md:text-2xl font-bold text-amber-600">
                            {checkInStatusReport.totals.awaiting_check_in}
                          </p>
                        </button>
                        <button
                          type="button"
                          className="text-left rounded-xl p-2 -m-2 hover:bg-background/60 transition-colors"
                          onClick={() => setCheckInStayFilter("checked_out")}
                        >
                          <p className="text-sm text-muted-foreground">
                            {STAY_STATUS_LABELS.checked_out}
                          </p>
                          <p className="text-xl md:text-2xl font-bold text-slate-600">
                            {checkInStatusReport.totals.checked_out}
                          </p>
                        </button>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          variant={checkInStayFilter === "all" ? "default" : "outline"}
                          size="sm"
                          className="rounded-md"
                          onClick={() => setCheckInStayFilter("all")}
                        >
                          Show all
                        </Button>
                        <Button variant="outline" size="sm" className="rounded-md" asChild>
                          <Link
                            to={`/admin/applications?stay=${
                              checkInStayFilter === "all" ? "in_house" : checkInStayFilter
                            }${
                              selectedAcademicYearId
                                ? `&academicYearId=${selectedAcademicYearId}`
                                : ""
                            }`}
                          >
                            Open in Applications
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <ReportDataTable
                    rows={checkInFilteredItems}
                    columns={checkInColumns}
                    getRowId={(item) => item.application_id}
                    selectedIds={selectedIds}
                    onSelectedIdsChange={setSelectedIds}
                    emptyMessage="No students in this filter. Try another stay status or academic year."
                    selectionActions={
                      <ExportButton
                        onExport={exportToCSV}
                        size="sm"
                        variant="outline"
                        className="rounded-md"
                        label="Export selected"
                      />
                    }
                  />
                </div>
              ) : (
                <Card className="rounded-3xl border-dashed">
                  <CardHeader>
                    <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">
                      No Check-in Data Found
                    </CardTitle>
                    <CardDescription>
                      There are no confirmed or checked-out students for the selected academic year.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )
            ) : selectedReport === "document-status" ? (
              isLoadingPendingDocuments ? (
                <ReportSkeleton />
              ) : pendingDocuments && pendingDocuments.length > 0 ? (
                <ReportDataTable
                  rows={pendingDocuments}
                  columns={documentColumns}
                  getRowId={(doc) => doc.id}
                  selectedIds={selectedIds}
                  onSelectedIdsChange={setSelectedIds}
                />
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
                    <Button asChild className="rounded-md">
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
                  <ReportDataTable
                    rows={studioAllocationReport}
                    getRowId={(grade) => grade.studio_grade_id}
                    selectedIds={[]}
                    onSelectedIdsChange={() => {}}
                    selectable={false}
                    columns={[
                      {
                        id: "grade",
                        header: "Studio Grade",
                        cell: (grade) => (
                          <span className="font-medium">{grade.studio_grade_name}</span>
                        ),
                      },
                      {
                        id: "students",
                        header: "Students",
                        cell: (grade) => {
                          const totalAllocated =
                            grade.allocated_to_students +
                            grade.allocated_to_ota +
                            grade.allocated_to_keyworkers;
                          const pct =
                            totalAllocated > 0
                              ? Math.round(
                                  (grade.allocated_to_students / totalAllocated) * 100 * 10,
                                ) / 10
                              : 0;
                          return (
                            <Badge className="bg-primary text-primary-foreground rounded-md text-[10px] uppercase">
                              {grade.allocated_to_students} ({pct}%)
                            </Badge>
                          );
                        },
                      },
                      {
                        id: "ota",
                        header: "OTA",
                        cell: (grade) => {
                          const totalAllocated =
                            grade.allocated_to_students +
                            grade.allocated_to_ota +
                            grade.allocated_to_keyworkers;
                          const pct =
                            totalAllocated > 0
                              ? Math.round((grade.allocated_to_ota / totalAllocated) * 100 * 10) /
                                10
                              : 0;
                          return (
                            <Badge className="bg-blue-500 text-white rounded-md text-[10px] uppercase">
                              {grade.allocated_to_ota} ({pct}%)
                            </Badge>
                          );
                        },
                      },
                      {
                        id: "keyworkers",
                        header: "Keyworkers",
                        cell: (grade) => {
                          const totalAllocated =
                            grade.allocated_to_students +
                            grade.allocated_to_ota +
                            grade.allocated_to_keyworkers;
                          const pct =
                            totalAllocated > 0
                              ? Math.round(
                                  (grade.allocated_to_keyworkers / totalAllocated) * 100 * 10,
                                ) / 10
                              : 0;
                          return (
                            <Badge className="bg-purple-500 text-white rounded-md text-[10px] uppercase">
                              {grade.allocated_to_keyworkers} ({pct}%)
                            </Badge>
                          );
                        },
                      },
                    ]}
                  />
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
              <ReportDataTable
                rows={reportData}
                columns={listReportColumns}
                getRowId={(item) => item.id}
                selectedIds={selectedIds}
                onSelectedIdsChange={setSelectedIds}
                selectionActions={
                  <ExportButton
                    onExport={exportToCSV}
                    size="sm"
                    variant="outline"
                    className="rounded-md"
                    label="Export selected"
                  />
                }
              />
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

