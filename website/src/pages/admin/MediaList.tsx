import { useState, useRef } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Pencil, Trash2, Upload, ImageIcon, Layout } from "lucide-react";
import { toast } from "sonner";
import ImageSlotsList from "./ImageSlotsList";

const BUCKET = "website";
const MAX_SIZE_MB = 5;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];

type MediaRow = {
  id: string;
  file_name: string;
  file_path: string;
  file_url: string;
  file_type: string;
  file_size: number | null;
  mime_type: string | null;
  alt_text: string | null;
  caption: string | null;
  folder: string | null;
  created_at: string;
};

export default function MediaList() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-website-media-library"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_media_library")
        .select("id, file_name, file_path, file_url, file_type, file_size, mime_type, alt_text, caption, folder, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as MediaRow[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<MediaRow> }) => {
      const { error } = await supabase.from("website_media_library").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-media-library"] });
      toast.success("Media updated.");
      setEditingId(null);
    },
    onError: () => toast.error("Failed to update."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const items = rows?.filter((r) => ids.includes(r.id)) || [];
      for (const item of items) {
        await supabase.storage.from(BUCKET).remove([item.file_path]);
      }
      const { error } = await supabase.from("website_media_library").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-media-library"] });
      setSelectedIds(new Set());
      toast.success("Media deleted.");
      setEditingId(null);
    },
    onError: () => toast.error("Failed to delete."),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    let done = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        toast.error(`${file.name}: File must be under ${MAX_SIZE_MB}MB`);
        continue;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: Allowed: JPEG, PNG, GIF, WebP, SVG`);
        continue;
      }
      const ext = file.name.split(".").pop() || "jpg";
      const path = `media/${crypto.randomUUID()}.${ext}`;
      const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) {
        toast.error(`${file.name}: ${error.message}`);
        continue;
      }
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
      await supabase.from("website_media_library").insert({
        file_name: file.name,
        file_path: data.path,
        file_url: urlData.publicUrl,
        file_type: "image",
        file_size: file.size,
        mime_type: file.type,
        folder: "media",
      });
      done++;
    }
    setUploading(false);
    e.target.value = "";
    if (done) {
      queryClient.invalidateQueries({ queryKey: ["admin-website-media-library"] });
      toast.success(`${done} image(s) uploaded.`);
    }
  };

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

  const editing = rows?.find((r) => r.id === editingId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Media</h1>
        <p className="text-muted-foreground">Upload and manage images. Assign images to hero sections in Website Image Slots.</p>
      </div>

      <Tabs defaultValue="library" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="library" className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Media Library
          </TabsTrigger>
          <TabsTrigger value="slots" className="flex items-center gap-2">
            <Layout className="h-4 w-4" />
            Website Image Slots
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteMutation.mutate(Array.from(selectedIds))}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete {selectedIds.size}
            </Button>
          )}
          <Button onClick={() => inputRef.current?.click()} disabled={uploading} className="w-fit">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            Upload
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={handleUpload}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All media</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !rows?.length ? (
            <div className="py-16 text-center border border-dashed rounded-lg">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No media yet. Upload images to get started.</p>
              <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                Upload images
              </Button>
            </div>
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
                    <TableHead className="w-20">Preview</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Alt / Caption</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(row.id)}
                          onCheckedChange={() => toggleSelect(row.id)}
                          aria-label={`Select ${row.file_name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="w-16 h-16 rounded overflow-hidden bg-muted flex-shrink-0">
                          <img src={row.file_url} alt={row.alt_text || row.file_name} className="w-full h-full object-cover" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium truncate block max-w-[200px]" title={row.file_name}>{row.file_name}</span>
                        <span className="text-xs text-muted-foreground truncate block max-w-[200px]">{row.file_url}</span>
                      </TableCell>
                      <TableCell className="max-w-[180px]">
                        <span className="truncate block text-sm">{row.alt_text || "—"}</span>
                        <span className="truncate block text-xs text-muted-foreground">{row.caption || "—"}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {row.file_size ? `${(row.file_size / 1024).toFixed(1)} KB` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => setEditingId(row.id)} aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => deleteMutation.mutate([row.id])}
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
        </TabsContent>

        <TabsContent value="slots" className="space-y-4">
          <ImageSlotsList />
        </TabsContent>
      </Tabs>

      <Dialog open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
        <DialogContent className="max-w-lg" aria-describedby="edit-media-desc">
          <DialogHeader>
            <DialogTitle>Edit media</DialogTitle>
            <DialogDescription id="edit-media-desc">Update alt text and caption for SEO and accessibility.</DialogDescription>
          </DialogHeader>
          {editing && (
            <MediaEditForm
              initial={editing}
              onSubmit={(p) => updateMutation.mutate({ id: editing.id, payload: p })}
              onCancel={() => setEditingId(null)}
              isLoading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MediaEditForm({
  initial,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initial: MediaRow;
  onSubmit: (p: Partial<MediaRow>) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [alt_text, setAlt_text] = useState(initial.alt_text ?? "");
  const [caption, setCaption] = useState(initial.caption ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ alt_text: alt_text.trim() || null, caption: caption.trim() || null });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded border overflow-hidden max-h-48">
        <img src={initial.file_url} alt={alt_text || initial.file_name} className="w-full h-auto object-contain max-h-40" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="alt">Alt text</Label>
        <Input id="alt" value={alt_text} onChange={(e) => setAlt_text(e.target.value)} placeholder="Describe the image for accessibility" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="caption">Caption</Label>
        <Input id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Optional caption" />
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save
        </Button>
      </div>
    </form>
  );
}
