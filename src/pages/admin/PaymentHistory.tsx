import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  Download,
  Calendar,
  Filter,
  FileText,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Search,
  Trash,
  MoreVertical,
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { generateInvoicePDF } from "@/utils/invoicePdfGenerator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PaymentHistory = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedContract, setSelectedContract] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [searchByName, setSearchByName] = useState<string>("");
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set());
  const [isGeneratingReceipts, setIsGeneratingReceipts] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; errors?: Array<{ paymentIntentId: string; error: string }> } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<UnifiedPayment | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [activePaymentTab, setActivePaymentTab] = useState<string>("all");

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

  const [editingPayment, setEditingPayment] = useState<UnifiedPayment | null>(null);
  const [editAmount, setEditAmount] = useState<string>("");
  const [editPaymentDate, setEditPaymentDate] = useState<string>("");
  const [editReceiptNumber, setEditReceiptNumber] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [editPaymentMethod, setEditPaymentMethod] = useState<"cash" | "card" | "bank_transfer" | "cheque">("cash");

  const deleteManualPayment = useMutation({
    mutationFn: async (payment: UnifiedPayment) => {
      if (payment.payment_source !== "manual" || !payment.manual_entry_id) {
        throw new Error("Only manual payment records can be deleted here.");
      }

      const { error } = await supabase
        .from("manual_payments")
        .delete()
        .eq("id", payment.manual_entry_id);

      if (error) throw error;

      // If this manual payment was a deposit linked to an application,
      // clear the application's deposit flags so the UI reflects that
      // the deposit is no longer recorded.
      const isDeposit =
        !payment.installment_number &&
        (payment.payment_metadata?.type === "deposit" ||
          !payment.payment_metadata?.type ||
          payment.payment_metadata?.type !== "instalment");

      if (isDeposit && payment.student_application_id) {
        // Best-effort: do not block deletion if these follow-up updates fail.
        try {
          await supabase
            .from("student_applications")
            .update({ deposit_payment_intent_id: null })
            .eq("id", payment.student_application_id);

          const { data: step5 } = await supabase
            .from("student_application_steps")
            .select("id, payload")
            .eq("application_id", payment.student_application_id)
            .eq("step_number", 5)
            .maybeSingle();

          if (step5?.id && step5.payload && typeof step5.payload === "object") {
            const updatedPayload = {
              ...(step5.payload as Record<string, unknown>),
              deposit_paid: false,
            };

            await supabase
              .from("student_application_steps")
              .update({ payload: updatedPayload })
              .eq("id", step5.id);
          }
        } catch (followUpError) {
          console.warn("Failed to clear deposit flags after deleting manual payment:", followUpError);
        }
      }
    },
    onSuccess: (_data, payment) => {
      queryClient.invalidateQueries({ queryKey: ["all-payments"] });
      if (payment.student_application_id) {
        queryClient.invalidateQueries({ queryKey: ["unified-payments", payment.student_application_id] });
        queryClient.invalidateQueries({ queryKey: ["payment-summary", payment.student_application_id] });
        queryClient.invalidateQueries({ queryKey: ["installment-breakdown", payment.student_application_id] });
        queryClient.invalidateQueries({ queryKey: ["paid-instalment-ids", payment.student_application_id] });
      }

      toast({
        title: "Payment deleted",
        description: "The manual payment has been removed and balances have been updated.",
      });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Failed to delete payment. Please try again.";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  const bulkDeleteManualPayments = useMutation({
    mutationFn: async (paymentsToDelete: UnifiedPayment[]) => {
      const manualOnly = paymentsToDelete.filter(
        (p) => p.payment_source === "manual" && p.manual_entry_id
      );
      for (const payment of manualOnly) {
        const { error } = await supabase
          .from("manual_payments")
          .delete()
          .eq("id", payment.manual_entry_id);

        if (error) throw error;

        const isDeposit =
          !payment.installment_number &&
          (payment.payment_metadata?.type === "deposit" ||
            !payment.payment_metadata?.type ||
            payment.payment_metadata?.type !== "instalment");

        if (isDeposit && payment.student_application_id) {
          try {
            await supabase
              .from("student_applications")
              .update({ deposit_payment_intent_id: null })
              .eq("id", payment.student_application_id);

            const { data: step5 } = await supabase
              .from("student_application_steps")
              .select("id, payload")
              .eq("application_id", payment.student_application_id)
              .eq("step_number", 5)
              .maybeSingle();

            if (step5?.id && step5.payload && typeof step5.payload === "object") {
              await supabase
                .from("student_application_steps")
                .update({
                  payload: { ...(step5.payload as Record<string, unknown>), deposit_paid: false },
                })
                .eq("id", step5.id);
            }
          } catch (followUpError) {
            console.warn("Failed to clear deposit flags after deleting manual payment:", followUpError);
          }
        }
      }
      return manualOnly.length;
    },
    onSuccess: (deletedCount) => {
      queryClient.invalidateQueries({ queryKey: ["all-payments"] });
      queryClient.invalidateQueries({ queryKey: ["unified-payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment-summary"] });
      queryClient.invalidateQueries({ queryKey: ["installment-breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["paid-instalment-ids"] });
      setSelectedPayments(new Set());
      setBulkDeleteDialogOpen(false);
      toast({
        title: "Payments deleted",
        description: `${deletedCount} manual payment(s) have been removed.`,
      });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Failed to delete payments. Please try again.";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  const updateManualPayment = useMutation({
    mutationFn: async (variables: {
      id: string;
      amount: number;
      paymentDate: string;
      receiptNumber: string;
      notes: string;
      paymentMethod: "cash" | "card" | "bank_transfer" | "cheque";
      applicationId?: string;
    }) => {
      const { error } = await supabase
        .from("manual_payments")
        .update({
          amount: variables.amount,
          payment_date: variables.paymentDate,
          receipt_number: variables.receiptNumber || null,
          notes: variables.notes || null,
          payment_method: variables.paymentMethod,
        })
        .eq("id", variables.id);

      if (error) throw error;
      return variables;
    },
    onSuccess: (variables) => {
      queryClient.invalidateQueries({ queryKey: ["all-payments"] });
      if (variables.applicationId) {
        queryClient.invalidateQueries({ queryKey: ["unified-payments", variables.applicationId] });
        queryClient.invalidateQueries({ queryKey: ["payment-summary", variables.applicationId] });
        queryClient.invalidateQueries({ queryKey: ["installment-breakdown", variables.applicationId] });
        queryClient.invalidateQueries({ queryKey: ["paid-instalment-ids", variables.applicationId] });
      }

      toast({
        title: "Payment updated",
        description: "The manual payment has been updated and balances have been refreshed.",
      });
      setEditingPayment(null);
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Failed to update payment. Please try again.";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  // Client-side filter by student name; then split into deposits/installments
  const { filteredPayments, deposits, installments, allPayments } = useMemo(() => {
    if (!payments) return { filteredPayments: [], deposits: [], installments: [], allPayments: [] };
    const searchTrim = searchByName.trim().toLowerCase();
    const filtered = searchTrim
      ? payments.filter(
          (p) => (p.student_name?.trim().toLowerCase() ?? "").includes(searchTrim)
        )
      : payments;

    const depositsList = filtered.filter((payment) => {
      const isDeposit =
        !payment.installment_number &&
        (payment.payment_metadata?.type === "deposit" ||
          !payment.payment_metadata?.type ||
          payment.payment_metadata?.type !== "instalment");
      return isDeposit;
    });

    const installmentsList = filtered.filter(
      (payment) =>
        payment.installment_number !== null ||
        payment.payment_metadata?.type === "instalment"
    );

    return {
      filteredPayments: filtered,
      deposits: depositsList,
      installments: installmentsList,
      allPayments: filtered,
    };
  }, [payments, searchByName]);

  const exportToCSV = () => {
    if (!filteredPayments || filteredPayments.length === 0) return;

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

    const rows = filteredPayments.map((payment) => [
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

  /** Export payments as CSV in exact bulk-upload format (student_email, academic_year_name, amount, payment_date, payment_method, notes, instalment_sequence) */
  const exportToBulkUploadCSV = async (useSelected: boolean) => {
    const toExport =
      useSelected && selectedPayments.size > 0
        ? (filteredPayments ?? []).filter((p) =>
            selectedPayments.has(`${p.payment_source}-${p.payment_id}`)
          )
        : filteredPayments ?? [];
    if (toExport.length === 0) {
      toast({
        title: useSelected ? "No payments selected" : "No payments to export",
        description: useSelected
          ? "Select at least one payment or use “Download all”."
          : "No payment records match the current filters.",
        variant: "destructive",
      });
      return;
    }

    const uniqueStudentIds = [...new Set(toExport.map((p) => p.student_id).filter(Boolean))];
    let emailByStudentId: Record<string, string> = {};
    if (uniqueStudentIds.length > 0) {
      const { data: emailsData } = await supabase.functions.invoke("get-user-emails", {
        body: { userIds: uniqueStudentIds },
      });
      emailByStudentId = emailsData?.emails ?? {};
    }

    const manualIds = toExport
      .filter((p) => p.payment_source === "manual" && p.manual_entry_id)
      .map((p) => p.manual_entry_id as string);
    let paymentMethodByManualId: Record<string, string> = {};
    if (manualIds.length > 0) {
      const { data: manualRows } = await supabase
        .from("manual_payments")
        .select("id, payment_method")
        .in("id", manualIds);
      manualRows?.forEach((r: { id: string; payment_method: string }) => {
        paymentMethodByManualId[r.id] = r.payment_method ?? "bank_transfer";
      });
    }

    const headers = [
      "student_email",
      "academic_year_name",
      "amount",
      "payment_date",
      "payment_method",
      "notes",
      "instalment_sequence",
    ];
    const rows = toExport.map((p) => {
      const paymentDate =
        typeof p.payment_date === "string"
          ? p.payment_date.split("T")[0]
          : format(new Date(p.payment_date), "yyyy-MM-dd");
      const paymentMethod =
        p.payment_source === "manual" && p.manual_entry_id
          ? paymentMethodByManualId[p.manual_entry_id] ?? "bank_transfer"
          : "card";
      return [
        emailByStudentId[p.student_id] ?? "",
        p.academic_year_name ?? "",
        p.amount_paid.toFixed(2),
        paymentDate,
        paymentMethod,
        p.manual_entry_notes ?? "",
        p.installment_number != null ? String(p.installment_number) : "",
      ];
    });
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute(
      "download",
      `payment-records-bulk-format-${format(new Date(), "yyyy-MM-dd")}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({
      title: "CSV downloaded",
      description: `Exported ${toExport.length} payment(s) in bulk-upload format.`,
    });
  };

  const totalAmount = filteredPayments?.reduce((sum, p) => sum + p.amount_paid, 0) || 0;
  const stripeCount = filteredPayments?.filter((p) => p.payment_source === "stripe").length || 0;
  const manualCount = filteredPayments?.filter((p) => p.payment_source === "manual").length || 0;
  const stripeAmount = filteredPayments?.filter((p) => p.payment_source === "stripe").reduce((sum, p) => sum + p.amount_paid, 0) ?? 0;
  const manualAmount = filteredPayments?.filter((p) => p.payment_source === "manual").reduce((sum, p) => sum + p.amount_paid, 0) ?? 0;

  const selectedManualPayments = useMemo(() => {
    if (!payments || selectedPayments.size === 0) return [];
    return payments.filter(
      (p) =>
        selectedPayments.has(`${p.payment_source}-${p.payment_id}`) &&
        p.payment_source === "manual" &&
        p.manual_entry_id
    );
  }, [payments, selectedPayments]);
  const selectedManualCount = selectedManualPayments.length;

  const currentTabPayments = useMemo(() => {
    if (activePaymentTab === "deposits") return deposits;
    if (activePaymentTab === "installments") return installments;
    return allPayments;
  }, [activePaymentTab, deposits, installments, allPayments]);

  const allInCurrentTabSelected =
    currentTabPayments.length > 0 &&
    currentTabPayments.every((p) =>
      selectedPayments.has(`${p.payment_source}-${p.payment_id}`)
    );

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
    const tabKeys = new Set(
      currentTabPayments.map((p) => `${p.payment_source}-${p.payment_id}`)
    );
    if (allInCurrentTabSelected) {
      const newSelection = new Set(selectedPayments);
      tabKeys.forEach((k) => newSelection.delete(k));
      setSelectedPayments(newSelection);
    } else {
      const newSelection = new Set(selectedPayments);
      tabKeys.forEach((k) => newSelection.add(k));
      setSelectedPayments(newSelection);
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

  const handleEditManualPayment = async (payment: UnifiedPayment) => {
    if (payment.payment_source !== "manual") {
      toast({
        title: "Cannot edit payment",
        description: "Only manual payments can be edited here.",
        variant: "destructive",
      });
      return;
    }

    if (!payment.manual_entry_id) {
      toast({
        title: "Cannot edit payment",
        description: "This payment is not linked to a manual payment record.",
        variant: "destructive",
      });
      return;
    }

    const { data, error } = await supabase
      .from("manual_payments")
      .select("id, amount, payment_date, receipt_number, notes, payment_method")
      .eq("id", payment.manual_entry_id)
      .single();

    if (error || !data) {
      toast({
        title: "Error",
        description: "Failed to load payment details for editing.",
        variant: "destructive",
      });
      return;
    }

    setEditingPayment(payment);
    setEditAmount((Number(data.amount) || 0).toString());
    setEditPaymentDate(
      data.payment_date ? new Date(data.payment_date).toISOString().split("T")[0] : ""
    );
    setEditReceiptNumber(data.receipt_number ?? "");
    setEditNotes(data.notes ?? "");
    setEditPaymentMethod((data.payment_method as "cash" | "card" | "bank_transfer" | "cheque") || "cash");
  };

  const handleSaveEdit = () => {
    if (!editingPayment || !editingPayment.manual_entry_id) return;

    const parsedAmount = parseFloat(editAmount);
    if (!editAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid payment amount.",
        variant: "destructive",
      });
      return;
    }

    if (!editPaymentDate) {
      toast({
        title: "Payment date required",
        description: "Please select a payment date.",
        variant: "destructive",
      });
      return;
    }

    updateManualPayment.mutate({
      id: editingPayment.manual_entry_id,
      amount: parsedAmount,
      paymentDate: editPaymentDate,
      receiptNumber: editReceiptNumber.trim(),
      notes: editNotes.trim(),
      paymentMethod: editPaymentMethod,
      applicationId: editingPayment.student_application_id,
    });
  };

  const handleDeleteManualPayment = (payment: UnifiedPayment) => {
    if (payment.payment_source !== "manual") {
      toast({
        title: "Cannot delete payment",
        description: "Stripe payments cannot be deleted from this screen.",
        variant: "destructive",
      });
      return;
    }

    if (!payment.manual_entry_id) {
      toast({
        title: "Cannot delete payment",
        description: "This payment is not linked to a manual payment record.",
        variant: "destructive",
      });
      return;
    }

    setPaymentToDelete(payment);
    setDeleteDialogOpen(true);
  };

  return (
    <AdminLayout
      pageTitle="Payment History"
      subtitle="View all payment records (Stripe and manual entries)"
      mobileActionButton={
        <div className="flex items-center gap-2">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger id="year-mobile" className="h-9 w-[140px] rounded-full">
              <SelectValue placeholder="Academic Year" />
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
          <Button
            size="sm"
            variant="outline"
            className="rounded-full p-2 h-9 w-9 flex-shrink-0"
            onClick={exportToCSV}
            disabled={!filteredPayments || filteredPayments.length === 0}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="hidden lg:flex items-center justify-end gap-3">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger id="year-header" className="w-[180px] rounded-full">
              <SelectValue placeholder="Academic Year" />
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                disabled={!filteredPayments || filteredPayments.length === 0}
                className="rounded-full uppercase tracking-wide gap-2"
              >
                <Download className="h-4 w-4" />
                Download CSV
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportToCSV()}>
                Report format (all filtered)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => exportToBulkUploadCSV(true)}
                disabled={selectedPayments.size === 0}
              >
                Re-upload format (selected)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportToBulkUploadCSV(false)}>
                Re-upload format (all filtered)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
                {filteredPayments?.length || 0} payment{filteredPayments?.length !== 1 ? "s" : ""}
                {searchByName.trim() ? " (filtered)" : ""}
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
                {stripeCount > 0 ? `£${stripeAmount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}` : "No payments"}
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
                {manualCount > 0 ? `£${manualAmount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}` : "No entries"}
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
              <div className="space-y-2 lg:col-span-2 md:col-span-2">
                <Label htmlFor="searchByName">Search by student name</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="searchByName"
                    type="text"
                    placeholder="e.g. John Smith"
                    value={searchByName}
                    onChange={(e) => setSearchByName(e.target.value)}
                    className="pl-9 rounded-full"
                  />
                </div>
              </div>
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
                {filteredPayments && filteredPayments.length > 0 && (
                  <>
                    {selectedPayments.size > 0 && (
                      <>
                        <Button
                          onClick={handleBulkDownloadReceipts}
                          disabled={isGeneratingReceipts}
                          variant="outline"
                          className="rounded-full uppercase tracking-wide gap-2"
                        >
                          <Download className="h-4 w-4" />
                          Download {selectedPayments.size} Receipt{selectedPayments.size !== 1 ? "s" : ""}
                        </Button>
                        {selectedManualCount > 0 && (
                          <Button
                            onClick={() => setBulkDeleteDialogOpen(true)}
                            disabled={bulkDeleteManualPayments.isPending}
                            variant="outline"
                            className="rounded-full uppercase tracking-wide gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash className="h-4 w-4" />
                            Bulk delete ({selectedManualCount})
                          </Button>
                        )}
                      </>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          className="rounded-full uppercase tracking-wide gap-2"
                          disabled={!filteredPayments || filteredPayments.length === 0}
                        >
                          <Download className="h-4 w-4" />
                          Download CSV
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => exportToCSV()}>
                          Report format (all filtered)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => exportToBulkUploadCSV(true)}
                          disabled={selectedPayments.size === 0}
                        >
                          Re-upload format (selected)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportToBulkUploadCSV(false)}>
                          Re-upload format (all filtered)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      onClick={toggleSelectAll}
                      variant="ghost"
                      size="sm"
                      className="rounded-full"
                    >
                      {allInCurrentTabSelected ? "Deselect all in tab" : "Select all in tab"}
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
            ) : filteredPayments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No payments match &quot;{searchByName.trim()}&quot;. Try a different name or clear the search.
              </div>
            ) : (
              <Tabs
                value={activePaymentTab}
                onValueChange={setActivePaymentTab}
                className="w-full"
              >
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
                    handleDeleteManualPayment={handleDeleteManualPayment}
                    handleEditManualPayment={handleEditManualPayment}
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
                      handleDeleteManualPayment={handleDeleteManualPayment}
                      handleEditManualPayment={handleEditManualPayment}
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
                      handleDeleteManualPayment={handleDeleteManualPayment}
                      handleEditManualPayment={handleEditManualPayment}
                    />
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={!!editingPayment}
        onOpenChange={(open) => {
          if (!open) {
            setEditingPayment(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-display uppercase tracking-wide">
              Edit Manual Payment
            </DialogTitle>
            <DialogDescription>
              Update the amount, date, method or notes for this manual payment. Changes will
              recalculate the student&apos;s installment balances.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label htmlFor="edit-amount">Amount (£)</Label>
              <Input
                id="edit-amount"
                type="number"
                step="0.01"
                min="0"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="rounded-full"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-date">Payment date</Label>
              <Input
                id="edit-date"
                type="date"
                value={editPaymentDate}
                onChange={(e) => setEditPaymentDate(e.target.value)}
                className="rounded-full"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-method">Payment method</Label>
              <Select
                value={editPaymentMethod}
                onValueChange={(value) =>
                  setEditPaymentMethod(value as "cash" | "card" | "bank_transfer" | "cheque")
                }
              >
                <SelectTrigger id="edit-method" className="rounded-full">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-receipt">Receipt number (optional)</Label>
              <Input
                id="edit-receipt"
                value={editReceiptNumber}
                onChange={(e) => setEditReceiptNumber(e.target.value)}
                className="rounded-full"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-notes">Notes (optional)</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="min-h-[60px] resize-none"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingPayment(null)}
              className="rounded-full uppercase tracking-wide"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateManualPayment.isPending}
              className="rounded-full uppercase tracking-wide"
            >
              {updateManualPayment.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setPaymentToDelete(null);
          }
        }}
      >
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
              Delete Manual Payment
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs md:text-sm">
              Are you sure you want to delete this manual payment? This will update the student&apos;s installment balances and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-full text-xs md:text-sm">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!paymentToDelete) return;
                deleteManualPayment.mutate(paymentToDelete);
              }}
              disabled={deleteManualPayment.isPending}
              className="rounded-full bg-destructive hover:bg-destructive/90 text-xs md:text-sm"
            >
              {deleteManualPayment.isPending ? "Deleting..." : "Delete payment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={(open) => {
          setBulkDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
              Bulk delete manual payments
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs md:text-sm">
              Are you sure you want to delete {selectedManualCount} manual payment(s)? This will update students&apos; installment balances and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-full text-xs md:text-sm">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteManualPayments.mutate(selectedManualPayments)}
              disabled={bulkDeleteManualPayments.isPending}
              className="rounded-full bg-destructive hover:bg-destructive/90 text-xs md:text-sm"
            >
              {bulkDeleteManualPayments.isPending ? "Deleting..." : `Delete ${selectedManualCount} payment(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

// Payment List Component for reusability
type PaymentListProps = {
  payments: UnifiedPayment[];
  selectedPayments: Set<string>;
  togglePaymentSelection: (key: string) => void;
  handleDownloadReceipt: (payment: UnifiedPayment) => Promise<void>;
  handleDeleteManualPayment: (payment: UnifiedPayment) => void;
  handleEditManualPayment: (payment: UnifiedPayment) => void;
};

const PaymentList = ({
  payments,
  selectedPayments,
  togglePaymentSelection,
  handleDownloadReceipt,
  handleDeleteManualPayment,
  handleEditManualPayment,
}: PaymentListProps) => {
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
              <div className="flex-1 space-y-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-foreground">
                    {payment.student_name?.trim() || "Unknown student"}
                  </span>
                  {(payment.studio_number != null || payment.studio_grade) && (
                    <span className="text-xs text-muted-foreground">
                      {[payment.studio_number, payment.studio_grade].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  <Link
                    to={`/admin/applications/${payment.student_application_id}`}
                    className="text-xs text-primary hover:underline truncate max-w-[180px] inline-block"
                  >
                    Application
                  </Link>
                </div>
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
                  {payment.installment_number != null && (
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full p-1"
                    aria-label="Payment actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => handleDownloadReceipt(payment)}>
                    <FileText className="mr-2 h-4 w-4" />
                    Download receipt
                  </DropdownMenuItem>
                  {payment.payment_source === "manual" && (
                    <>
                      <DropdownMenuItem onClick={() => handleEditManualPayment(payment)}>
                        Edit manual payment
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDeleteManualPayment(payment)}
                        className="text-red-600 focus:text-red-700"
                      >
                        <Trash className="mr-2 h-4 w-4" />
                        Delete manual payment
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PaymentHistory;

