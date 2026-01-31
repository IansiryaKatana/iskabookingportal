import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

type BlogPostEditRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  featured_image_url: string | null;
  status: string;
  published_at: string | null;
  category_id: string | null;
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
};

export default function BlogPostEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isNew = id === "new";

  const { data: post, isLoading: postLoading } = useQuery({
    queryKey: ["admin-blog-post", id],
    queryFn: async () => {
      if (!id || id === "new") return null;
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, title, slug, excerpt, content, featured_image_url, status, published_at, category_id")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as BlogPostEditRow;
    },
    enabled: !!id && !isNew,
  });

  const { data: categories } = useQuery({
    queryKey: ["admin-blog-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_categories")
        .select("id, name, slug")
        .order("name");
      if (error) throw error;
      return (data || []) as CategoryRow[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<BlogPostEditRow>) => {
      if (!id || id === "new") throw new Error("No post id");
      const { error } = await supabase.from("blog_posts").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blog-post", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      toast.success("Post saved.");
    },
    onError: () => toast.error("Failed to save."),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Omit<BlogPostEditRow, "id" | "published_at"> & { published_at?: string | null }) => {
      const { data, error } = await supabase
        .from("blog_posts")
        .insert({
          title: payload.title,
          slug: payload.slug,
          excerpt: payload.excerpt ?? null,
          content: payload.content ?? "",
          featured_image_url: payload.featured_image_url ?? null,
          status: payload.status ?? "draft",
          published_at: payload.status === "published" ? new Date().toISOString() : null,
          category_id: payload.category_id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      toast.success("Post created.");
      navigate(`/admin/blog/${newId}`, { replace: true });
    },
    onError: () => toast.error("Failed to create post."),
  });

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [featured_image_url, setFeatured_image_url] = useState("");
  const [status, setStatus] = useState("draft");
  const [category_id, setCategory_id] = useState<string>("");

  useEffect(() => {
    if (post && !isNew) {
      setTitle(post.title);
      setSlug(post.slug);
      setExcerpt(post.excerpt ?? "");
      setContent(post.content ?? "");
      setFeatured_image_url(post.featured_image_url ?? "");
      setStatus(post.status);
      setCategory_id(post.category_id ?? "");
    }
  }, [post, isNew]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    const slugVal = slug.trim() || title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const payload = {
      title: title.trim(),
      slug: slugVal,
      excerpt: excerpt.trim() || null,
      content: content.trim() || "",
      featured_image_url: featured_image_url.trim() || null,
      status: status as "draft" | "published" | "archived",
      category_id: category_id || null,
    };
    if (isNew) {
      createMutation.mutate(payload);
    } else {
      updateMutation.mutate(payload);
    }
  };

  if (!id) {
    navigate("/admin/blog", { replace: true });
    return null;
  }

  if (!isNew && (postLoading || !post)) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit post</h1>
          <p className="text-muted-foreground">Edit page content and metadata.</p>
        </div>
        <Link to="/admin/blog">
          <Button variant="outline" className="w-fit">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to blog
          </Button>
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Post details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="post-title">Title</Label>
              <Input
                id="post-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Post title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="post-slug">Slug (URL)</Label>
              <Input
                id="post-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="url-slug"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="post-excerpt">Excerpt</Label>
              <Textarea
                id="post-excerpt"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={3}
                className="resize-y"
                placeholder="Short summary for listings"
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category_id || "__none__"} onValueChange={(v) => setCategory_id(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {(categories || []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ImageUpload
              label="Featured image"
              value={featured_image_url}
              onChange={setFeatured_image_url}
              folder="blog"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Page content</CardTitle>
            <p className="text-sm text-muted-foreground">Main body content (WYSIWYG).</p>
          </CardHeader>
          <CardContent>
            <RichTextEditor
              value={content}
              onChange={setContent}
              placeholder="Write your post content..."
              minHeight="320px"
            />
          </CardContent>
        </Card>

        <div className="flex gap-2 justify-end">
          <Link to="/admin/blog">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={updateMutation.isPending || createMutation.isPending}>
            {(updateMutation.isPending || createMutation.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isNew ? "Create post" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}
