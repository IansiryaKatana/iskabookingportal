import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Badge } from "@/components/ui/badge";
import { Loader2, Eye, MessageSquare, Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";

type FormType = "contact" | "callback" | "viewing" | "inquiry" | "resident_support" | "short_term";
type Status = "new" | "read" | "replied" | "archived";

const formTypeLabels: Record<string, string> = {
  contact: "Contact",
  callback: "Callback",
  viewing: "Viewing",
  inquiry: "Inquiry",
  resident_support: "Resident support",
  short_term: "Short term",
};

const statusLabels: Record<Status, string> = {
  new: "New",
  read: "Read",
  replied: "Replied",
  archived: "Archived",
};

type SubmissionRow = {
  id: string;
  form_type: FormType;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  status: Status;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export default function FormSubmissions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = (searchParams.get("status") as Status) || "";
  const typeFilter = searchParams.get("type") || "";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!rows?.length) return;
    if (selectedIds.size === rows.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(rows.map((r) => r.id)));
  };

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-form-submissions", statusFilter, typeFilter],
    queryFn: async () => {
      let q = supabase
        .from("website_form_submissions")
        .select("id, form_type, name, email, phone, message, status, metadata, created_at")
        .order("created_at", { ascending: false });
      if (statusFilter) q = q.eq("status", statusFilter);
      if (typeFilter) q = q.eq("form_type", typeFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as SubmissionRow[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === "read") {
        payload.read_at = new Date().toISOString();
        payload.read_by = user?.id ?? null;
      }
      if (status === "replied") {
        payload.replied_at = new Date().toISOString();
        payload.replied_by = user?.id ?? null;
      }
      const { error } = await supabase.from("website_form_submissions").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-form-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-form-submissions-new-count"] });
      toast.success("Status updated.");
      setSelectedId(null);
    },
    onError: () => toast.error("Failed to update status."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("website_form_submissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-form-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-form-submissions-new-count"] });
      toast.success("Submission deleted.");
      setSelectedId(null);
      setDeleteConfirmId(null);
    },
    onError: () => toast.error("Failed to delete."),
  });

  const bulkUpdateStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: Status }) => {
      if (ids.length === 0) return;
      const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === "read") {
        payload.read_at = new Date().toISOString();
        payload.read_by = user?.id ?? null;
      }
      if (status === "replied") {
        payload.replied_at = new Date().toISOString();
        payload.replied_by = user?.id ?? null;
      }
      const { error } = await supabase.from("website_form_submissions").update(payload).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-form-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-form-submissions-new-count"] });
      setSelectedIds(new Set());
      toast.success("Status updated.");
    },
    onError: () => toast.error("Failed to update."),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from("website_form_submissions").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-form-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-form-submissions-new-count"] });
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
      toast.success("Submissions deleted.");
    },
    onError: () => toast.error("Failed to delete."),
  });

  const selected = rows?.find((r) => r.id === selectedId);
  const selectedArray = Array.from(selectedIds);
  const isPending = updateStatus.isPending || deleteMutation.isPending || bulkUpdateStatusMutation.isPending || bulkDeleteMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Form Submissions</h1>
          <p className="text-muted-foreground">View and manage contact, callback, viewing, and short-term submissions.</p>
        </div>
      </div>
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-2">
          <CardTitle className="text-base">All submissions</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Select value={statusFilter || "all"} onValueChange={(v) => setSearchParams((p) => ({ ...p, status: v === "all" ? "" : v }))}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(Object.entries(statusLabels) as [Status, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter || "all"} onValueChange={(v) => setSearchParams((p) => ({ ...p, type: v === "all" ? "" : v }))}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.entries(formTypeLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {selectedArray.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg bg-muted/50 border">
              <span className="text-sm font-medium">{selectedArray.length} selected</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => bulkUpdateStatusMutation.mutate({ ids: selectedArray, status: "read" })}
                disabled={isPending}
              >
                {bulkUpdateStatusMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                Mark read
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => bulkUpdateStatusMutation.mutate({ ids: selectedArray, status: "replied" })}
                disabled={isPending}
              >
                {bulkUpdateStatusMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MessageSquare className="h-4 w-4 mr-2" />}
                Mark replied
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => bulkUpdateStatusMutation.mutate({ ids: selectedArray, status: "archived" })}
                disabled={isPending}
              >
                {bulkUpdateStatusMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Archive className="h-4 w-4 mr-2" />}
                Archive
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteConfirm(true)}
                disabled={isPending}
              >
                {bulkDeleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Delete selected
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Clear selection
              </Button>
            </div>
          )}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !rows?.length ? (
            <p className="py-8 text-center text-muted-foreground">No submissions found.</p>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={rows.length > 0 && selectedIds.size === rows.length}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedId(row.id)}
                    >
                      <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(row.id)}
                          onCheckedChange={() => toggleSelect(row.id)}
                          aria-label={`Select ${row.name}`}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {format(new Date(row.created_at), "dd MMM yyyy, HH:mm")}
                      </TableCell>
                      <TableCell>{formTypeLabels[row.form_type] ?? row.form_type}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="max-w-[180px] truncate">{row.email}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "new" ? "default" : "secondary"}>
                          {statusLabels[row.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => setSelectedId(row.id)} aria-label="View">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirmId(row.id)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby="submission-details-desc">
          <DialogHeader>
            <DialogTitle>Submission details</DialogTitle>
            <DialogDescription id="submission-details-desc" className="sr-only">View and update status of this form submission.</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Date</span>
                <span>{format(new Date(selected.created_at), "dd MMM yyyy, HH:mm")}</span>
                <span className="text-muted-foreground">Type</span>
                <span>{formTypeLabels[selected.form_type] ?? selected.form_type}</span>
                <span className="text-muted-foreground">Status</span>
                <span><Badge variant={selected.status === "new" ? "default" : "secondary"}>{statusLabels[selected.status]}</Badge></span>
                <span className="text-muted-foreground">Name</span>
                <span>{selected.name}</span>
                <span className="text-muted-foreground">Email</span>
                <span>{selected.email}</span>
                <span className="text-muted-foreground">Phone</span>
                <span>{selected.phone ?? "—"}</span>
              </div>
              {selected.message && (
                <div>
                  <span className="text-sm text-muted-foreground">Message</span>
                  <p className="mt-1 rounded border bg-muted/30 p-3 text-sm">{selected.message}</p>
                </div>
              )}
              {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                <div>
                  <span className="text-sm text-muted-foreground">Details</span>
                  <pre className="mt-1 rounded border bg-muted/30 p-3 text-xs overflow-x-auto">
                    {JSON.stringify(selected.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSelectedId(null)}>Close</Button>
            </div>
            {selected && (
              <div className="flex flex-wrap gap-2">
                {selected.status !== "archived" && (
                  <>
                    {selected.status === "new" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={updateStatus.isPending}
                        onClick={() => updateStatus.mutate({ id: selected.id, status: "read" })}
                      >
                        {updateStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4 mr-1" />}
                        Mark read
                      </Button>
                    )}
                    {selected.status !== "replied" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={updateStatus.isPending}
                        onClick={() => updateStatus.mutate({ id: selected.id, status: "replied" })}
                      >
                        {updateStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4 mr-1" />}
                        Mark replied
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={updateStatus.isPending}
                      onClick={() => updateStatus.mutate({ id: selected.id, status: "archived" })}
                    >
                      {updateStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4 mr-1" />}
                      Archive
                    </Button>
                  </>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    setSelectedId(null);
                    setDeleteConfirmId(selected.id);
                  }}
                >
                  {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                  Delete
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single delete confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete submission?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this form submission.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedArray.length} submission{selectedArray.length !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected form submissions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => bulkDeleteMutation.mutate(selectedArray)}
            >
              {bulkDeleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
