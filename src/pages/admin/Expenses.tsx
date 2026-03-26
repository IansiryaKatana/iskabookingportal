import { useState, useMemo, useRef } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  useUtilityPayments,
  useCreateUtilityPayment,
  useUpdateUtilityPayment,
  useDeleteUtilityPayment,
} from "@/hooks/useUtilityPayments";
import { useAdminAcademicYears } from "@/hooks/useAdminAcademicYears";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { AcademicYearSelector } from "@/components/admin/AcademicYearSelector";
import { Receipt, Plus, Edit, Trash2, Download, Filter, Loader2, Image as ImageIcon, X } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const Expenses = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<string | null>(null);
  const [academicYearFilter, setAcademicYearFilter] = useState<string | undefined>(undefined);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [startDateFilter, setStartDateFilter] = useState<string>("");
  const [endDateFilter, setEndDateFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: academicYears } = useAdminAcademicYears();
  const deleteExpense = useDeleteUtilityPayment();

  const filters = useMemo(() => ({
    academicYearId: academicYearFilter,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    startDate: startDateFilter || undefined,
    endDate: endDateFilter || undefined,
  }), [academicYearFilter, categoryFilter, startDateFilter, endDateFilter]);

  const { data: expenses, isLoading } = useUtilityPayments(filters);
  const createExpense = useCreateUtilityPayment();
  const updateExpense = useUpdateUtilityPayment();

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    if (!searchQuery.trim()) return expenses;
    const query = searchQuery.toLowerCase();
    return expenses.filter(
      (exp) =>
        exp.description.toLowerCase().includes(query) ||
        exp.vendor_name?.toLowerCase().includes(query) ||
        exp.invoice_number?.toLowerCase().includes(query),
    );
  }, [expenses, searchQuery]);

  const stats = useMemo(() => {
    if (!expenses) return { total: 0, totalAmount: 0, byCategory: {} };
    const total = expenses.length;
    const totalAmount = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
    const byCategory: Record<string, number> = {};
    expenses.forEach((exp) => {
      byCategory[exp.expense_category] = (byCategory[exp.expense_category] || 0) + Number(exp.amount);
    });
    return { total, totalAmount, byCategory };
  }, [expenses]);

  const [formData, setFormData] = useState({
    academic_year_id: "",
    expense_category: "other" as "electricity" | "water" | "gas" | "internet" | "maintenance" | "cleaning" | "insurance" | "property_tax" | "other",
    description: "",
    amount: "",
    payment_date: new Date().toISOString().split("T")[0],
    vendor_name: "",
    invoice_number: "",
    notes: "",
  });

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      electricity: "Electricity",
      water: "Water",
      gas: "Gas",
      internet: "Internet",
      maintenance: "Maintenance",
      cleaning: "Cleaning",
      insurance: "Insurance",
      property_tax: "Property Tax",
      other: "Other",
    };
    return labels[category] || category;
  };

  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Please upload an image or PDF file.",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Please upload files smaller than 10MB.",
      });
      return;
    }

    if (file.type.startsWith("image/")) {
      const preview = URL.createObjectURL(file);
      setReceiptPreview(preview);
    }
    setReceiptFile(file);
    e.target.value = "";
  };

  const handleSubmit = async (isEdit = false) => {
    if (!user) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please sign in to create expenses.",
      });
      return;
    }

    if (!formData.academic_year_id || !formData.description.trim() || !formData.amount) {
      toast({
        variant: "destructive",
        title: "Validation error",
        description: "Please fill in all required fields.",
      });
      return;
    }

    try {
      // Upload receipt if provided
      let receiptPath: string | undefined;
      if (receiptFile) {
        setUploadingReceipt(true);
        const extension = receiptFile.name.split(".").pop() || "pdf";
        const path = `${formData.academic_year_id}/${formData.expense_category}/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from("expense-receipts")
          .upload(path, receiptFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          throw uploadError;
        }

        receiptPath = path;
        setUploadingReceipt(false);
      }

      const expenseData: any = {
        academic_year_id: formData.academic_year_id,
        expense_category: formData.expense_category,
        description: formData.description.trim(),
        amount: parseFloat(formData.amount),
        payment_date: formData.payment_date,
        vendor_name: formData.vendor_name.trim() || null,
        invoice_number: formData.invoice_number.trim() || null,
        notes: formData.notes.trim() || null,
        receipt_path: receiptPath || null,
        created_by: user.id,
      };

      if (isEdit && selectedExpense) {
        expenseData.updated_by = user.id;
        await updateExpense.mutateAsync({
          id: selectedExpense,
          updates: expenseData,
        });
        toast({
          title: "Expense updated",
          description: "The expense has been updated successfully.",
        });
      } else {
        await createExpense.mutateAsync(expenseData);
        toast({
          title: "Expense created",
          description: "The expense has been recorded successfully.",
        });
      }

      // Reset form
      setFormData({
        academic_year_id: "",
        expense_category: "other",
        description: "",
        amount: "",
        payment_date: new Date().toISOString().split("T")[0],
        vendor_name: "",
        invoice_number: "",
        notes: "",
      });
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
      setReceiptPreview(null);
      setReceiptFile(null);
      setCreateDialogOpen(false);
      setEditDialogOpen(false);
      setSelectedExpense(null);
    } catch (error: any) {
      console.error("Error saving expense:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save expense. Please try again.",
      });
      setUploadingReceipt(false);
    }
  };

  const handleEdit = (expenseId: string) => {
    const expense = expenses?.find((e) => e.id === expenseId);
    if (!expense) return;

    setSelectedExpense(expenseId);
    setFormData({
      academic_year_id: expense.academic_year_id,
      expense_category: expense.expense_category as any,
      description: expense.description,
      amount: expense.amount.toString(),
      payment_date: expense.payment_date,
      vendor_name: expense.vendor_name || "",
      invoice_number: expense.invoice_number || "",
      notes: expense.notes || "",
    });
    setEditDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedExpense) return;

    try {
      await deleteExpense.mutateAsync(selectedExpense);
      toast({
        title: "Expense deleted",
        description: "The expense has been deleted successfully.",
      });
      setDeleteDialogOpen(false);
      setSelectedExpense(null);
    } catch (error: any) {
      console.error("Error deleting expense:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete expense. Please try again.",
      });
    }
  };

  const exportToCSV = () => {
    if (!filteredExpenses || filteredExpenses.length === 0) {
      toast({
        variant: "destructive",
        title: "No data",
        description: "No expenses to export.",
      });
      return;
    }

    const headers = [
      "Date",
      "Category",
      "Description",
      "Amount",
      "Vendor",
      "Invoice Number",
      "Academic Year",
      "Notes",
    ];

    const rows = filteredExpenses.map((exp) => [
      format(new Date(exp.payment_date), "yyyy-MM-dd"),
      getCategoryLabel(exp.expense_category),
      exp.description,
      exp.amount.toString(),
      exp.vendor_name || "",
      exp.invoice_number || "",
      exp.academic_year?.name || "",
      exp.notes || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `expenses_${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Report exported",
      description: "Successfully exported expenses to CSV.",
    });
  };

  const ExpensesSkeleton = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="rounded-3xl">
            <CardContent className="p-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="rounded-3xl">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  );

  if (isLoading) {
    return (
      <AdminLayout pageTitle="Expenses" subtitle="Track utility and expense payments">
        <ExpensesSkeleton />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout pageTitle="Expenses" subtitle="Track utility and expense payments per academic year">
      <div className="space-y-6">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Total Expenses</div>
              <div className="text-xl md:text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Total Amount</div>
              <div className="text-xl md:text-2xl font-bold">£{stats.totalAmount.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Categories</div>
              <div className="text-xl md:text-2xl font-bold">{Object.keys(stats.byCategory).length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg font-display font-bold uppercase tracking-wide">
                <Filter className="h-4 w-4 md:h-5 md:w-5" />
                Filters
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={exportToCSV}
                  className="rounded-full gap-2 text-xs md:text-sm"
                >
                  <Download className="h-3 w-3 md:h-4 md:w-4" />
                  <span className="hidden sm:inline">Export CSV</span>
                  <span className="sm:hidden">Export</span>
                </Button>
                <Button
                  onClick={() => {
                    setFormData({
                      academic_year_id: academicYearFilter || "",
                      expense_category: "other",
                      description: "",
                      amount: "",
                      payment_date: new Date().toISOString().split("T")[0],
                      vendor_name: "",
                      invoice_number: "",
                      notes: "",
                    });
                    setCreateDialogOpen(true);
                  }}
                  className="rounded-full uppercase tracking-wide gap-2 text-xs md:text-sm"
                >
                  <Plus className="h-3 w-3 md:h-4 md:w-4" />
                  <span className="hidden sm:inline">New Expense</span>
                  <span className="sm:hidden">New</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <Input
                  placeholder="Search expenses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-full text-sm md:text-base"
                />
              </div>
              <div>
                <AcademicYearSelector
                  value={academicYearFilter}
                  onValueChange={setAcademicYearFilter}
                  allowEmpty
                />
              </div>
              <div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="rounded-full text-sm md:text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="electricity">Electricity</SelectItem>
                    <SelectItem value="water">Water</SelectItem>
                    <SelectItem value="gas">Gas</SelectItem>
                    <SelectItem value="internet">Internet</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="cleaning">Cleaning</SelectItem>
                    <SelectItem value="insurance">Insurance</SelectItem>
                    <SelectItem value="property_tax">Property Tax</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Input
                  type="date"
                  value={startDateFilter}
                  onChange={(e) => setStartDateFilter(e.target.value)}
                  className="rounded-full text-sm md:text-base"
                />
              </div>
              <div>
                <Input
                  type="date"
                  value={endDateFilter}
                  onChange={(e) => setEndDateFilter(e.target.value)}
                  className="rounded-full text-sm md:text-base"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expenses List */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">All Expenses</CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {filteredExpenses.length} expense{filteredExpenses.length !== 1 ? "s" : ""} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredExpenses.length === 0 ? (
              <div className="text-center py-12">
                <Receipt className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-base md:text-lg font-semibold mb-2">No expenses found</h3>
                <p className="text-xs md:text-sm text-muted-foreground mb-4">
                  {searchQuery || categoryFilter !== "all" || academicYearFilter
                    ? "Try adjusting your filters."
                    : "No expenses have been recorded yet."}
                </p>
                <Button
                  onClick={() => setCreateDialogOpen(true)}
                  className="rounded-full uppercase tracking-wide gap-2 text-xs md:text-sm"
                >
                  <Plus className="h-3 w-3 md:h-4 md:w-4" />
                  Create First Expense
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs md:text-sm">Date</TableHead>
                      <TableHead className="text-xs md:text-sm">Category</TableHead>
                      <TableHead className="text-xs md:text-sm">Description</TableHead>
                      <TableHead className="text-right text-xs md:text-sm">Amount</TableHead>
                      <TableHead className="text-xs md:text-sm">Vendor</TableHead>
                      <TableHead className="text-xs md:text-sm">Academic Year</TableHead>
                      <TableHead className="text-right text-xs md:text-sm">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell className="text-xs md:text-sm">{format(new Date(expense.payment_date), "MMM d, yyyy")}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="rounded-full text-[10px] md:text-xs">
                            {getCategoryLabel(expense.expense_category)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate text-xs md:text-sm">{expense.description}</TableCell>
                        <TableCell className="text-right font-semibold text-xs md:text-sm">£{Number(expense.amount).toFixed(2)}</TableCell>
                        <TableCell className="text-xs md:text-sm">{expense.vendor_name || "—"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{expense.academic_year?.name || "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(expense.id)}
                              className="rounded-full h-7 w-7 md:h-8 md:w-8 p-0"
                            >
                              <Edit className="h-3 w-3 md:h-4 md:w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedExpense(expense.id);
                                setDeleteDialogOpen(true);
                              }}
                              className="rounded-full text-destructive hover:text-destructive h-7 w-7 md:h-8 md:w-8 p-0"
                            >
                              <Trash2 className="h-3 w-3 md:h-4 md:w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create/Edit Expense Sheet */}
        <Sheet open={createDialogOpen || editDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setCreateDialogOpen(false);
            setEditDialogOpen(false);
            setSelectedExpense(null);
            if (receiptPreview) URL.revokeObjectURL(receiptPreview);
            setReceiptPreview(null);
            setReceiptFile(null);
          }
        }}>
          <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl border-0 p-0">
            <div className="h-full overflow-y-auto p-6 md:p-8">
            <SheetHeader>
              <SheetTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">{editDialogOpen ? "Edit Expense" : "Create Expense"}</SheetTitle>
              <SheetDescription className="text-xs md:text-sm">
                {editDialogOpen ? "Update expense details" : "Record a new utility or expense payment"}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="academic_year_id" className="text-xs md:text-sm">Academic Year *</Label>
                <AcademicYearSelector
                  value={formData.academic_year_id}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, academic_year_id: value || "" }))}
                  allowEmpty={false}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expense_category" className="text-xs md:text-sm">Category *</Label>
                <Select
                  value={formData.expense_category}
                  onValueChange={(value: any) => setFormData((prev) => ({ ...prev, expense_category: value }))}
                >
                  <SelectTrigger id="expense_category" className="rounded-full text-sm md:text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="electricity">Electricity</SelectItem>
                    <SelectItem value="water">Water</SelectItem>
                    <SelectItem value="gas">Gas</SelectItem>
                    <SelectItem value="internet">Internet</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="cleaning">Cleaning</SelectItem>
                    <SelectItem value="insurance">Insurance</SelectItem>
                    <SelectItem value="property_tax">Property Tax</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-xs md:text-sm">Description *</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of the expense"
                  className="rounded-full text-sm md:text-base"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount" className="text-xs md:text-sm">Amount (£) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                    placeholder="0.00"
                    className="rounded-full text-sm md:text-base"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment_date" className="text-xs md:text-sm">Payment Date *</Label>
                  <Input
                    id="payment_date"
                    type="date"
                    value={formData.payment_date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, payment_date: e.target.value }))}
                    className="rounded-full text-sm md:text-base"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vendor_name" className="text-xs md:text-sm">Vendor Name (Optional)</Label>
                  <Input
                    id="vendor_name"
                    value={formData.vendor_name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, vendor_name: e.target.value }))}
                    placeholder="Vendor/Supplier name"
                    className="rounded-full text-sm md:text-base"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invoice_number" className="text-xs md:text-sm">Invoice Number (Optional)</Label>
                  <Input
                    id="invoice_number"
                    value={formData.invoice_number}
                    onChange={(e) => setFormData((prev) => ({ ...prev, invoice_number: e.target.value }))}
                    placeholder="Invoice/Receipt number"
                    className="rounded-full text-sm md:text-base"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="text-xs md:text-sm">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes about this expense..."
                  rows={3}
                  className="rounded-2xl text-sm md:text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="receipt" className="text-xs md:text-sm">Receipt/Invoice (Optional)</Label>
                <div className="space-y-3">
                  {receiptPreview && (
                    <div className="relative w-full h-32 md:h-48 rounded-lg overflow-hidden border border-border/60">
                      <img
                        src={receiptPreview}
                        alt="Receipt preview"
                        className="w-full h-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          URL.revokeObjectURL(receiptPreview);
                          setReceiptPreview(null);
                          setReceiptFile(null);
                        }}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <X className="h-3 w-3 md:h-4 md:w-4" />
                      </button>
                    </div>
                  )}
                  {!receiptPreview && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={handleReceiptUpload}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full rounded-full gap-2 text-xs md:text-sm"
                      >
                        <ImageIcon className="h-3 w-3 md:h-4 md:w-4" />
                        Upload Receipt/Invoice
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
            <SheetFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCreateDialogOpen(false);
                  setEditDialogOpen(false);
                  setSelectedExpense(null);
                  if (receiptPreview) URL.revokeObjectURL(receiptPreview);
                  setReceiptPreview(null);
                  setReceiptFile(null);
                }}
                className="rounded-full text-xs md:text-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleSubmit(editDialogOpen)}
                disabled={createExpense.isPending || updateExpense.isPending || uploadingReceipt}
                className="rounded-full uppercase tracking-wide gap-2 text-xs md:text-sm"
              >
                {createExpense.isPending || updateExpense.isPending || uploadingReceipt ? (
                  <>
                    <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" />
                    Saving...
                  </>
                ) : editDialogOpen ? (
                  "Update Expense"
                ) : (
                  <>
                    <Plus className="h-3 w-3 md:h-4 md:w-4" />
                    Create Expense
                  </>
                )}
              </Button>
            </SheetFooter>
            </div>
          </SheetContent>
        </Sheet>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">Delete Expense</AlertDialogTitle>
              <AlertDialogDescription className="text-xs md:text-sm">
                Are you sure you want to delete this expense? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="rounded-full text-xs md:text-sm">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleteExpense.isPending}
                className="rounded-full bg-destructive hover:bg-destructive/90 text-xs md:text-sm"
              >
                {deleteExpense.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
};

export default Expenses;

