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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Pencil, Plus, Trash2, Search, Globe } from "lucide-react";
import { toast } from "sonner";
import { ImageUpload } from "@/components/admin/ImageUpload";

// SEO character limits
const META_TITLE_LIMIT = 60;
const META_DESC_LIMIT = 160;

// Character counter with color states
function CharCounter({ value, limit }: { value: string; limit: number }) {
  const len = value.length;
  const nearLimit = limit - 5;
  const color =
    len > limit
      ? "text-red-500"
      : len >= nearLimit
        ? "text-amber-500"
        : "text-muted-foreground";
  return (
    <span className={`text-xs ${color}`}>
      {len} / {limit}
    </span>
  );
}

// Search engine preview component
function SearchPreview({
  title,
  description,
  url,
}: {
  title: string;
  description: string;
  url: string;
}) {
  if (!title && !description) return null;
  const displayTitle = title.length > 60 ? title.slice(0, 57) + "..." : title;
  const displayDesc = description.length > 160 ? description.slice(0, 157) + "..." : description;
  return (
    <div className="rounded-lg border bg-white p-4 space-y-1">
      <p className="text-xs text-muted-foreground mb-2">How this page may appear in Google search results</p>
      <p className="text-[#1a0dab] text-lg leading-snug truncate">{displayTitle || "Page Title"}</p>
      <p className="text-[#006621] text-sm truncate">{url || "https://yoursite.com/page"}</p>
      <p className="text-sm text-[#545454] line-clamp-2">{displayDesc || "Page description will appear here..."}</p>
    </div>
  );
}

type SeoSettingsRow = {
  id: string;
  site_name: string;
  default_meta_title: string | null;
  default_meta_description: string | null;
  default_og_image_url: string | null;
  twitter_handle: string | null;
  is_active: boolean;
};

type SeoPageRow = {
  id: string;
  page_path: string;
  page_type: string;
  meta_title: string | null;
  meta_description: string | null;
  focus_keyword: string | null;
  canonical_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  og_image_alt: string | null;
  twitter_title: string | null;
  twitter_description: string | null;
  twitter_image_url: string | null;
  twitter_image_alt: string | null;
  schema_json: Record<string, unknown> | null;
  robots_meta: string | null;
};

const PAGE_PATHS = ["/", "/studios", "/contact", "/faq", "/blog", "/about", "/short-term", "/reviews", "/privacy", "/terms"];

