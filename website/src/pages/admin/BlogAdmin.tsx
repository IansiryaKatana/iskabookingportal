import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText, Loader2, Eye, Send, Pencil, Trash2, Archive, PlusCircle, Upload, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import WordPressImport from "@/components/admin/WordPressImport";
import CsvBlogImport from "@/components/admin/CsvBlogImport";

type BlogPostRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  published_at: string | null;
};

export default function BlogAdmin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);

  const { data: posts, isLoading } = useQuery({
    queryKey: ["admin-blog-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, title, slug, status, published_at")
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data || []) as BlogPostRow[];
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!posts?.length) return;
    if (selectedIds.size === posts.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(posts.map((p) => p.id)));
  };

  const publishDraftsMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("blog_posts")
        .update({ status: "published" })
        .eq("status", "draft");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      toast.success("All drafts published.");
    },
    onError: () => toast.error("Failed to publish drafts."),
  });

  const publishOneMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blog_posts").update({ status: "published" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      toast.success("Post published.");
    },
    onError: () => toast.error("Failed to publish."),
  });

  const bulkPublishMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from("blog_posts").update({ status: "published" }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      setSelectedIds(new Set());
      toast.success("Selected posts published.");
    },
    onError: () => toast.error("Failed to publish."),
  });

  const bulkUnpublishMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from("blog_posts").update({ status: "draft" }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      setSelectedIds(new Set());
      toast.success("Selected posts set to draft.");
    },
    onError: () => toast.error("Failed to update."),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      await supabase.from("blog_post_tags").delete().in("post_id", ids);
      const { error } = await supabase.from("blog_posts").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      setSelectedIds(new Set());
      toast.success("Selected posts deleted.");
    },
    onError: () => toast.error("Failed to delete."),
  });

  const draftCount = posts?.filter((p) => p.status === "draft").length ?? 0;
  const selectedArray = Array.from(selectedIds);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Blog</h1>
          <p className="text-muted-foreground">Import from WordPress or manage blog posts, categories, and tags.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate("/admin/blog/new")} className="w-fit">
            <PlusCircle className="h-4 w-4 mr-2" />
            New post
          </Button>
          <Button variant="outline" className="w-fit" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import WordPress
          </Button>
          <Button variant="outline" className="w-fit" onClick={() => setCsvImportOpen(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Import from CSV
          </Button>
          <Link to="/blog">
            <Button variant="outline" className="w-fit">
              <Eye className="h-4 w-4 mr-2" />
              View blog on site
            </Button>
          </Link>
        </div>
      </div>

      <WordPressImport open={importOpen} onOpenChange={setImportOpen} />
      <CsvBlogImport open={csvImportOpen} onOpenChange={setCsvImportOpen} />

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Blog posts</CardTitle>
            <CardDescription>
              {posts?.length ?? 0} post{(posts?.length ?? 0) !== 1 ? "s" : ""}. Click a row to edit. Only &quot;published&quot; posts appear on the public blog.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {draftCount > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => publishDraftsMutation.mutate()}
                disabled={publishDraftsMutation.isPending}
              >
                {publishDraftsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Publish all drafts ({draftCount})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {selectedArray.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg bg-muted/50 border">
              <span className="text-sm font-medium">{selectedArray.length} selected</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => bulkPublishMutation.mutate(selectedArray)}
                disabled={bulkPublishMutation.isPending}
              >
                {bulkPublishMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Publish selected
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => bulkUnpublishMutation.mutate(selectedArray)}
                disabled={bulkUnpublishMutation.isPending}
              >
                {bulkUnpublishMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Archive className="h-4 w-4 mr-2" />}
                Unpublish selected
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (window.confirm(`Delete ${selectedArray.length} post(s)? This cannot be undone.`)) {
                    bulkDeleteMutation.mutate(selectedArray);
                  }
                }}
                disabled={bulkDeleteMutation.isPending}
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
          ) : !posts?.length ? (
            <p className="py-8 text-center text-muted-foreground">No blog posts yet. Import from WordPress above.</p>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={posts.length > 0 && selectedIds.size === posts.length}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posts.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/admin/blog/${row.id}`)}
                    >
                      <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(row.id)}
                          onCheckedChange={() => toggleSelect(row.id)}
                          aria-label={`Select ${row.title}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium max-w-[240px] truncate">{row.title}</TableCell>
                      <TableCell className="font-mono text-xs max-w-[160px] truncate">{row.slug}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "published" ? "default" : "secondary"}>{row.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {row.published_at ? format(new Date(row.published_at), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/admin/blog/${row.id}`)}
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Link to={`/${row.slug}`} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" aria-label="View on site">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        {row.status === "draft" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              publishOneMutation.mutate(row.id);
                            }}
                            disabled={publishOneMutation.isPending}
                            aria-label="Publish"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tables &amp; data</CardTitle>
          <CardDescription>blog_posts, blog_categories, blog_tags, blog_post_tags (migration 001).</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Click a row to edit page content (WYSIWYG). Use &quot;New post&quot; to create a post or import from WordPress above.
          </p>
          <Link to="/blog">
            <Button variant="secondary">
              <FileText className="h-4 w-4 mr-2" />
              View blog on site
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
