import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Edit, Loader2, Plus, Receipt, Trash2, Download } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useOTABookings } from "@/hooks/useOTABookings";
import {
  useCreateOTAExpense,
  useDeleteOTAExpense,
  useOTAExpenses,
  useUpdateOTAExpense,
} from "@/hooks/useOTAExpenses";

type OTAExpenseCategory = "commission" | "cleaning" | "maintenance" | "supplies" | "tax" | "refund" | "other";
type OTAChannel = "airbnb" | "booking" | "agoda" | "expedia" | "other";

const OTAExpensesPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [formData, setFormData] = useState({
    ota_booking_id: "none",
    channel: "none",
    expense_category: "other" as OTAExpenseCategory,
    description: "",
    amount: "",
    expense_date: new Date().toISOString().split("T")[0],
    vendor_name: "",
    invoice_number: "",
    notes: "",
  });

  const filters = useMemo(
    () => ({
      channel: channelFilter !== "all" ? channelFilter : undefined,
      category: categoryFilter !== "all" ? categoryFilter : undefined,
      startDate: startDateFilter || undefined,
      endDate: endDateFilter || undefined,
    }),
    [channelFilter, categoryFilter, startDateFilter, endDateFilter],
  );

  const { data: expenses, isLoading } = useOTAExpenses(filters);
  const { data: otaBookings } = useOTABookings();
  const createExpense = useCreateOTAExpense();
  const updateExpense = useUpdateOTAExpense();
  const deleteExpense = useDeleteOTAExpense();

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      commission: "Commission",
      cleaning: "Cleaning",
      maintenance: "Maintenance",
      supplies: "Supplies",
      tax: "Tax",
      refund: "Refund",
      other: "Other",
    };
    return labels[category] || category;
  };

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    if (!searchQuery.trim()) return expenses;
    const query = searchQuery.toLowerCase();
    return expenses.filter(
      (expense) =>
        expense.description.toLowerCase().includes(query) ||
        expense.vendor_name?.toLowerCase().includes(query) ||
        expense.invoice_number?.toLowerCase().includes(query) ||
        expense.ota_booking?.external_ref?.toLowerCase().includes(query),
    );
  }, [expenses, searchQuery]);

  const stats = useMemo(() => {
    if (!expenses) return { total: 0, totalAmount: 0, byCategory: {} as Record<string, number> };
    const total = expenses.length;
    const totalAmount = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const byCategory: Record<string, number> = {};
    expenses.forEach((e) => {
      byCategory[e.expense_category] = (byCategory[e.expense_category] || 0) + Number(e.amount || 0);
    });
    return { total, totalAmount, byCategory };
  }, [expenses]);

  const resetForm = () => {
    setFormData({
      ota_booking_id: "none",
      channel: "none",
      expense_category: "other",
      description: "",
      amount: "",
      expense_date: new Date().toISOString().split("T")[0],
      vendor_name: "",
      invoice_number: "",
      notes: "",
    });
    setEditExpenseId(null);
    setFormOpen(false);
  };

  const handleSubmit = async () => {
    if (!user) {
      toast({ variant: "destructive", title: "Error", description: "Please sign in and try again." });
      return;
    }
    if (!formData.description.trim() || !formData.amount || !formData.expense_date) {
      toast({ variant: "destructive", title: "Validation error", description: "Please fill all required fields." });
      return;
    }

    const payload = {
      ota_booking_id: formData.ota_booking_id === "none" ? null : formData.ota_booking_id,
      channel: formData.channel === "none" ? null : (formData.channel as OTAChannel),
      expense_category: formData.expense_category,
      description: formData.description.trim(),
      amount: Number(formData.amount),
      expense_date: formData.expense_date,
      vendor_name: formData.vendor_name.trim() || null,
      invoice_number: formData.invoice_number.trim() || null,
      notes: formData.notes.trim() || null,
    };

    try {
      if (editExpenseId) {
        await updateExpense.mutateAsync({
          id: editExpenseId,
          updates: { ...payload, updated_by: user.id },
        });
        toast({ title: "OTA expense updated", description: "Expense was updated successfully." });
      } else {
        await createExpense.mutateAsync({ ...payload, created_by: user.id });
        toast({ title: "OTA expense created", description: "Expense was created successfully." });
      }
      resetForm();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save OTA expense.",
      });
    }
  };

  const handleEdit = (expenseId: string) => {
    const expense = expenses?.find((e) => e.id === expenseId);
    if (!expense) return;
    setEditExpenseId(expenseId);
    setFormData({
      ota_booking_id: expense.ota_booking_id || "none",
      channel: expense.channel || "none",
      expense_category: expense.expense_category,
      description: expense.description,
      amount: Number(expense.amount).toString(),
      expense_date: expense.expense_date,
      vendor_name: expense.vendor_name || "",
      invoice_number: expense.invoice_number || "",
      notes: expense.notes || "",
    });
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteExpenseId) return;
    try {
      await deleteExpense.mutateAsync(deleteExpenseId);
      toast({ title: "OTA expense deleted", description: "Expense was deleted successfully." });
      setDeleteExpenseId(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Delete failed." });
    }
  };

  const exportToCSV = () => {
    if (filteredExpenses.length === 0) {
      toast({ variant: "destructive", title: "No data", description: "No OTA expenses to export." });
      return;
    }
    const headers = ["Date", "Category", "Description", "Amount", "Channel", "Booking Ref", "Vendor", "Invoice", "Notes"];
    const rows = filteredExpenses.map((e) => [
      format(new Date(e.expense_date), "yyyy-MM-dd"),
      getCategoryLabel(e.expense_category),
      e.description,
      e.amount.toString(),
      e.channel || "",
      e.ota_booking?.external_ref || "",
      e.vendor_name || "",
      e.invoice_number || "",
      e.notes || "",
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ota_expenses_${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading && !expenses) {
    return (
      <AdminLayout pageTitle="OTA Expenses" subtitle="Track operational OTA costs">
        <Card className="rounded-3xl">
          <CardContent className="p-6">
            <Skeleton className="h-8 w-40 mb-4" />
            <Skeleton className="h-60 w-full" />
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout pageTitle="OTA Expenses" subtitle="Track and manage OTA-related expenses">
      <div className="space-y-6">
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

        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-end space-y-0 pb-4">
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={exportToCSV} className="rounded-md gap-2 text-xs md:text-sm">
                  <Download className="h-3 w-3 md:h-4 md:w-4" />
                  Export
                </Button>
                <Button
                  onClick={() => {
                    setEditExpenseId(null);
                    setFormOpen(true);
                  }}
                  className="rounded-md uppercase tracking-wide gap-2 text-xs md:text-sm"
                >
                  <Plus className="h-3 w-3 md:h-4 md:w-4" />
                  New OTA Expense
                </Button>
              </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Input
                placeholder="Search expenses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-md text-sm md:text-base"
              />
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="rounded-md text-sm md:text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  <SelectItem value="airbnb">Airbnb</SelectItem>
                  <SelectItem value="booking">Booking.com</SelectItem>
                  <SelectItem value="agoda">Agoda</SelectItem>
                  <SelectItem value="expedia">Expedia</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="rounded-md text-sm md:text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="commission">Commission</SelectItem>
                  <SelectItem value="cleaning">Cleaning</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="supplies">Supplies</SelectItem>
                  <SelectItem value="tax">Tax</SelectItem>
                  <SelectItem value="refund">Refund</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Input type="date" value={startDateFilter} onChange={(e) => setStartDateFilter(e.target.value)} className="rounded-md text-sm md:text-base" />
              <Input type="date" value={endDateFilter} onChange={(e) => setEndDateFilter(e.target.value)} className="rounded-md text-sm md:text-base" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">All OTA Expenses</CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {filteredExpenses.length} expense{filteredExpenses.length !== 1 ? "s" : ""} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredExpenses.length === 0 ? (
              <div className="text-center py-12">
                <Receipt className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-base md:text-lg font-semibold mb-2">No OTA expenses found</h3>
                <p className="text-xs md:text-sm text-muted-foreground mb-4">Try adjusting your filters or create your first expense.</p>
                <Button onClick={() => setFormOpen(true)} className="rounded-md uppercase tracking-wide gap-2 text-xs md:text-sm">
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
                      <TableHead className="text-xs md:text-sm">Channel</TableHead>
                      <TableHead className="text-xs md:text-sm">Booking</TableHead>
                      <TableHead className="text-right text-xs md:text-sm">Amount</TableHead>
                      <TableHead className="text-right text-xs md:text-sm">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell className="text-xs md:text-sm">{format(new Date(expense.expense_date), "MMM d, yyyy")}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="rounded-md text-[10px] md:text-xs">
                            {getCategoryLabel(expense.expense_category)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate text-xs md:text-sm">{expense.description}</TableCell>
                        <TableCell className="text-xs md:text-sm capitalize">{expense.channel || "—"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{expense.ota_booking?.external_ref || "—"}</TableCell>
                        <TableCell className="text-right font-semibold text-xs md:text-sm">£{Number(expense.amount).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(expense.id)} className="rounded-md h-8 w-8 p-0">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteExpenseId(expense.id)}
                              className="rounded-md h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
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

        <Sheet open={formOpen} onOpenChange={setFormOpen}>
          <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl border-0 p-0">
            <div className="h-full overflow-y-auto p-6 md:p-8">
              <SheetHeader className="mb-6 text-left">
                <SheetTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
                  {editExpenseId ? "Edit OTA Expense" : "Create OTA Expense"}
                </SheetTitle>
                <SheetDescription className="text-xs md:text-sm">
                  Capture OTA operational costs and map them to channels/bookings.
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs md:text-sm">Related OTA Booking (Optional)</Label>
                  <Select value={formData.ota_booking_id} onValueChange={(value) => setFormData((prev) => ({ ...prev, ota_booking_id: value }))}>
                    <SelectTrigger className="rounded-md text-sm md:text-base">
                      <SelectValue placeholder="Select booking" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No linked booking</SelectItem>
                      {(otaBookings || []).map((booking) => (
                        <SelectItem key={booking.id} value={booking.id}>
                          {booking.external_ref} - {booking.guest_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs md:text-sm">Channel</Label>
                    <Select value={formData.channel} onValueChange={(value) => setFormData((prev) => ({ ...prev, channel: value }))}>
                      <SelectTrigger className="rounded-md text-sm md:text-base">
                        <SelectValue placeholder="Select channel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not set</SelectItem>
                        <SelectItem value="airbnb">Airbnb</SelectItem>
                        <SelectItem value="booking">Booking.com</SelectItem>
                        <SelectItem value="agoda">Agoda</SelectItem>
                        <SelectItem value="expedia">Expedia</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs md:text-sm">Category *</Label>
                    <Select
                      value={formData.expense_category}
                      onValueChange={(value: OTAExpenseCategory) => setFormData((prev) => ({ ...prev, expense_category: value }))}
                    >
                      <SelectTrigger className="rounded-md text-sm md:text-base">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="commission">Commission</SelectItem>
                        <SelectItem value="cleaning">Cleaning</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                        <SelectItem value="supplies">Supplies</SelectItem>
                        <SelectItem value="tax">Tax</SelectItem>
                        <SelectItem value="refund">Refund</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs md:text-sm">Description *</Label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe this OTA expense"
                    className="rounded-md text-sm md:text-base"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs md:text-sm">Amount (£) *</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                      className="rounded-md text-sm md:text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs md:text-sm">Expense Date *</Label>
                    <Input
                      type="date"
                      value={formData.expense_date}
                      onChange={(e) => setFormData((prev) => ({ ...prev, expense_date: e.target.value }))}
                      className="rounded-md text-sm md:text-base"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs md:text-sm">Vendor Name</Label>
                    <Input
                      value={formData.vendor_name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, vendor_name: e.target.value }))}
                      className="rounded-md text-sm md:text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs md:text-sm">Invoice Number</Label>
                    <Input
                      value={formData.invoice_number}
                      onChange={(e) => setFormData((prev) => ({ ...prev, invoice_number: e.target.value }))}
                      className="rounded-md text-sm md:text-base"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs md:text-sm">Notes</Label>
                  <Textarea
                    rows={4}
                    value={formData.notes}
                    onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                    className="rounded-2xl text-sm md:text-base"
                  />
                </div>
              </div>

              <SheetFooter className="mt-6 flex gap-2">
                <Button variant="outline" onClick={resetForm} className="rounded-md text-xs md:text-sm">
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createExpense.isPending || updateExpense.isPending}
                  className="rounded-md uppercase tracking-wide gap-2 text-xs md:text-sm"
                >
                  {createExpense.isPending || updateExpense.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : editExpenseId ? (
                    "Update OTA Expense"
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Create OTA Expense
                    </>
                  )}
                </Button>
              </SheetFooter>
            </div>
          </SheetContent>
        </Sheet>

        <AlertDialog open={!!deleteExpenseId} onOpenChange={(open) => !open && setDeleteExpenseId(null)}>
          <AlertDialogContent className="rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">Delete OTA Expense</AlertDialogTitle>
              <AlertDialogDescription className="text-xs md:text-sm">
                Are you sure you want to delete this OTA expense? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="rounded-md text-xs md:text-sm">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleteExpense.isPending}
                className="rounded-md bg-destructive hover:bg-destructive/90 text-xs md:text-sm"
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

export default OTAExpensesPage;