export default function SeoManagement() {
  const queryClient = useQueryClient();
  const [pageEditId, setPageEditId] = useState<string | null>(null);
  const [pageCreateOpen, setPageCreateOpen] = useState(false);

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["admin-website-seo-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_seo_settings")
        .select("id, site_name, default_meta_title, default_meta_description, default_og_image_url, twitter_handle, is_active")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as SeoSettingsRow | null;
    },
  });

  const { data: pages, isLoading: pagesLoading } = useQuery({
    queryKey: ["admin-seo-pages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seo_pages")
        .select("id, page_path, page_type, meta_title, meta_description, focus_keyword, canonical_url, og_title, og_description, og_image_url, og_image_alt, twitter_title, twitter_description, twitter_image_url, twitter_image_alt, schema_json, robots_meta")
        .order("page_path");
      if (error) throw error;
      return (data || []) as SeoPageRow[];
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (payload: Partial<SeoSettingsRow>) => {
      const id = settings?.id;
      if (!id) throw new Error("No settings row");
      const { error } = await supabase.from("website_seo_settings").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-seo-settings"] });
      toast.success("General SEO settings saved.");
    },
    onError: () => toast.error("Failed to save."),
  });

  const updatePageMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<SeoPageRow> }) => {
      const { error } = await supabase.from("seo_pages").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-seo-pages"] });
      toast.success("Page SEO updated.");
      setPageEditId(null);
    },
    onError: () => toast.error("Failed to update."),
  });

  const createPageMutation = useMutation({
    mutationFn: async (payload: Partial<SeoPageRow> & { page_path: string; page_type: string }) => {
      const { error } = await supabase.from("seo_pages").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-seo-pages"] });
      toast.success("Page SEO created.");
      setPageCreateOpen(false);
    },
    onError: () => toast.error("Failed to create."),
  });

  const deletePageMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("seo_pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-seo-pages"] });
      toast.success("Page SEO removed.");
      setPageEditId(null);
    },
    onError: () => toast.error("Failed to delete."),
  });

  const editingPage = pages?.find((p) => p.id === pageEditId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">SEO Management</h1>
        <p className="text-muted-foreground">General SEO settings and per-page SEO (meta title, description, focus keyphrase, Open Graph, Twitter Card, slug).</p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            General SEO
          </TabsTrigger>
          <TabsTrigger value="pages" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Page SEO
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Website general SEO settings</CardTitle>
              <p className="text-sm text-muted-foreground">Defaults used when a page has no specific SEO.</p>
            </CardHeader>
            <CardContent>
              {settingsLoading || !settings ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <GeneralSeoForm
                  initial={settings}
                  onSubmit={(payload) => updateSettingsMutation.mutate(payload)}
                  isLoading={updateSettingsMutation.isPending}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pages" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">All pages are pre-seeded with recommended SEO. Edit any row to refine title, description, focus keyphrase, social and slug.</p>
            <Button onClick={() => setPageCreateOpen(true)} className="w-fit">
              <Plus className="h-4 w-4 mr-2" />
              Add page SEO
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All page SEO</CardTitle>
            </CardHeader>
            <CardContent>
              {pagesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !pages?.length ? (
                <p className="py-8 text-center text-muted-foreground">No page SEO yet. Run the seed migration (006) or add a page.</p>
              ) : (
                <div className="overflow-x-auto -mx-6 px-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Slug / Path</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Meta title</TableHead>
                        <TableHead>Focus keyphrase</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pages.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-sm">{row.page_path}</TableCell>
                          <TableCell>{row.page_type}</TableCell>
                          <TableCell className="max-w-[220px] truncate">{row.meta_title ?? "—"}</TableCell>
                          <TableCell className="max-w-[160px] truncate text-muted-foreground">{row.focus_keyword ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => setPageEditId(row.id)} aria-label="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => deletePageMutation.mutate(row.id)}
                              disabled={deletePageMutation.isPending}
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
      </Tabs>

      <Dialog open={!!pageEditId} onOpenChange={(open) => !open && setPageEditId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="edit-page-seo-desc">
          <DialogHeader>
            <DialogTitle>Edit page SEO</DialogTitle>
            <DialogDescription id="edit-page-seo-desc" className="sr-only">Edit meta title, description, focus keyphrase, Open Graph and Twitter Card for this page.</DialogDescription>
          </DialogHeader>
          {editingPage && (
            <PageSeoForm
              initial={editingPage}
              onSubmit={(payload) => updatePageMutation.mutate({ id: editingPage.id, payload })}
              onCancel={() => setPageEditId(null)}
              onDelete={() => deletePageMutation.mutate(editingPage.id)}
              isLoading={updatePageMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={pageCreateOpen} onOpenChange={setPageCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="add-page-seo-desc">
          <DialogHeader>
            <DialogTitle>Add page SEO</DialogTitle>
            <DialogDescription id="add-page-seo-desc" className="sr-only">Add a new page with meta title, description and focus keyphrase.</DialogDescription>
          </DialogHeader>
          <PageSeoCreateForm
            onSubmit={(payload) => createPageMutation.mutate(payload)}
            onCancel={() => setPageCreateOpen(false)}
            isLoading={createPageMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GeneralSeoForm({
  initial,
  onSubmit,
  isLoading,
}: {
  initial: SeoSettingsRow;
  onSubmit: (payload: Partial<SeoSettingsRow>) => void;
  isLoading: boolean;
}) {
  const [site_name, setSite_name] = useState(initial.site_name);
  const [default_meta_title, setDefault_meta_title] = useState(initial.default_meta_title ?? "");
  const [default_meta_description, setDefault_meta_description] = useState(initial.default_meta_description ?? "");
  const [default_og_image_url, setDefault_og_image_url] = useState(initial.default_og_image_url ?? "");
  const [twitter_handle, setTwitter_handle] = useState(initial.twitter_handle ?? "");
  const [is_active, setIs_active] = useState(initial.is_active);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      site_name,
      default_meta_title: default_meta_title.trim() || null,
      default_meta_description: default_meta_description.trim() || null,
      default_og_image_url: default_og_image_url.trim() || null,
      twitter_handle: twitter_handle.trim() || null,
      is_active,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="seo-site-name">Site name</Label>
        <Input id="seo-site-name" value={site_name} onChange={(e) => setSite_name(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="seo-default-title">Default meta title</Label>
          <CharCounter value={default_meta_title} limit={META_TITLE_LIMIT} />
        </div>
        <Input id="seo-default-title" value={default_meta_title} onChange={(e) => setDefault_meta_title(e.target.value)} placeholder="e.g. Urban Hub Student Accommodation Preston" required />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="seo-default-desc">Default meta description</Label>
          <CharCounter value={default_meta_description} limit={META_DESC_LIMIT} />
        </div>
        <Textarea id="seo-default-desc" value={default_meta_description} onChange={(e) => setDefault_meta_description(e.target.value)} rows={3} className="resize-y" placeholder="155–160 characters recommended" required />
      </div>
      <ImageUpload label="Default OG image" value={default_og_image_url} onChange={setDefault_og_image_url} folder="seo" />
      <div className="space-y-2">
        <Label htmlFor="seo-twitter">Twitter handle</Label>
        <Input id="seo-twitter" value={twitter_handle} onChange={(e) => setTwitter_handle(e.target.value)} placeholder="@UrbanHubBooking" required />
      </div>
      <div className="flex items-center gap-2">
        <Switch id="seo-active" checked={is_active} onCheckedChange={setIs_active} />
        <Label htmlFor="seo-active">Use these settings site-wide</Label>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
      </div>
    </form>
  );
}

function PageSeoForm({
  initial,
  onSubmit,
  onCancel,
  onDelete,
  isLoading,
}: {
  initial: SeoPageRow;
  onSubmit: (payload: Partial<SeoPageRow>) => void;
  onCancel: () => void;
  onDelete: () => void;
  isLoading: boolean;
}) {
  const [page_path, setPage_path] = useState(initial.page_path);
  const [page_type, setPage_type] = useState(initial.page_type);
  const [meta_title, setMeta_title] = useState(initial.meta_title ?? "");
  const [meta_description, setMeta_description] = useState(initial.meta_description ?? "");
  const [focus_keyword, setFocus_keyword] = useState(initial.focus_keyword ?? "");
  const [canonical_url, setCanonical_url] = useState(initial.canonical_url ?? "");
  const [og_title, setOg_title] = useState(initial.og_title ?? "");
  const [og_description, setOg_description] = useState(initial.og_description ?? "");
  const [og_image_url, setOg_image_url] = useState(initial.og_image_url ?? "");
  const [og_image_alt, setOg_image_alt] = useState(initial.og_image_alt ?? "");
  const [twitter_title, setTwitter_title] = useState(initial.twitter_title ?? "");
  const [twitter_description, setTwitter_description] = useState(initial.twitter_description ?? "");
  const [twitter_image_url, setTwitter_image_url] = useState(initial.twitter_image_url ?? "");
  const [twitter_image_alt, setTwitter_image_alt] = useState(initial.twitter_image_alt ?? "");
  const [robots_meta, setRobots_meta] = useState(initial.robots_meta ?? "index, follow");
  const [schema_json_raw, setSchema_json_raw] = useState(
    initial.schema_json ? JSON.stringify(initial.schema_json, null, 2) : ""
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const path = page_path.trim().startsWith("/") ? page_path.trim() : `/${page_path.trim()}`;
    if (!path || path !== path.replace(/\s/g, "")) {
      toast.error("Page slug must start with / and contain no spaces.");
      return;
    }
    let schema_json: Record<string, unknown> | null = null;
    if (schema_json_raw.trim()) {
      try {
        schema_json = JSON.parse(schema_json_raw) as Record<string, unknown>;
      } catch {
        toast.error("Schema JSON must be valid JSON.");
        return;
      }
    }
    onSubmit({
      page_path: path,
      page_type,
      meta_title: meta_title.trim() || null,
      meta_description: meta_description.trim() || null,
      focus_keyword: focus_keyword.trim() || null,
      canonical_url: canonical_url.trim() || null,
      og_title: og_title.trim() || null,
      og_description: og_description.trim() || null,
      og_image_url: og_image_url.trim() || null,
      og_image_alt: og_image_alt.trim() || null,
      twitter_title: twitter_title.trim() || null,
      twitter_description: twitter_description.trim() || null,
      twitter_image_url: twitter_image_url.trim() || null,
      twitter_image_alt: twitter_image_alt.trim() || null,
      robots_meta: robots_meta.trim() || null,
      schema_json,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Page slug (URL path)</Label>
          <Input
            value={page_path}
            onChange={(e) => setPage_path(e.target.value)}
            placeholder="/studios"
            required
          />
          <p className="text-xs text-muted-foreground">Must start with / and no spaces. Used as canonical path.</p>
        </div>
        <div className="space-y-2">
          <Label>Page type</Label>
          <select
            value={page_type}
            onChange={(e) => setPage_type(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="page">Page</option>
            <option value="post">Post</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      </div>

      <div className="border-t pt-4 space-y-4">
        <h4 className="text-sm font-semibold">Search meta</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Meta title</Label>
            <CharCounter value={meta_title} limit={META_TITLE_LIMIT} />
          </div>
          <Input value={meta_title} onChange={(e) => setMeta_title(e.target.value)} placeholder="50–60 characters" required />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Meta description</Label>
            <CharCounter value={meta_description} limit={META_DESC_LIMIT} />
          </div>
          <Textarea value={meta_description} onChange={(e) => setMeta_description(e.target.value)} rows={3} className="resize-y" placeholder="155–160 characters" required />
        </div>
        <div className="space-y-2">
          <Label>Focus keyphrase</Label>
          <Input value={focus_keyword} onChange={(e) => setFocus_keyword(e.target.value)} placeholder="e.g. student accommodation Preston" required />
        </div>
        <div className="space-y-2">
          <Label>Canonical URL</Label>
          <Input type="url" value={canonical_url} onChange={(e) => setCanonical_url(e.target.value)} placeholder="https://yoursite.com/page" />
        </div>
        {/* Search engine preview */}
        <SearchPreview
          title={meta_title}
          description={meta_description}
          url={canonical_url || `https://urbanhub.uk${page_path}`}
        />
      </div>

      <div className="border-t pt-4 space-y-4">
        <h4 className="text-sm font-semibold">Open Graph (social sharing)</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>OG title</Label>
            <CharCounter value={og_title} limit={META_TITLE_LIMIT} />
          </div>
          <Input value={og_title} onChange={(e) => setOg_title(e.target.value)} placeholder="Title when shared on social" required />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>OG description</Label>
            <CharCounter value={og_description} limit={META_DESC_LIMIT} />
          </div>
          <Textarea value={og_description} onChange={(e) => setOg_description(e.target.value)} rows={2} className="resize-y" required />
        </div>
        <ImageUpload label="OG image" value={og_image_url} onChange={setOg_image_url} folder="seo" />
        <div className="space-y-2">
          <Label>OG image alt text (optional)</Label>
          <Input value={og_image_alt} onChange={(e) => setOg_image_alt(e.target.value)} placeholder="e.g. Urban Hub Preston building exterior" />
          <p className="text-xs text-muted-foreground">Descriptive alt for social sharing accessibility.</p>
        </div>
      </div>

      <div className="border-t pt-4 space-y-4">
        <h4 className="text-sm font-semibold">Twitter Card (Twitter / X)</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Twitter title</Label>
            <CharCounter value={twitter_title} limit={META_TITLE_LIMIT} />
          </div>
          <Input value={twitter_title} onChange={(e) => setTwitter_title(e.target.value)} placeholder="Title for Twitter" required />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Twitter description</Label>
            <CharCounter value={twitter_description} limit={META_DESC_LIMIT} />
          </div>
          <Textarea value={twitter_description} onChange={(e) => setTwitter_description(e.target.value)} rows={2} className="resize-y" required />
        </div>
        <ImageUpload label="Twitter image" value={twitter_image_url} onChange={setTwitter_image_url} folder="seo" />
        <div className="space-y-2">
          <Label>Twitter image alt text (optional)</Label>
          <Input value={twitter_image_alt} onChange={(e) => setTwitter_image_alt(e.target.value)} placeholder="e.g. Urban Hub Preston building exterior" />
        </div>
      </div>

      <div className="border-t pt-4 space-y-4">
        <h4 className="text-sm font-semibold">Crawling & schema</h4>
        <div className="space-y-2">
          <Label>Robots meta</Label>
          <Input value={robots_meta} onChange={(e) => setRobots_meta(e.target.value)} placeholder="index, follow" required />
        </div>
        <div className="space-y-2">
          <Label>Schema JSON-LD</Label>
          <Textarea
            value={schema_json_raw}
            onChange={(e) => setSchema_json_raw(e.target.value)}
            rows={6}
            className="resize-y font-mono text-xs"
            placeholder='{"@context":"https://schema.org","@type":"WebPage",...}'
          />
          <p className="text-xs text-muted-foreground">Valid JSON for structured data. Leave empty to omit.</p>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-2 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="button" variant="destructive" onClick={onDelete} disabled={isLoading}>Delete</Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
      </div>
    </form>
  );
}

function PageSeoCreateForm({
  onSubmit,
  onCancel,
  isLoading,
}: {
  onSubmit: (payload: Partial<SeoPageRow> & { page_path: string; page_type: string }) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [page_path, setPage_path] = useState("");
  const [page_type, setPage_type] = useState("page");
  const [meta_title, setMeta_title] = useState("");
  const [meta_description, setMeta_description] = useState("");
  const [focus_keyword, setFocus_keyword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const path = page_path.trim().startsWith("/") ? page_path.trim() : `/${page_path.trim()}`;
    if (!path || path !== path.replace(/\s/g, "")) {
      toast.error("Page slug must start with / and contain no spaces.");
      return;
    }
    onSubmit({
      page_path: path,
      page_type,
      meta_title: meta_title.trim() || undefined,
      meta_description: meta_description.trim() || undefined,
      focus_keyword: focus_keyword.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Page slug (URL path)</Label>
        <select
          value={page_path}
          onChange={(e) => setPage_path(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Select or type below</option>
          {PAGE_PATHS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <Input
          value={page_path}
          onChange={(e) => setPage_path(e.target.value)}
          placeholder="/custom-path"
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Page type</Label>
        <select
          value={page_type}
          onChange={(e) => setPage_type(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="page">Page</option>
          <option value="post">Post</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Meta title</Label>
          <CharCounter value={meta_title} limit={META_TITLE_LIMIT} />
        </div>
        <Input value={meta_title} onChange={(e) => setMeta_title(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Meta description</Label>
          <CharCounter value={meta_description} limit={META_DESC_LIMIT} />
        </div>
        <Textarea value={meta_description} onChange={(e) => setMeta_description(e.target.value)} rows={3} className="resize-y" required />
      </div>
      <div className="space-y-2">
        <Label>Focus keyphrase</Label>
        <Input value={focus_keyword} onChange={(e) => setFocus_keyword(e.target.value)} placeholder="e.g. student accommodation Preston" required />
      </div>
      {/* Search engine preview */}
      <SearchPreview
        title={meta_title}
        description={meta_description}
        url={`https://urbanhub.uk${page_path || "/page"}`}
      />
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Create
        </Button>
      </div>
    </form>
  );
}
