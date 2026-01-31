import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { parseWordPressXML, type ParsedWordPressExport, type WordPressPost } from "@/utils/wordpressXmlParser";
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
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ImportStats {
  total: number;
  processed: number;
  success: number;
  failed: number;
  categories: number;
  tags: number;
}

interface WordPressImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function WordPressImport({ open, onOpenChange }: WordPressImportProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedWordPressExport | null>(null);
  const [importing, setImporting] = useState(false);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.xml')) {
      setError('Please select a valid WordPress XML export file (.xml)');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setParsedData(null);
    setStats(null);

    try {
      toast.info('Parsing WordPress export file...');
      const data = await parseWordPressXML(selectedFile);
      setParsedData(data);
      toast.success(`Found ${data.posts.length} posts, ${data.categories.length} categories, ${data.tags.length} tags`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to parse XML file';
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const handleImport = async () => {
    if (!parsedData || !user) {
      toast.error('Please select and parse a WordPress export file first');
      return;
    }

    setImporting(true);
    setError(null);
    setProgress(0);

    const importStats: ImportStats = {
      total: parsedData.posts.length,
      processed: 0,
      success: 0,
      failed: 0,
      categories: 0,
      tags: 0,
    };

    try {
      // Step 1: Import categories
      toast.info('Importing categories...');
      const categoryMap = await importCategories(parsedData.categories);
      importStats.categories = Object.keys(categoryMap).length;

      // Step 2: Import tags
      toast.info('Importing tags...');
      const tagMap = await importTags(parsedData.tags);
      importStats.tags = Object.keys(tagMap).length;

      // Step 3: Import posts
      toast.info('Importing blog posts...');
      for (let i = 0; i < parsedData.posts.length; i++) {
        const post = parsedData.posts[i];
        try {
          await importPost(post, categoryMap, tagMap, user.id);
          importStats.success++;
        } catch (err) {
          console.error(`Failed to import post "${post.title}":`, err);
          importStats.failed++;
        }
        importStats.processed++;
        setProgress(Math.round((importStats.processed / importStats.total) * 100));
        setStats({ ...importStats });
      }

      toast.success(
        `Import complete! ${importStats.success} posts imported, ${importStats.failed} failed`
      );
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      onOpenChange(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Import failed';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setImporting(false);
    }
  };

  const importCategories = async (
    categories: Array<{ name: string; slug: string }>
  ): Promise<Record<string, string>> => {
    const categoryMap: Record<string, string> = {};

    for (const category of categories) {
      try {
        // Check if category exists
        const { data: existing } = await supabase
          .from('blog_categories')
          .select('id')
          .eq('slug', category.slug)
          .maybeSingle();

        if (existing) {
          categoryMap[category.slug] = existing.id;
          continue;
        }

        // Create category
        const { data: newCategory, error } = await supabase
          .from('blog_categories')
          .insert({
            name: category.name,
            slug: category.slug,
          })
          .select('id')
          .single();

        if (error) throw error;
        if (newCategory) {
          categoryMap[category.slug] = newCategory.id;
        }
      } catch (err) {
        console.error(`Failed to import category "${category.name}":`, err);
      }
    }

    return categoryMap;
  };

  const importTags = async (tags: Array<{ name: string; slug: string }>): Promise<Record<string, string>> => {
    const tagMap: Record<string, string> = {};

    for (const tag of tags) {
      try {
        // Check if tag exists
        const { data: existing } = await supabase
          .from('blog_tags')
          .select('id')
          .eq('slug', tag.slug)
          .maybeSingle();

        if (existing) {
          tagMap[tag.slug] = existing.id;
          continue;
        }

        // Create tag
        const { data: newTag, error } = await supabase
          .from('blog_tags')
          .insert({
            name: tag.name,
            slug: tag.slug,
          })
          .select('id')
          .single();

        if (error) throw error;
        if (newTag) {
          tagMap[tag.slug] = newTag.id;
        }
      } catch (err) {
        console.error(`Failed to import tag "${tag.name}":`, err);
      }
    }

    return tagMap;
  };

  const importPost = async (
    post: WordPressPost,
    categoryMap: Record<string, string>,
    tagMap: Record<string, string>,
    userId: string
  ) => {
    // Extract URL path from WordPress link
    const blogPath = `/${post.slug}`;

    // Step 1: Create or update SEO page
    let seoPageId: string | null = null;
    if (post.seo.metaTitle || post.seo.metaDescription) {
      const { data: existingSeo } = await supabase
        .from('seo_pages')
        .select('id')
        .eq('page_path', blogPath)
        .maybeSingle();

      const seoData = {
        page_path: blogPath,
        page_type: 'post',
        meta_title: post.seo.metaTitle || null,
        meta_description: post.seo.metaDescription || null,
        focus_keyword: post.seo.focusKeyword || null,
        canonical_url: post.seo.canonicalUrl || null,
        og_title: post.seo.ogTitle || null,
        og_description: post.seo.ogDescription || null,
        og_image_url: post.seo.ogImage || null,
        twitter_title: post.seo.twitterTitle || null,
        twitter_description: post.seo.twitterDescription || null,
        twitter_image_url: post.seo.twitterImage || null,
        robots_meta: buildRobotsMeta(post.seo),
      };

      if (existingSeo) {
        const { data: updated } = await supabase
          .from('seo_pages')
          .update(seoData)
          .eq('id', existingSeo.id)
          .select('id')
          .single();
        seoPageId = updated?.id || null;
      } else {
        const { data: newSeo, error } = await supabase
          .from('seo_pages')
          .insert(seoData)
          .select('id')
          .single();
        if (error) throw error;
        seoPageId = newSeo?.id || null;
      }
    }

    // Step 2: Get category ID
    const categoryId = post.categories.length > 0 && categoryMap[post.categories[0].slug]
      ? categoryMap[post.categories[0].slug]
      : null;

    // Step 3: Create or update blog post
    const { data: existingPost } = await supabase
      .from('blog_posts')
      .select('id')
      .eq('slug', post.slug)
      .maybeSingle();

    const postData = {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || null,
      content: post.content,
      featured_image_url: null, // Will be handled separately if needed
      author_id: userId,
      author_name: post.author.displayName,
      author_email: post.author.email,
      status: ['publish', 'published'].includes(String(post.status || '').toLowerCase()) ? 'published' : 'draft',
      published_at: post.date ? new Date(post.date).toISOString() : null,
      category_id: categoryId,
      seo_page_id: seoPageId,
      wordpress_id: post.id,
      wordpress_url: post.link,
    };

    let postId: string;
    if (existingPost) {
      const { data: updated, error } = await supabase
        .from('blog_posts')
        .update(postData)
        .eq('id', existingPost.id)
        .select('id')
        .single();
      if (error) throw error;
      postId = updated.id;
    } else {
      const { data: newPost, error } = await supabase
        .from('blog_posts')
        .insert(postData)
        .select('id')
        .single();
      if (error) throw error;
      postId = newPost.id;
    }

    // Step 4: Link tags
    if (post.tags.length > 0) {
      // Remove existing tag links
      await supabase.from('blog_post_tags').delete().eq('post_id', postId);

      // Add new tag links
      const tagLinks = post.tags
        .map((tag) => tagMap[tag.slug])
        .filter((tagId): tagId is string => !!tagId)
        .map((tagId) => ({
          post_id: postId,
          tag_id: tagId,
        }));

      if (tagLinks.length > 0) {
        await supabase.from('blog_post_tags').insert(tagLinks);
      }
    }
  };

  const buildRobotsMeta = (seo: WordPressPost['seo']): string => {
    const parts: string[] = [];
    if (seo.noindex === '1') parts.push('noindex');
    else parts.push('index');
    if (seo.nofollow === '1') parts.push('nofollow');
    else parts.push('follow');
    return parts.join(', ');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg" aria-describedby="wordpress-import-desc">
        <DialogHeader>
          <DialogTitle>Import WordPress Blog Posts</DialogTitle>
          <DialogDescription id="wordpress-import-desc">
            Upload your WordPress XML export file to import all blog posts with SEO data
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="wordpress-export">WordPress Export File (.xml)</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                id="wordpress-export"
                type="file"
                accept=".xml"
                onChange={handleFileSelect}
                disabled={importing}
                className="flex-1"
              />
              {file && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{file.name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Parsed Data Preview */}
          {parsedData && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Export Preview</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="font-semibold">Posts</div>
                    <div className="text-xl font-bold">{parsedData.posts.length}</div>
                  </div>
                  <div>
                    <div className="font-semibold">Categories</div>
                    <div className="text-xl font-bold">{parsedData.categories.length}</div>
                  </div>
                  <div>
                    <div className="font-semibold">Tags</div>
                    <div className="text-xl font-bold">{parsedData.tags.length}</div>
                  </div>
                  <div>
                    <div className="font-semibold">Authors</div>
                    <div className="text-xl font-bold">{parsedData.authors.length}</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Site: {parsedData.siteTitle} ({parsedData.siteUrl})
                </div>
              </CardContent>
            </Card>
          )}

          {/* Import Progress */}
          {importing && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Import Progress</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <Progress value={progress} className="h-2" />
                <div className="text-sm text-muted-foreground">{progress}% complete</div>
                {stats && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="font-semibold">Processed</div>
                      <div className="text-lg">{stats.processed} / {stats.total}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-green-600">Success</div>
                      <div className="text-lg">{stats.success}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-red-600">Failed</div>
                      <div className="text-lg">{stats.failed}</div>
                    </div>
                    <div>
                      <div className="font-semibold">Categories</div>
                      <div className="text-lg">{stats.categories}</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Import Button */}
          <Button
            onClick={handleImport}
            disabled={!parsedData || importing}
            className="w-full"
            size="lg"
          >
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Start Import
              </>
            )}
          </Button>

          {/* Success Message */}
          {stats && !importing && stats.success > 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Successfully imported {stats.success} blog posts with SEO data!
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
