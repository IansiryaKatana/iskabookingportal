import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

type FaqRow = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  display_order: number;
  is_active: boolean;
};

export default function FaqsList() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-website-faqs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_faqs")
        .select("id, question, answer, category, display_order, is_active")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as FaqRow[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<FaqRow> }) => {
      const { error } = await supabase.from("website_faqs").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-faqs"] });
      toast.success("FAQ updated.");
      setEditingId(null);
    },
    onError: () => toast.error("Failed to update FAQ."),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { question: string; answer: string; category?: string; display_order: number; is_active: boolean }) => {
      const { error } = await supabase.from("website_faqs").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-faqs"] });
      toast.success("FAQ created.");
      setCreateOpen(false);
    },
    onError: () => toast.error("Failed to create FAQ."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("website_faqs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-faqs"] });
      toast.success("FAQ deleted.");
      setEditingId(null);
    },
    onError: () => toast.error("Failed to delete FAQ."),
  });

  const editing = rows?.find((r) => r.id === editingId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">FAQs</h1>
          <p className="text-muted-foreground">Manage frequently asked questions shown on the FAQ page.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="w-fit">
          <Plus className="h-4 w-4 mr-2" />
          Add FAQ
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All FAQs</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !rows?.length ? (
            <p className="py-8 text-center text-muted-foreground">No FAQs yet. Add one to get started.</p>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Question</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="w-16">{row.display_order}</TableCell>
                      <TableCell>{row.category ?? "—"}</TableCell>
                      <TableCell className="max-w-[320px] truncate">{row.question}</TableCell>
                      <TableCell>
                        <Badge variant={row.is_active ? "default" : "secondary"}>{row.is_active ? "Yes" : "No"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => setEditingId(row.id)} aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => deleteMutation.mutate(row.id)}
                          disabled={deleteMutation.isPending}
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby="edit-faq-desc">
          <DialogHeader>
            <DialogTitle>Edit FAQ</DialogTitle>
            <DialogDescription id="edit-faq-desc" className="sr-only">Edit question, answer and category for this FAQ.</DialogDescription>
          </DialogHeader>
          {editing && (
            <FaqForm
              initial={editing}
              onSubmit={(payload) => updateMutation.mutate({ id: editing.id, payload })}
              onCancel={() => setEditingId(null)}
              isLoading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby="add-faq-desc">
          <DialogHeader>
            <DialogTitle>Add FAQ</DialogTitle>
            <DialogDescription id="add-faq-desc" className="sr-only">Add a new FAQ with question and answer.</DialogDescription>
          </DialogHeader>
          <FaqForm
            initial={null}
            onSubmit={(payload) => createMutation.mutate({ ...payload, display_order: rows?.length ?? 0, is_active: true })}
            onCancel={() => setCreateOpen(false)}
            isLoading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FaqForm({
  initial,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initial: FaqRow | null;
  onSubmit: (payload: Partial<FaqRow>) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [is_active, setIs_active] = useState(initial?.is_active ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ question, answer, category: category || null, is_active });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="faq-question">Question</Label>
        <Input id="faq-question" value={question} onChange={(e) => setQuestion(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="faq-answer">Answer</Label>
        <Textarea id="faq-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} required rows={4} className="resize-y" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="faq-category">Category (optional)</Label>
        <Input id="faq-category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Booking" />
      </div>
      <div className="flex items-center gap-2">
        <Switch id="faq-active" checked={is_active} onCheckedChange={setIs_active} />
        <Label htmlFor="faq-active">Active (shown on site)</Label>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {initial ? "Save" : "Create"}
        </Button>
      </div>
    </form>
  );
}
