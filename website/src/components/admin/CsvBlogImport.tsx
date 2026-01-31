import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { parseCsvBlogExport, parseCsvCategoriesOrTags, type CsvBlogRow } from "@/utils/csvBlogParser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

interface CsvBlogImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CsvBlogImport({ open, onOpenChange }: CsvBlogImportProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<CsvBlogRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tryDownloadImages, setTryDownloadImages] = useState(true);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setError(null);
    setRows([]);
    try {
      const text = await selected.text();
      const parsed = parseCsvBlogExport(text);
      setRows(parsed);
      if (parsed.length === 0) {
        setError("No valid blog posts found in CSV. Ensure the file has Title and Post Type = post.");
      } else {
        toast.success(`Found ${parsed.length} post(s) in CSV.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to parse CSV";
      setError(msg);
      toast.error(msg);
    }
  };

  const ensureCategory = async (name: string, slug: string): Promise<string | null> => {
    const { data: existing } = await supabase.from("blog_categories").select("id").eq("slug", slug).maybeSingle();
    if (existing) return existing.id;
    const { data: created, error } = await supabase
      .from("blog_categories")
      .insert({ name, slug })
      .select("id")
      .single();
    if (error) return null;
    return created?.id ?? null;
  };

  const ensureTag = async (name: string, slug: string): Promise<string | null> => {
    const { data: existing } = await supabase.from("blog_tags").select("id").eq("slug", slug).maybeSingle();
    if (existing) return existing.id;
    const { data: created, error } = await supabase.from("blog_tags").insert({ name, slug }).select("id").single();
    if (error) return null;
    return created?.id ?? null;
  };

  const fetchAndUploadImage = async (imageUrl: string, slug: string, index: number): Promise<string | null> => {
    if (!imageUrl || !imageUrl.startsWith("http")) return null;
    try {
      const res = await fetch(imageUrl, { mode: "cors" });
      if (!res.ok) return imageUrl;
      const blob = await res.blob();
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : blob.type === "image/gif" ? "gif" : "jpg";
      const path = `blog/${slug}-${index}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("website").upload(path, blob, {
        contentType: blob.type,
        upsert: true,
      });
      if (error) return imageUrl;
      const { data: urlData } = supabase.storage.from("website").getPublicUrl(path);
      return urlData.publicUrl;
    } catch {
      return imageUrl;
    }
  };

  const handleImport = async () => {
    if (!rows.length || !user) {
      toast.error("Select a CSV file with blog posts first.");
      return;
    }
    setImporting(true);
    setError(null);
    setProgress(0);
    let success = 0;
    let failed = 0;
    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const categories = parseCsvCategoriesOrTags(row.categories);
          const tags = parseCsvCategoriesOrTags(row.tags);
          const categoryMap: Record<string, string> = {};
          for (const c of categories) {
            const id = await ensureCategory(c.name, c.slug);
            if (id) categoryMap[c.slug] = id;
          }
          const tagMap: Record<string, string> = {};
          for (const t of tags) {
            const id = await ensureTag(t.name, t.slug);
            if (id) tagMap[t.slug] = id;
          }

          const blogPath = `/${row.slug}`;
          let seoPageId: string | null = null;
          if (row.seoTitle || row.metaDesc || row.focusKeyword) {
            const seoData = {
              page_path: blogPath,
              page_type: "post",
              meta_title: row.seoTitle || null,
              meta_description: row.metaDesc || null,
              focus_keyword: row.focusKeyword || null,
              og_title: row.ogTitle || null,
              og_description: row.ogDescription || null,
              twitter_title: row.ogTitle || null,
              twitter_description: row.twitterDescription || null,
            };
            const { data: existingSeo } = await supabase.from("seo_pages").select("id").eq("page_path", blogPath).maybeSingle();
            if (existingSeo) {
              await supabase.from("seo_pages").update(seoData).eq("id", existingSeo.id);
              seoPageId = existingSeo.id;
            } else {
              const { data: newSeo, error: seoErr } = await supabase.from("seo_pages").insert(seoData).select("id").single();
              if (!seoErr && newSeo) seoPageId = newSeo.id;
            }
          }

          let featuredImageUrl: string | null = row.imageUrl || null;
          if (tryDownloadImages && row.imageUrl) {
            const uploaded = await fetchAndUploadImage(row.imageUrl, row.slug, i);
            if (uploaded) featuredImageUrl = uploaded;
          }

          const categoryId = categories.length > 0 && categoryMap[categories[0].slug] ? categoryMap[categories[0].slug] : null;
          const status = ["publish", "published"].includes(String(row.status || "").toLowerCase()) ? "published" : "draft";
          const publishedAt = row.date ? new Date(row.date).toISOString() : null;
          const authorName = [row.authorFirstName, row.authorLastName].filter(Boolean).join(" ") || row.authorUsername || "Admin";

          const postData = {
            title: row.title,
            slug: row.slug,
            excerpt: row.excerpt || null,
            content: row.content || "",
            featured_image_url: featuredImageUrl,
            author_id: user.id,
            author_name: authorName,
            author_email: row.authorEmail || null,
            status,
            published_at: publishedAt,
            category_id: categoryId,
            seo_page_id: seoPageId,
            wordpress_id: row.id || null,
            wordpress_url: row.permalink || null,
          };

          const { data: existingPost } = await supabase.from("blog_posts").select("id").eq("slug", row.slug).maybeSingle();
          let postId: string;
          if (existingPost) {
            const { data: updated, error: upErr } = await supabase
              .from("blog_posts")
              .update(postData)
              .eq("id", existingPost.id)
              .select("id")
              .single();
            if (upErr) throw upErr;
            postId = updated.id;
          } else {
            const { data: newPost, error: insErr } = await supabase.from("blog_posts").insert(postData).select("id").single();
            if (insErr) throw insErr;
            postId = newPost.id;
          }

          await supabase.from("blog_post_tags").delete().eq("post_id", postId);
          const tagLinks = tags.map((t) => tagMap[t.slug]).filter(Boolean).map((tagId) => ({ post_id: postId, tag_id: tagId }));
          if (tagLinks.length > 0) await supabase.from("blog_post_tags").insert(tagLinks);

          success++;
        } catch (err) {
          console.error(`Failed to import "${row.title}":`, err);
          failed++;
        }
        setProgress(Math.round(((i + 1) / rows.length) * 100));
      }

      toast.success(`Import complete: ${success} succeeded, ${failed} failed.`);
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg" aria-describedby="csv-blog-import-desc">
        <DialogHeader>
          <DialogTitle>Import from CSV (Blogs export)</DialogTitle>
          <DialogDescription id="csv-blog-import-desc">
            Upload your blog export CSV to import posts with excerpt, content, featured images, and Yoast SEO (title, meta description, focus keyphrase, OG, Twitter).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="csv-blog-file">Blog export CSV</Label>
            <Input
              id="csv-blog-file"
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              disabled={importing}
              className="flex-1"
            />
            {file && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate">{file.name}</span>
                {rows.length > 0 && <span>({rows.length} posts)</span>}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={tryDownloadImages}
              onChange={(e) => setTryDownloadImages(e.target.checked)}
              disabled={importing}
            />
            Try to download images and host in storage (may fail for some URLs due to CORS)
          </label>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {importing && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Importing…</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-muted-foreground mt-2">{progress}%</p>
              </CardContent>
            </Card>
          )}

          {rows.length > 0 && !importing && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                {rows.length} post(s) ready. Click &quot;Start import&quot; to create/update posts with excerpt, content, SEO, and featured images.
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleImport}
            disabled={rows.length === 0 || importing}
            className="w-full"
            size="lg"
          >
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Start import
              </>
            )}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
