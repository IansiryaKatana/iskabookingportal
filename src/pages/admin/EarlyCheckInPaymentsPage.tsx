import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { Loader2, MoreVertical, Pencil, Plus } from "lucide-react";
import { ExportButton } from "@/components/admin/ExportButton";
import AdminLayout from "@/components/admin/AdminLayout";
import { EarlyCheckInPaymentsManageDialog } from "@/components/admin/EarlyCheckInPaymentEditor";
import { FinanceStatusBadge } from "@/components/finance/FinanceStatusBadge";
import { AcademicYearSelector } from "@/components/admin/AcademicYearSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  useEarlyCheckInLedger,
  useRecordEarlyCheckInPayment,
  type EarlyCheckInPaymentStatus,
} from "@/hooks/useEarlyCheckIn";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  card: "Card",
  stripe: "Stripe",
  other: "Other",
};

const formatMoney = (amount: number | null | undefined, currency = "GBP") => {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const EarlyCheckInPaymentsPage = () => {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(now), "yyyy-MM-dd"));
  const [academicYearId, setAcademicYearId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<EarlyCheckInPaymentStatus | "all">("all");
  const [eciStatusFilter, setEciStatusFilter] = useState<"all" | "confirmed" | "cancelled">(
    "confirmed",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [recordOpen, setRecordOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [selectedStudentName, setSelectedStudentName] = useState<string>("");
  const [selectedEciStatus, setSelectedEciStatus] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(format(now, "yyyy-MM-dd"));
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payReference, setPayReference] = useState("");

  const recordPayment = useRecordEarlyCheckInPayment();

  const { data: ledger, isLoading } = useEarlyCheckInLedger({
    academicYearId: academicYearId !== "all" ? academicYearId : undefined,
    paymentStatus: statusFilter,
    eciStatus: eciStatusFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    search: searchQuery,
  });

  const financeEligible = useMemo(
    () =>
      (ledger ?? []).filter(
        (r) => r.amount_due > 0 || r.total_received > 0 || r.eci_status === "confirmed",
      ),
    [ledger],
  );

  const stats = useMemo(() => {
    const rows = financeEligible.filter((r) => r.eci_status !== "cancelled" || r.total_received > 0);
    const expected = rows.reduce((s, r) => s + Number(r.amount_due || 0), 0);
    const received = rows.reduce((s, r) => s + Number(r.total_received || 0), 0);
    const outstanding = rows.reduce((s, r) => s + Number(r.remaining_balance || 0), 0);
    const unpaid = rows.filter((r) => r.payment_status === "unpaid").length;
    const partial = rows.filter((r) => r.payment_status === "partially_paid").length;
    const paid = rows.filter((r) => r.payment_status === "fully_paid").length;
    return { expected, received, outstanding, unpaid, partial, paid };
  }, [financeEligible]);

  const exportCsv = () => {
    if (!financeEligible.length) {
      toast({ variant: "destructive", title: "No data to export" });
      return;
    }
    const headers = [
      "Student",
      "Studio",
      "ECI From",
      "ECI To",
      "Nights",
      "Amount Due",
      "Received",
      "Outstanding",
      "Payment Status",
      "ECI Status",
      "Application ID",
    ];
    const rows = financeEligible.map((r) => [
      r.student_name,
      r.studio_number ?? "",
      r.early_check_in_date,
      r.early_check_out_date,
      r.nights,
      r.amount_due.toFixed(2),
      r.total_received.toFixed(2),
      r.remaining_balance.toFixed(2),
      r.payment_status,
      r.eci_status,
      r.application_id,
    ]);
    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `early_check_in_payments_${dateFrom}_${dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast({ title: "Exported", description: "Early check-in payments ledger downloaded." });
  };

  const openRecord = (
    applicationId: string,
    studentName: string,
    remaining: number,
    eciStatus: string,
  ) => {
    setSelectedApplicationId(applicationId);
    setSelectedStudentName(studentName);
    setSelectedEciStatus(eciStatus);
    setPayAmount(remaining > 0 ? remaining.toFixed(2) : "");
    setPayDate(format(new Date(), "yyyy-MM-dd"));
    setPayMethod("bank_transfer");
    setPayReference("");
    setRecordOpen(true);
  };

  const openManage = (applicationId: string, studentName: string, eciStatus: string) => {
    setSelectedApplicationId(applicationId);
    setSelectedStudentName(studentName);
    setSelectedEciStatus(eciStatus);
    setManageOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedApplicationId) return;
    const amount = Number(payAmount);
    if (!payAmount || Number.isNaN(amount) || amount <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid amount",
        description: "Enter a valid payment amount.",
      });
      return;
    }
    if (!payDate) {
      toast({
        variant: "destructive",
        title: "Date required",
        description: "Choose a payment date.",
      });
      return;
    }
    if (!payReference.trim()) {
      toast({
        variant: "destructive",
        title: "Reference required",
        description: "Enter a payment reference.",
      });
      return;
    }

    try {
      await recordPayment.mutateAsync({
        applicationId: selectedApplicationId,
        amount,
        paymentDate: payDate,
        referenceNumber: payReference,
        paymentMethod: payMethod as "bank_transfer" | "cash" | "card" | "stripe" | "other",
      });
      toast({ title: "Payment recorded" });
      setRecordOpen(false);
      setSelectedApplicationId(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Unable to record payment",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  return (
    <AdminLayout
      pageTitle="Early Check-in Payments"
      subtitle="Track and record early check-in fees"
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
          <Tabs
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as EarlyCheckInPaymentStatus | "all")}
            className="w-full sm:w-auto"
          >
            <TabsList className="rounded-md flex flex-wrap h-auto">
              <TabsTrigger value="all" className="rounded-md text-xs">
                All
              </TabsTrigger>
              <TabsTrigger value="unpaid" className="rounded-md text-xs">
                Unpaid ({stats.unpaid})
              </TabsTrigger>
              <TabsTrigger value="partially_paid" className="rounded-md text-xs">
                Partial ({stats.partial})
              </TabsTrigger>
              <TabsTrigger value="fully_paid" className="rounded-md text-xs">
                Paid ({stats.paid})
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <ExportButton
            variant="outline"
            className="rounded-md gap-2"
            onExport={exportCsv}
            label="Export"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="rounded-3xl">
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground mb-1">Expected</p>
              <p className="text-2xl font-bold">{formatMoney(stats.expected)}</p>
            </CardContent>
          </Card>
          <Card className="rounded-3xl">
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground mb-1">Received</p>
              <p className="text-2xl font-bold text-green-600">{formatMoney(stats.received)}</p>
            </CardContent>
          </Card>
          <Card className="rounded-3xl">
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground mb-1">Outstanding</p>
              <p className="text-2xl font-bold text-amber-600">{formatMoney(stats.outstanding)}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">Payment ledger</CardTitle>
            <CardDescription>
              {financeEligible.length} early check-in
              {financeEligible.length !== 1 ? "s" : ""} matching filters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-3 mb-6 flex-wrap">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-md md:max-w-[160px]"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-md md:max-w-[160px]"
              />
              <div className="md:max-w-[200px] w-full">
                <AcademicYearSelector
                  value={academicYearId}
                  onValueChange={(id) => setAcademicYearId(id ?? "all")}
                  allowEmpty
                  label=""
                  className="[&_button]:rounded-md"
                />
              </div>
              <Select
                value={eciStatusFilter}
                onValueChange={(v) => setEciStatusFilter(v as "all" | "confirmed" | "cancelled")}
              >
                <SelectTrigger className="rounded-md md:max-w-[180px]">
                  <SelectValue placeholder="ECI status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ECI statuses</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Search student name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-md flex-1 min-w-[180px]"
              />
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : financeEligible.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                No early check-ins match your filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Student</TableHead>
                      <TableHead className="text-xs">Studio</TableHead>
                      <TableHead className="text-xs">ECI dates</TableHead>
                      <TableHead className="text-xs text-right">Nights</TableHead>
                      <TableHead className="text-xs text-right">Due</TableHead>
                      <TableHead className="text-xs text-right">Received</TableHead>
                      <TableHead className="text-xs text-right">Outstanding</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {financeEligible.map((row) => {
                      const canAdd =
                        row.eci_status === "confirmed" &&
                        row.payment_status !== "fully_paid" &&
                        row.payment_status !== "no_amount_due";
                      return (
                        <TableRow key={row.early_check_in_id}>
                          <TableCell className="text-xs">
                            <div className="font-medium">{row.student_name}</div>
                            <Link
                              to={`/admin/applications/${row.application_id}#early-check-in-section`}
                              className="text-primary hover:underline"
                            >
                              View application
                            </Link>
                          </TableCell>
                          <TableCell className="text-xs">{row.studio_number ?? "—"}</TableCell>
                          <TableCell className="text-xs">
                            <div>
                              {format(parseISO(row.early_check_in_date), "dd MMM yyyy")}
                            </div>
                            <div className="text-muted-foreground">
                              → {format(parseISO(row.early_check_out_date), "dd MMM yyyy")}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-right">{row.nights}</TableCell>
                          <TableCell className="text-xs text-right">
                            {formatMoney(row.amount_due, row.currency ?? "GBP")}
                          </TableCell>
                          <TableCell className="text-xs text-right text-green-600">
                            {formatMoney(row.total_received, row.currency ?? "GBP")}
                          </TableCell>
                          <TableCell className="text-xs text-right">
                            {formatMoney(row.remaining_balance, row.currency ?? "GBP")}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 items-start">
                              <FinanceStatusBadge status={row.payment_status} className="text-xs" />
                              {row.eci_status === "cancelled" && (
                                <Badge variant="outline" className="text-[10px] uppercase">
                                  Cancelled
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {(row.payment_count > 0 || canAdd) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="rounded-md p-1 h-8 w-8"
                                    aria-label={`Actions for ${row.student_name}`}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                  {row.payment_count > 0 && (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        openManage(
                                          row.application_id,
                                          row.student_name,
                                          row.eci_status,
                                        )
                                      }
                                    >
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Manage
                                    </DropdownMenuItem>
                                  )}
                                  {canAdd && (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        openRecord(
                                          row.application_id,
                                          row.student_name,
                                          row.remaining_balance,
                                          row.eci_status,
                                        )
                                      }
                                    >
                                      <Plus className="mr-2 h-4 w-4" />
                                      Add payment
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <EarlyCheckInPaymentsManageDialog
        open={manageOpen}
        onOpenChange={(open) => {
          setManageOpen(open);
          if (!open && !recordOpen) {
            setSelectedApplicationId(null);
            setSelectedStudentName("");
            setSelectedEciStatus(null);
          }
        }}
        applicationId={selectedApplicationId}
        studentName={selectedStudentName}
        eciStatus={selectedEciStatus}
      />

      <Sheet
        open={recordOpen}
        onOpenChange={(open) => {
          setRecordOpen(open);
          if (!open && !manageOpen) {
            setSelectedApplicationId(null);
            setSelectedStudentName("");
            setSelectedEciStatus(null);
          }
        }}
      >
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "flex flex-col gap-0 overflow-hidden p-4 sm:p-6",
            isMobile ? "max-h-[90vh] mb-0 rounded-t-2xl" : "h-full w-full sm:max-w-md",
            "[&>button]:!flex [&>button]:!h-8 [&>button]:!w-8 [&>button]:!items-center [&>button]:!justify-center",
            "[&>button]:!rounded-md [&>button]:!bg-red-500 [&>button]:!text-white [&>button]:!opacity-100",
            "[&>button]:!shadow-md [&>button]:transition-colors [&>button]:hover:!bg-red-600",
          )}
        >
          <SheetHeader className="flex-shrink-0 text-left space-y-1 pr-10">
            <SheetTitle className="font-display uppercase tracking-wide">
              Record early check-in payment
            </SheetTitle>
            <SheetDescription>
              {selectedStudentName
                ? `Recording payment for ${selectedStudentName}.`
                : "Enter payment details."}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 py-4">
            <div className="space-y-2">
              <Label htmlFor="eci_ledger_amount">Amount (£)</Label>
              <Input
                id="eci_ledger_amount"
                type="number"
                min="0.01"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="rounded-md"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eci_ledger_date">Payment date</Label>
              <Input
                id="eci_ledger_date"
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="rounded-md"
              />
            </div>
            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="eci_ledger_ref">Reference</Label>
              <Input
                id="eci_ledger_ref"
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                className="rounded-md"
                placeholder="Bank ref / receipt no."
              />
            </div>
          </div>
          <SheetFooter className="flex-shrink-0 flex-row justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              className="rounded-md"
              onClick={() => setRecordOpen(false)}
              disabled={recordPayment.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-md"
              onClick={handleRecordPayment}
              disabled={recordPayment.isPending}
            >
              {recordPayment.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save payment"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
};

export default EarlyCheckInPaymentsPage;
