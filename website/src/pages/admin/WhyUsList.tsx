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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/components/admin/ImageUpload";

type WhyUsRow = {
  id: string;
  title: string;
  description: string;
  icon: string | null;
  icon_url: string | null;
  display_order: number;
  is_active: boolean;
};

export default function WhyUsList() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-website-why-us"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_why_us_cards")
        .select("id, title, description, icon, icon_url, display_order, is_active")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as WhyUsRow[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<WhyUsRow> }) => {
      const { error } = await supabase.from("website_why_us_cards").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-why-us"] });
      toast.success("Why Us card updated.");
      setEditingId(null);
    },
    onError: () => toast.error("Failed to update card."),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: {
      title: string;
      description: string;
      icon?: string | null;
      icon_url?: string | null;
      display_order: number;
      is_active: boolean;
    }) => {
      const { error } = await supabase.from("website_why_us_cards").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-why-us"] });
      toast.success("Why Us card created.");
      setCreateOpen(false);
    },
    onError: () => toast.error("Failed to create card."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("website_why_us_cards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-why-us"] });
      toast.success("Why Us card deleted.");
      setEditingId(null);
    },
    onError: () => toast.error("Failed to delete card."),
  });

  const editing = rows?.find((r) => r.id === editingId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Why Us</h1>
          <p className="text-muted-foreground">Feature cards shown on the Studios catalog.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="w-fit">
          <Plus className="h-4 w-4 mr-2" />
          Add card
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All cards</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !rows?.length ? (
            <p className="py-8 text-center text-muted-foreground">No Why Us cards yet. Add one to get started.</p>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Icon</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="w-16">{row.display_order}</TableCell>
                      <TableCell className="font-medium">{row.title}</TableCell>
                      <TableCell className="max-w-[320px] truncate text-muted-foreground">{row.description}</TableCell>
                      <TableCell className="text-muted-foreground">{row.icon_url ? "Image" : row.icon ?? "—"}</TableCell>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby="edit-whyus-desc">
          <DialogHeader>
            <DialogTitle>Edit Why Us card</DialogTitle>
            <DialogDescription id="edit-whyus-desc" className="sr-only">Edit title, description and icon for this Why Us card.</DialogDescription>
          </DialogHeader>
          {editing && (
            <WhyUsForm
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Why Us card</DialogTitle>
          </DialogHeader>
          <WhyUsForm
            initial={null}
            onSubmit={(payload) =>
              createMutation.mutate({
                ...payload,
                display_order: rows?.length ?? 0,
                is_active: true,
              })
            }
            onCancel={() => setCreateOpen(false)}
            isLoading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WhyUsForm({
  initial,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initial: WhyUsRow | null;
  onSubmit: (payload: Partial<WhyUsRow>) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "");
  const [icon_url, setIcon_url] = useState(initial?.icon_url ?? "");
  const [display_order, setDisplay_order] = useState(initial?.display_order ?? 0);
  const [is_active, setIs_active] = useState(initial?.is_active ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title,
      description,
      icon: icon || null,
      icon_url: icon_url || null,
      display_order: Number(display_order) || 0,
      is_active,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="whyus-title">Title</Label>
        <Input id="whyus-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="whyus-desc">Description</Label>
        <Textarea
          id="whyus-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={4}
          className="resize-y"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="whyus-icon">Icon name (optional, e.g. Lucide icon name)</Label>
        <Input id="whyus-icon" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="e.g. Sparkles" />
      </div>
      <ImageUpload
        label="Icon image (optional) — upload or paste URL (overrides icon name)"
        value={icon_url}
        onChange={setIcon_url}
        folder="why-us"
      />
      <div className="space-y-2">
        <Label htmlFor="whyus-order">Display order</Label>
        <Input
          id="whyus-order"
          type="number"
          min={0}
          value={display_order}
          onChange={(e) => setDisplay_order(Number(e.target.value) || 0)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch id="whyus-active" checked={is_active} onCheckedChange={setIs_active} />
        <Label htmlFor="whyus-active">Active (shown on site)</Label>
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
