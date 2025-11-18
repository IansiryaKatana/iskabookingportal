import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useReport, type ReportType } from "@/hooks/useReports";
import { Download, FileText, AlertCircle, CreditCard, Users, Building2 } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const reportTypes: Array<{ value: ReportType; label: string; icon: typeof FileText; description: string }> = [
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
    value: "occupancy",
    label: "Occupancy",
    icon: Building2,
    description: "All confirmed bookings and occupancy status",
  },
];

const Reports = () => {
  const { toast } = useToast();
  const [selectedReport, setSelectedReport] = useState<ReportType>("awaiting_signatures");
  const { data: reportData, isLoading } = useReport(selectedReport);

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
    >
      <div className="space-y-6">
        {/* Report Type Selector */}
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-xl font-display uppercase tracking-wide">
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
            </div>
          </CardContent>
        </Card>

        {/* Report Results */}
        <Card className="rounded-3xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-display uppercase tracking-wide flex items-center gap-2">
                  <Icon className="h-5 w-5" />
                  {currentReport?.label}
                </CardTitle>
                <CardDescription className="mt-1">
                  {isLoading
                    ? "Loading report data..."
                    : reportData
                      ? `${reportData.length} record${reportData.length !== 1 ? "s" : ""} found`
                      : "No data available"}
                </CardDescription>
              </div>
              {reportData && reportData.length > 0 && (
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
              <ReportSkeleton />
            ) : reportData && reportData.length > 0 ? (
              <div className="space-y-4">
                {reportData.map((item) => (
                  <Card key={item.id} className="rounded-2xl">
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold">{item.student_name}</h3>
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
                          </div>
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
                                <div className="text-destructive font-semibold">
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
                  <CardTitle className="text-xl font-display uppercase tracking-wide">
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

