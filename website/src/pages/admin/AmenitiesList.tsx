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

type AmenityRow = {
  id: string;
  title: string;
  short_description: string | null;
  vertical_image_url: string | null;
  horizontal_image_url: string | null;
  display_order: number;
  is_active: boolean;
};

export default function AmenitiesList() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-website-amenities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_amenities")
        .select("id, title, short_description, vertical_image_url, horizontal_image_url, display_order, is_active")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as AmenityRow[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<AmenityRow> }) => {
      const { error } = await supabase.from("website_amenities").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-amenities"] });
      toast.success("Amenity updated.");
      setEditingId(null);
    },
    onError: () => toast.error("Failed to update amenity."),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: {
      title: string;
      short_description?: string | null;
      vertical_image_url?: string | null;
      horizontal_image_url?: string | null;
      display_order: number;
      is_active: boolean;
    }) => {
      const { error } = await supabase.from("website_amenities").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-amenities"] });
      toast.success("Amenity created.");
      setCreateOpen(false);
    },
    onError: () => toast.error("Failed to create amenity."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("website_amenities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-amenities"] });
      toast.success("Amenity deleted.");
      setEditingId(null);
    },
    onError: () => toast.error("Failed to delete amenity."),
  });

  const editing = rows?.find((r) => r.id === editingId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Amenities</h1>
          <p className="text-muted-foreground">Amenities shown on the Studios catalog and About page.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="w-fit">
          <Plus className="h-4 w-4 mr-2" />
          Add amenity
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All amenities</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !rows?.length ? (
            <p className="py-8 text-center text-muted-foreground">No amenities yet. Add one to get started.</p>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Images</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="w-16">{row.display_order}</TableCell>
                      <TableCell className="font-medium">{row.title}</TableCell>
                      <TableCell className="max-w-[280px] truncate text-muted-foreground">{row.short_description ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {(row.vertical_image_url || row.horizontal_image_url) ? "Yes" : "—"}
                      </TableCell>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit amenity</DialogTitle>
          </DialogHeader>
          {editing && (
            <AmenityForm
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby="add-amenity-desc">
          <DialogHeader>
            <DialogTitle>Add amenity</DialogTitle>
            <DialogDescription id="add-amenity-desc" className="sr-only">Add a new amenity with title, description and images.</DialogDescription>
          </DialogHeader>
          <AmenityForm
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

function AmenityForm({
  initial,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initial: AmenityRow | null;
  onSubmit: (payload: Partial<AmenityRow>) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [short_description, setShort_description] = useState(initial?.short_description ?? "");
  const [vertical_image_url, setVertical_image_url] = useState(initial?.vertical_image_url ?? "");
  const [horizontal_image_url, setHorizontal_image_url] = useState(initial?.horizontal_image_url ?? "");
  const [display_order, setDisplay_order] = useState(initial?.display_order ?? 0);
  const [is_active, setIs_active] = useState(initial?.is_active ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title,
      short_description: short_description || null,
      vertical_image_url: vertical_image_url || null,
      horizontal_image_url: horizontal_image_url || null,
      display_order: Number(display_order) || 0,
      is_active,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="amenity-title">Title</Label>
        <Input id="amenity-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="amenity-desc">Short description (optional)</Label>
        <Textarea
          id="amenity-desc"
          value={short_description}
          onChange={(e) => setShort_description(e.target.value)}
          rows={3}
          className="resize-y"
          placeholder="Brief description for cards"
        />
      </div>
      <ImageUpload
        label="Vertical image (optional) — upload or paste URL"
        value={vertical_image_url}
        onChange={setVertical_image_url}
        folder="amenities"
      />
      <ImageUpload
        label="Horizontal image (optional) — upload or paste URL"
        value={horizontal_image_url}
        onChange={setHorizontal_image_url}
        folder="amenities"
      />
      <div className="space-y-2">
        <Label htmlFor="amenity-order">Display order</Label>
        <Input
          id="amenity-order"
          type="number"
          min={0}
          value={display_order}
          onChange={(e) => setDisplay_order(Number(e.target.value) || 0)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch id="amenity-active" checked={is_active} onCheckedChange={setIs_active} />
        <Label htmlFor="amenity-active">Active (shown on site)</Label>
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
