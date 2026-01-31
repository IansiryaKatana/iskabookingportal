import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Trash2, CheckCircle, XCircle, Star, Plus } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";

type ReviewStatus = "pending" | "approved" | "rejected";

type ReviewRow = {
  id: string;
  reviewer_name: string;
  reviewer_email: string | null;
  rating: number;
  title: string | null;
  content: string;
  status: ReviewStatus;
  featured: boolean;
  verified_purchase: boolean;
  created_at: string;
};

const statusLabels: Record<ReviewStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export default function ReviewsList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") || "pending";
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-website-reviews", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("website_reviews")
        .select("id, reviewer_name, reviewer_email, rating, title, content, status, featured, verified_purchase, created_at")
        .order("created_at", { ascending: false });
      if (statusFilter && statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ReviewRow[];
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("website_reviews")
        .update({
          status: "approved",
          approved_by: user?.id ?? null,
          approved_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["website-reviews-approved"] });
      toast.success("Review approved.");
    },
    onError: () => toast.error("Failed to approve."),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("website_reviews")
        .update({ status: "rejected" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["website-reviews-approved"] });
      toast.success("Review rejected.");
    },
    onError: () => toast.error("Failed to reject."),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<ReviewRow> }) => {
      const { error } = await supabase.from("website_reviews").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["website-reviews-approved"] });
      toast.success("Review updated.");
      setEditingId(null);
    },
    onError: () => toast.error("Failed to update."),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Omit<ReviewRow, "id" | "created_at">) => {
      const { error } = await supabase.from("website_reviews").insert({
        ...payload,
        status: "approved",
        approved_by: user?.id ?? null,
        approved_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["website-reviews-approved"] });
      toast.success("Review created.");
      setCreateOpen(false);
    },
    onError: () => toast.error("Failed to create."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("website_reviews").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["website-reviews-approved"] });
      toast.success("Review deleted.");
      setDeleteId(null);
    },
    onError: () => toast.error("Failed to delete."),
  });

  const toggleFeatured = useMutation({
    mutationFn: async ({ id, featured }: { id: string; featured: boolean }) => {
      const { error } = await supabase.from("website_reviews").update({ featured }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["website-reviews-approved"] });
      toast.success("Featured status updated.");
    },
    onError: () => toast.error("Failed to update."),
  });

  const editing = rows?.find((r) => r.id === editingId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reviews</h1>
          <p className="text-muted-foreground">Approve, reject, or manage reviews shown on the Reviews page.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="w-fit">
          <Plus className="h-4 w-4 mr-2" />
          Add review
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => setSearchParams({ status: v })}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {statusFilter && statusFilter !== "all" ? statusLabels[statusFilter as ReviewStatus] : "All"} reviews
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !rows?.length ? (
            <p className="py-8 text-center text-muted-foreground">No reviews yet.</p>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reviewer</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Featured</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{row.reviewer_name}</span>
                          {row.reviewer_email && (
                            <p className="text-xs text-muted-foreground truncate max-w-[140px]">{row.reviewer_email}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-primary text-primary" />
                          <span>{row.rating}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate">{row.title ?? "—"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{row.content}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.status === "approved"
                              ? "default"
                              : row.status === "rejected"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {statusLabels[row.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={row.featured}
                          onCheckedChange={(checked) => toggleFeatured.mutate({ id: row.id, featured: checked })}
                          disabled={row.status !== "approved" || toggleFeatured.isPending}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {row.status === "pending" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-green-600"
                              onClick={() => approveMutation.mutate(row.id)}
                              disabled={approveMutation.isPending}
                              aria-label="Approve"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => rejectMutation.mutate(row.id)}
                              disabled={rejectMutation.isPending}
                              aria-label="Reject"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => setEditingId(row.id)} aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => setDeleteId(row.id)}
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

      {/* Edit dialog */}
      <Dialog open={!!editingId} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit review</DialogTitle>
            <DialogDescription className="sr-only">Edit reviewer name, rating, title, content, status and featured.</DialogDescription>
          </DialogHeader>
          {editing && (
            <ReviewForm
              initial={editing}
              onSubmit={(payload) => updateMutation.mutate({ id: editing.id, payload })}
              onCancel={() => setEditingId(null)}
              isLoading={updateMutation.isPending}
              showStatus
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add review</DialogTitle>
            <DialogDescription className="sr-only">Add a new review (will be approved by default).</DialogDescription>
          </DialogHeader>
          <ReviewForm
            initial={null}
            onSubmit={(payload) =>
              createMutation.mutate({
                ...payload,
                status: "approved",
                featured: payload.featured ?? false,
                verified_purchase: payload.verified_purchase ?? false,
              })
            }
            onCancel={() => setCreateOpen(false)}
            isLoading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete review?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ReviewForm({
  initial,
  onSubmit,
  onCancel,
  isLoading,
  showStatus,
}: {
  initial: ReviewRow | null;
  onSubmit: (payload: Partial<ReviewRow>) => void;
  onCancel: () => void;
  isLoading: boolean;
  showStatus?: boolean;
}) {
  const [reviewer_name, setReviewer_name] = useState(initial?.reviewer_name ?? "");
  const [reviewer_email, setReviewer_email] = useState(initial?.reviewer_email ?? "");
  const [rating, setRating] = useState(initial?.rating ?? 5);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [status, setStatus] = useState<ReviewStatus>(initial?.status ?? "pending");
  const [featured, setFeatured] = useState(initial?.featured ?? false);
  const [verified_purchase, setVerified_purchase] = useState(initial?.verified_purchase ?? false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      reviewer_name,
      reviewer_email: reviewer_email || null,
      rating,
      title: title || null,
      content,
      ...(showStatus ? { status } : {}),
      featured,
      verified_purchase,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Reviewer name</Label>
        <Input value={reviewer_name} onChange={(e) => setReviewer_name(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Email (optional)</Label>
        <Input type="email" value={reviewer_email} onChange={(e) => setReviewer_email(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Rating</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setRating(s)}
              className={`px-2 py-1 rounded border text-sm ${rating >= s ? "bg-primary text-primary-foreground border-primary" : "border-input"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Title (optional)</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Great place!" />
      </div>
      <div className="space-y-2">
        <Label>Content</Label>
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} required rows={4} className="resize-y" />
      </div>
      {showStatus && (
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ReviewStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Switch id="featured" checked={featured} onCheckedChange={setFeatured} />
        <Label htmlFor="featured">Featured</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="verified" checked={verified_purchase} onCheckedChange={setVerified_purchase} />
        <Label htmlFor="verified">Verified resident</Label>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {initial ? "Save" : "Create"}
        </Button>
      </div>
    </form>
  );
}
