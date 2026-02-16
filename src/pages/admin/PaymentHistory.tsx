import { useState, useMemo } from "react";
import { useAllPayments, type UnifiedPayment } from "@/hooks/useUnifiedPayments";
import { useAdminContracts } from "@/hooks/useAdminContracts";
import { useAdminAcademicYears } from "@/hooks/useAdminAcademicYears";
import { useBrandingSettings } from "@/hooks/useBranding";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Download, Calendar, Filter, FileText, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { generateInvoicePDF } from "@/utils/invoicePdfGenerator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const PaymentHistory = () => {
  const { toast } = useToast();
  const [selectedContract, setSelectedContract] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set());
  const [isGeneratingReceipts, setIsGeneratingReceipts] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; errors?: Array<{ paymentIntentId: string; error: string }> } | null>(null);

  const { data: contracts } = useAdminContracts();
  const { data: academicYears } = useAdminAcademicYears();
  const { data: branding } = useBrandingSettings();

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
      "Student Name",
      "Studio",
      "Studio Grade",
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
      payment.student_name?.trim() || "N/A",
      payment.studio_number ?? "N/A",
      payment.studio_grade ?? "N/A",
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

  // Separate payments into deposits and installments
  const { deposits, installments, allPayments } = useMemo(() => {
    if (!payments) return { deposits: [], installments: [], allPayments: [] };
    
    const depositsList = payments.filter(payment => {
      // Deposit if: no installment_number AND (metadata type is deposit OR no type/installment_number)
      const isDeposit = !payment.installment_number && 
        (payment.payment_metadata?.type === "deposit" || 
         !payment.payment_metadata?.type || 
         payment.payment_metadata?.type !== "instalment");
      return isDeposit;
    });
    
    const installmentsList = payments.filter(payment => {
      // Installment if: has installment_number OR metadata type is instalment
      return payment.installment_number !== null || 
             payment.payment_metadata?.type === "instalment";
    });
    
    return {
      deposits: depositsList,
      installments: installmentsList,
      allPayments: payments,
    };
  }, [payments]);

  // Fetch student info on demand
  const fetchStudentInfo = async (studentId: string, applicationId: string) => {
    // Get profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, phone")
      .eq("id", studentId)
      .single();

    // Get email
    const { data: emailsData } = await supabase.functions.invoke("get-user-emails", {
      body: { userIds: [studentId] },
    });
    const email = emailsData?.emails?.[studentId] || "";

    // Get address from application step 2
    let address = null;
    const { data: step2 } = await supabase
      .from("student_application_steps")
      .select("payload")
      .eq("application_id", applicationId)
      .eq("step_number", 2)
      .single();

    if (step2?.payload) {
      address = {
        line1: step2.payload.address_line1,
        line2: step2.payload.address_line2,
        city: step2.payload.town,
        postcode: step2.payload.postcode,
      };
    }

    const name = profile
      ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || email.split("@")[0] || "Student"
      : email.split("@")[0] || "Student";

    return {
      name,
      email,
      phone: profile?.phone || null,
      address,
    };
  };

  const handleDownloadReceipt = async (payment: UnifiedPayment) => {
    try {
      const studentInfo = await fetchStudentInfo(payment.student_id, payment.student_application_id);

      const receiptRef = `RCP-${payment.payment_id.slice(0, 8).toUpperCase()}-${format(new Date(payment.payment_date), "yyyyMMdd")}`;

      await generateInvoicePDF({
        payment,
        studentName: studentInfo.name,
        studentEmail: studentInfo.email,
        studentPhone: studentInfo.phone,
        studentAddress: studentInfo.address,
        invoiceNumber: receiptRef,
        asReceipt: true,
        branding: {
          companyName: branding?.company_name,
          contactPhone: branding?.contact_phone,
          contactEmail: branding?.contact_email,
          contactAddress1: branding?.contact_address_line1,
          contactAddress2: branding?.contact_address_line2,
          contactAddress3: branding?.contact_address_line3,
          vatNumber: branding?.vat_number,
          companyNumber: branding?.company_number,
        },
      });

      toast({
        title: "Receipt downloaded",
        description: "Receipt PDF has been generated and downloaded.",
      });
    } catch (error) {
      console.error("Error generating receipt:", error);
      toast({
        title: "Error",
        description: "Failed to generate receipt. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleBulkDownloadReceipts = async () => {
    if (selectedPayments.size === 0) {
      toast({
        title: "No receipts selected",
        description: "Please select at least one payment to download receipts.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingReceipts(true);
    try {
      const selectedPaymentList = payments?.filter((p) =>
        selectedPayments.has(`${p.payment_source}-${p.payment_id}`)
      ) || [];

      for (const payment of selectedPaymentList) {
        try {
          const studentInfo = await fetchStudentInfo(payment.student_id, payment.student_application_id);

          const receiptRef = `RCP-${payment.payment_id.slice(0, 8).toUpperCase()}-${format(new Date(payment.payment_date), "yyyyMMdd")}`;

          await generateInvoicePDF({
            payment,
            studentName: studentInfo.name,
            studentEmail: studentInfo.email,
            studentPhone: studentInfo.phone,
            studentAddress: studentInfo.address,
            invoiceNumber: receiptRef,
            asReceipt: true,
            branding: {
              companyName: branding?.company_name,
              contactPhone: branding?.contact_phone,
              contactEmail: branding?.contact_email,
              contactAddress1: branding?.contact_address_line1,
              contactAddress2: branding?.contact_address_line2,
              contactAddress3: branding?.contact_address_line3,
              vatNumber: branding?.vat_number,
              companyNumber: branding?.company_number,
            },
          });

          // Small delay between downloads to prevent browser blocking
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Error generating receipt for payment ${payment.payment_id}:`, error);
          // Continue with next receipt even if one fails
        }
      }

      toast({
        title: "Receipts downloaded",
        description: `Successfully downloaded ${selectedPaymentList.length} receipt(s).`,
      });
      setSelectedPayments(new Set());
    } catch (error) {
      console.error("Error generating receipts:", error);
      toast({
        title: "Error",
        description: "Failed to generate some receipts. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingReceipts(false);
    }
  };

  const togglePaymentSelection = (paymentKey: string) => {
    const newSelection = new Set(selectedPayments);
    if (newSelection.has(paymentKey)) {
      newSelection.delete(paymentKey);
    } else {
      newSelection.add(paymentKey);
    }
    setSelectedPayments(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedPayments.size === (payments?.length || 0)) {
      setSelectedPayments(new Set());
    } else {
      const allKeys = new Set(payments?.map((p) => `${p.payment_source}-${p.payment_id}`) || []);
      setSelectedPayments(allKeys);
    }
  };

  const handleSyncPayments = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      // Get unique application IDs from current payments
      const applicationIds = new Set(
        payments?.map((p) => p.student_application_id).filter(Boolean) || []
      );

      if (applicationIds.size === 0) {
        toast({
          title: "No applications found",
          description: "No payment records found to sync from. Try syncing for a specific application.",
          variant: "destructive",
        });
        setIsSyncing(false);
        return;
      }

      let totalSynced = 0;
      const errors: Array<{ paymentIntentId: string; error: string }> = [];

      // Sync payments for each application
      for (const applicationId of Array.from(applicationIds)) {
        try {
          const { data, error } = await supabase.functions.invoke("sync-payment-from-stripe", {
            body: { applicationId },
          });

          if (error) {
            console.error(`Error syncing payments for ${applicationId}:`, error);
            errors.push({
              paymentIntentId: applicationId,
              error: error.message || "Unknown error",
            });
          } else if (data) {
            totalSynced += data.synced || 0;
            if (data.errors && data.errors.length > 0) {
              errors.push(...data.errors);
            }
          }
        } catch (err) {
          console.error(`Error calling sync function for ${applicationId}:`, err);
          errors.push({
            paymentIntentId: applicationId,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      setSyncResult({ synced: totalSynced, errors: errors.length > 0 ? errors : undefined });

      if (totalSynced > 0) {
        toast({
          title: "Payments synced",
          description: `Successfully synced ${totalSynced} payment(s) from Stripe.`,
        });
        // Refetch payments after a short delay
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        toast({
          title: "No payments to sync",
          description: errors.length > 0
            ? `Found ${errors.length} error(s). Check console for details.`
            : "All payments are already synced.",
        });
      }
    } catch (error) {
      console.error("Error syncing payments:", error);
      toast({
        title: "Error",
        description: "Failed to sync payments. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

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
              <div className="text-xl md:text-2xl font-bold">£{totalAmount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</div>
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
              <div className="text-xl md:text-2xl font-bold">{stripeCount}</div>
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
              <div className="text-xl md:text-2xl font-bold">{manualCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {manualCount > 0 ? `£${payments?.filter((p) => p.payment_source === "manual").reduce((sum, p) => sum + p.amount_paid, 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}` : "No entries"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide flex items-center gap-2">
              <Filter className="h-4 w-4 md:h-5 md:w-5" />
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

        {/* Sync Result Alert */}
        {syncResult && (
          <Card className="rounded-3xl border border-border/60">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                {syncResult.synced > 0 ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <p className="text-sm">
                      Successfully synced {syncResult.synced} payment(s) from Stripe.
                    </p>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      No payments to sync. All payments are already recorded.
                    </p>
                  </>
                )}
              </div>
              {syncResult.errors && syncResult.errors.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {syncResult.errors.length} error(s) occurred. Check console for details.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Payment List */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">Payment Records</CardTitle>
                <CardDescription>
                  All payment transactions sorted by date (newest first)
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={handleSyncPayments}
                  disabled={isSyncing}
                  variant="outline"
                  className="rounded-full uppercase tracking-wide gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                  {isSyncing ? "Syncing..." : "Sync Missing Payments"}
                </Button>
                {payments && payments.length > 0 && (
                  <>
                    {selectedPayments.size > 0 && (
                      <Button
                        onClick={handleBulkDownloadReceipts}
                        disabled={isGeneratingReceipts}
                        variant="outline"
                        className="rounded-full uppercase tracking-wide gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Download {selectedPayments.size} Receipt{selectedPayments.size !== 1 ? "s" : ""}
                      </Button>
                    )}
                    <Button
                      onClick={toggleSelectAll}
                      variant="ghost"
                      size="sm"
                      className="rounded-full"
                    >
                      {selectedPayments.size === payments.length ? "Deselect All" : "Select All"}
                    </Button>
                  </>
                )}
              </div>
            </div>
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
              <Tabs defaultValue="all" className="w-full">
                <TabsList className="grid w-full grid-cols-3 rounded-full bg-muted border border-border p-1 mb-4">
                  <TabsTrigger
                    value="all"
                    className="group rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                  >
                    All Payments
                    {allPayments.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-2 text-xs group-data-[state=active]:bg-primary-foreground/20 group-data-[state=active]:text-primary-foreground group-data-[state=active]:border-primary-foreground/30"
                      >
                        {allPayments.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="deposits"
                    className="group rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                  >
                    Deposits
                    {deposits.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-2 text-xs group-data-[state=active]:bg-primary-foreground/20 group-data-[state=active]:text-primary-foreground group-data-[state=active]:border-primary-foreground/30"
                      >
                        {deposits.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="installments"
                    className="group rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                  >
                    Installments
                    {installments.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-2 text-xs group-data-[state=active]:bg-primary-foreground/20 group-data-[state=active]:text-primary-foreground group-data-[state=active]:border-primary-foreground/30"
                      >
                        {installments.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="all" className="mt-4">
                  <PaymentList 
                    payments={allPayments} 
                    selectedPayments={selectedPayments}
                    togglePaymentSelection={togglePaymentSelection}
                    handleDownloadReceipt={handleDownloadReceipt}
                  />
                </TabsContent>
                
                <TabsContent value="deposits" className="mt-4">
                  {deposits.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No deposit payments found.
                    </div>
                  ) : (
                    <PaymentList 
                      payments={deposits} 
                      selectedPayments={selectedPayments}
                      togglePaymentSelection={togglePaymentSelection}
                      handleDownloadReceipt={handleDownloadReceipt}
                    />
                  )}
                </TabsContent>
                
                <TabsContent value="installments" className="mt-4">
                  {installments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No installment payments found.
                    </div>
                  ) : (
                    <PaymentList 
                      payments={installments} 
                      selectedPayments={selectedPayments}
                      togglePaymentSelection={togglePaymentSelection}
                      handleDownloadReceipt={handleDownloadReceipt}
                    />
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

// Payment List Component for reusability
type PaymentListProps = {
  payments: UnifiedPayment[];
  selectedPayments: Set<string>;
  togglePaymentSelection: (key: string) => void;
  handleDownloadReceipt: (payment: UnifiedPayment) => Promise<void>;
};

const PaymentList = ({ payments, selectedPayments, togglePaymentSelection, handleDownloadReceipt }: PaymentListProps) => {
  return (
    <div className="space-y-4">
      {payments.map((payment) => {
        const paymentKey = `${payment.payment_source}-${payment.payment_id}`;
        const isSelected = selectedPayments.has(paymentKey);
        return (
          <div
            key={paymentKey}
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-lg ${
              isSelected ? "bg-primary/5 border-primary" : ""
            }`}
          >
            <div className="flex items-start gap-3 flex-1">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => togglePaymentSelection(paymentKey)}
                className="mt-1"
              />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
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
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  payment.payment_status === "succeeded" || payment.payment_status === "completed"
                    ? "default"
                    : "outline"
                }
                className={
                  payment.payment_status === "succeeded" || payment.payment_status === "completed"
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : ""
                }
              >
                {payment.payment_status}
              </Badge>
              <Button
                onClick={() => handleDownloadReceipt(payment)}
                variant="ghost"
                size="sm"
                className="rounded-full gap-2"
              >
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Receipt</span>
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PaymentHistory;

