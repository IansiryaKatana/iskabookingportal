import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import NotFound from "@/pages/NotFound";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useBrandingSettings } from "@/hooks/useBranding";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, User, ArrowLeft, Share2 } from "lucide-react";
import { format } from "date-fns";
import { AnimatedHeading, AnimatedParagraph, AnimatedCard } from "@/components/animations/AnimatedText";

interface BlogTag {
  name: string;
  slug: string;
}

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featured_image_url: string | null;
  published_at: string | null;
  author_name?: string;
  category_name?: string;
  category_slug?: string;
  tags?: BlogTag[];
}

const BlogDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: brandingSettings } = useBrandingSettings();
  const companyName = brandingSettings?.company_name || "Urban Hub";

  const [blogPost, setBlogPost] = useState<BlogPost | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchBlogPost = async () => {
      if (!slug) return;

      try {
        const { data: post, error } = await supabase
          .from("blog_posts")
          .select(`
            id,
            title,
            slug,
            excerpt,
            content,
            featured_image_url,
            published_at,
            author_name,
            category_id,
            blog_categories (
              id,
              name,
              slug
            ),
            blog_post_tags (
              tag_id,
              blog_tags (
                name,
                slug
              )
            )
          `)
          .eq("slug", slug)
          .eq("status", "published")
          .single();

        if (error) {
          if (error.code === "PGRST116") {
            // Post not found – show 404 page
            setBlogPost(null);
            setLoading(false);
            setNotFound(true);
            return;
          }
          console.error("Error fetching blog post:", error);
          return;
        }

        if (post) {
          const tagList: BlogTag[] = (post.blog_post_tags || [])
            .map((pt: { blog_tags?: { name: string; slug: string } | null }) => pt.blog_tags)
            .filter(Boolean) as BlogTag[];
          const formattedPost: BlogPost = {
            id: post.id,
            title: post.title,
            slug: post.slug,
            excerpt: post.excerpt || "",
            content: post.content || "",
            featured_image_url: post.featured_image_url,
            published_at: post.published_at,
            author_name: "Urban Hub Preston",
            category_name: post.blog_categories?.name ?? undefined,
            category_slug: post.blog_categories?.slug ?? undefined,
            tags: tagList,
          };
          setBlogPost(formattedPost);

          // Fetch related posts (same category, excluding current)
          const categoryId = post.category_id ?? post.blog_categories?.id;
          if (categoryId) {
            const { data: related } = await supabase
              .from("blog_posts")
              .select(`
                id,
                title,
                slug,
                excerpt,
                featured_image_url,
                published_at,
                blog_categories (
                  name,
                  slug
                )
              `)
              .eq("status", "published")
              .eq("category_id", categoryId)
              .neq("id", post.id)
              .order("published_at", { ascending: false })
              .limit(3);

            if (related) {
              setRelatedPosts(
                related.map((p: any) => ({
                  id: p.id,
                  title: p.title,
                  slug: p.slug,
                  excerpt: p.excerpt || "",
                  content: "",
                  featured_image_url: p.featured_image_url,
                  published_at: p.published_at,
                  category_name: p.blog_categories?.name,
                }))
              );
            }
          }
        }
      } catch (error) {
        console.error("Error fetching blog post:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBlogPost();
  }, [slug, navigate]);

  // SEO meta tags are now handled by MetaTagsUpdater using seo_pages table
  // Only add dynamic JSON-LD for BlogPosting rich results
  useEffect(() => {
    if (!blogPost) return;

    const articleData = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: blogPost.title,
      description: blogPost.excerpt,
      image: blogPost.featured_image_url || brandingSettings?.favicon_path || "/favicon.png",
      datePublished: blogPost.published_at,
      author: {
        "@type": "Person",
        name: "Urban Hub Preston",
      },
      publisher: {
        "@type": "Organization",
        name: companyName,
      },
    };

    let existingScript = document.querySelector('script[type="application/ld+json"][data-blog-post]');
    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-blog-post", "true");
    script.textContent = JSON.stringify(articleData);
    document.head.appendChild(script);

    return () => {
      const scriptToRemove = document.querySelector('script[type="application/ld+json"][data-blog-post]');
      if (scriptToRemove) {
        scriptToRemove.remove();
      }
    };
  }, [blogPost, companyName, brandingSettings]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "";
    try {
      return format(new Date(dateString), "MMMM dd, yyyy");
    } catch {
      return dateString;
    }
  };

  const handleShare = () => {
    if (navigator.share && blogPost) {
      navigator.share({
        title: blogPost.title,
        text: blogPost.excerpt,
        url: window.location.href,
      });
    }
  };

  if (loading) {
    return null; // Preloader handles loading state
  }

  if (notFound) {
    return <NotFound />;
  }

  if (!blogPost) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="container mx-auto px-4 py-16 max-w-4xl text-center">
          <AnimatedHeading delay={0.1} className="text-2xl font-bold mb-4">Blog Post Not Found</AnimatedHeading>
          <Link to="/blog" className="text-primary hover:underline">
            ← Back to Blog
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      <main className="pt-20 pb-12 md:pt-24 md:pb-16 lg:pt-[146px] lg:pb-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
          {/* Article Header */}
          <article>
            <header className="mb-8">
              {/* Category and Back to Blog in same row; flex column on very small screens for tap targets */}
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3 mb-3">
                {blogPost.category_name ? (
                  <span className="text-primary font-semibold text-sm">
                    {blogPost.category_name}
                  </span>
                ) : (
                  <span />
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate("/blog")}
                  className="bg-muted hover:bg-muted/80 text-foreground border border-border shrink-0"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Blog
                </Button>
              </div>
              <AnimatedHeading delay={0.1} className="text-3xl md:text-4xl lg:text-5xl font-display font-black uppercase tracking-wide text-gray-900 mb-4">
                {blogPost.title}
              </AnimatedHeading>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-6">
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {formatDate(blogPost.published_at)}
                </span>
                <span className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Urban Hub Preston
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleShare}
                  className="ml-auto"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
              </div>
            </header>

            {/* Featured Image */}
            {blogPost.featured_image_url && (
              <div className="mb-8">
                <img
                  src={blogPost.featured_image_url}
                  alt={blogPost.title}
                  className="w-full h-auto rounded-2xl shadow-lg"
                />
              </div>
            )}

            {/* Article Content */}
            <div
              className="prose prose-lg max-w-none mb-12"
              dangerouslySetInnerHTML={{ __html: blogPost.content }}
            />

            {/* Tags */}
            {blogPost.tags && blogPost.tags.length > 0 && (
              <div className="mb-12">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {blogPost.tags.map((tag) => (
                    <Link
                      key={tag.slug}
                      to={`/blog?tag=${encodeURIComponent(tag.slug)}`}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-primary hover:text-white transition-colors"
                    >
                      {tag.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </article>

          {/* Internal links for SEO and navigation */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 mb-8">
            <Link to="/blog" className="hover:text-primary transition-colors">← Back to blog</Link>
            <span className="text-gray-300">·</span>
            <Link to="/studios" className="hover:text-primary transition-colors">View studios</Link>
            <span className="text-gray-300">·</span>
            <Link to="/contact" className="hover:text-primary transition-colors">Contact us</Link>
            <span className="text-gray-300">·</span>
            <Link to="/reviews" className="hover:text-primary transition-colors">Reviews</Link>
          </div>

          {/* Related Posts */}
          {relatedPosts.length > 0 && (
            <section className="mt-16 pt-12 border-t border-gray-200">
              <AnimatedHeading delay={0.2} className="text-2xl md:text-3xl font-display font-black uppercase tracking-wide text-gray-900 mb-8">
                Related Posts
              </AnimatedHeading>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {relatedPosts.map((post, index) => (
                  <AnimatedCard key={post.id} delay={0.3} index={index}>
                    <Card
                      className="overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 group"
                    >
                      <Link to={`/${post.slug}`} className="block">
                        <img
                          src={post.featured_image_url || "/placeholder.svg"}
                          alt={post.title}
                          className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <CardContent className="p-5">
                          <h3 className="font-bold text-base text-gray-900 mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                            {post.title}
                          </h3>
                          <p className="text-xs text-gray-600 mb-2">{formatDate(post.published_at)}</p>
                          <p className="text-gray-700 text-sm line-clamp-2">{post.excerpt}</p>
                        </CardContent>
                      </Link>
                    </Card>
                  </AnimatedCard>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default BlogDetail;
