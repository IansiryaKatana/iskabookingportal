import { useEffect, useState, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useBrandingSettings } from "@/hooks/useBranding";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Calendar, User } from "lucide-react";
import { format } from "date-fns";
import { AnimatedText, AnimatedParagraph, AnimatedCard } from "@/components/animations/AnimatedText";
import TypingTitle from "@/components/TypingTitle";
import Noise from "@/components/Noise";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content?: string;
  featured_image_url: string | null;
  published_at: string | null;
  author_name?: string;
  category_name?: string;
  category_slug?: string;
  tags?: string[];
}

interface BlogCategory {
  id: string;
  name: string;
  slug: string;
}

const Blog = () => {
  const { data: brandingSettings } = useBrandingSettings();
  const location = useLocation();
  const companyName = brandingSettings?.company_name || "Urban Hub";
  
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [visibleGridCount, setVisibleGridCount] = useState(9); // 3 rows × 3 on desktop

  // Fetch blog posts from database
  useEffect(() => {
    const fetchBlogPosts = async () => {
      try {
        // Try to fetch from blog_posts table if it exists
        const { data: posts, error: postsError } = await supabase
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
            ),
            blog_post_tags (
              tag_id,
              blog_tags (
                name,
                slug
              )
            )
          `)
          .eq("status", "published")
          .order("published_at", { ascending: false });

        if (postsError && postsError.code !== "PGRST116") {
          console.error("Error fetching blog posts:", postsError);
        }

        if (posts && posts.length > 0) {
          const formattedPosts: BlogPost[] = posts.map((post: any) => {
            const tagList: BlogTag[] = (post.blog_post_tags || [])
              .map((pt: { blog_tags?: { name: string; slug: string } | null }) => pt.blog_tags)
              .filter(Boolean);
            return {
              id: post.id,
              title: post.title,
              slug: post.slug,
              excerpt: post.excerpt || "",
              featured_image_url: post.featured_image_url,
              published_at: post.published_at,
              author_name: "Urban Hub Preston",
              category_name: post.blog_categories?.name,
              category_slug: post.blog_categories?.slug,
              tags: tagList,
            };
          });
          setBlogPosts(formattedPosts);
        }

        // Try to fetch categories
        const { data: cats, error: catsError } = await supabase
          .from("blog_categories")
          .select("id, name, slug")
          .order("name", { ascending: true });

        if (catsError && catsError.code !== "PGRST116") {
          console.error("Error fetching categories:", catsError);
        }

        if (cats) {
          setCategories(cats);
        }
      } catch (error) {
        console.error("Error fetching blog data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBlogPosts();
  }, []);

  // SEO meta tags are now handled by MetaTagsUpdater using seo_pages table

  // Tag from URL (?tag=slug) for filtering
  const tagSlugFromUrl = useMemo(
    () => new URLSearchParams(location.search).get("tag"),
    [location.search]
  );

  // Filter and search logic
  const filteredPosts = useMemo(() => {
    let filtered = blogPosts;

    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter((post) => post.category_slug === selectedCategory);
    }

    // Filter by tag from URL
    if (tagSlugFromUrl) {
      filtered = filtered.filter(
        (post) => post.tags?.some((t) => t.slug === tagSlugFromUrl)
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (post) =>
          post.title.toLowerCase().includes(query) ||
          post.excerpt.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [blogPosts, selectedCategory, tagSlugFromUrl, searchQuery]);

  // Reset visible grid count when filters change
  useEffect(() => {
    setVisibleGridCount(9);
  }, [searchQuery, tagSlugFromUrl, selectedCategory]);

  // Get featured post (latest)
  const featuredPost = filteredPosts[0] || null;

  // Get top reads (next 4 posts for desktop balance)
  const topReads = filteredPosts.slice(1, 5);

  // Get grid posts (remaining posts)
  const gridPosts = filteredPosts.slice(5);
  const visibleGridPosts = gridPosts.slice(0, visibleGridCount);
  const hasMoreGridPosts = visibleGridCount < gridPosts.length;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "";
    try {
      return format(new Date(dateString), "MMMM dd, yyyy");
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading blog posts...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      {/* Hero Section - black with noise, search in hero */}
      <div className="w-full p-[5px] bg-red-50">
        <section
          className="relative flex flex-col items-center justify-center rounded-3xl overflow-hidden bg-black"
          style={{ minHeight: "calc(32vh + 80px)" }}
        >
          <Noise patternAlpha={12} />
          <div className="container relative z-10 mx-auto max-w-4xl px-4 text-center pt-20 pb-10 md:pt-24 md:pb-12">
            <TypingTitle
              as="h1"
              text="Blog"
              className="text-4xl md:text-5xl lg:text-6xl font-display font-black uppercase leading-tight text-white mb-4"
              typingSpeed={34}
            />
            <AnimatedParagraph delay={0.2} className="text-sm md:text-base text-white/90 max-w-2xl mx-auto mb-6">
              Stay updated with the latest news, tips, and insights about{" "}
              <Link to="/studios" className="underline hover:text-primary transition-colors">student accommodation</Link>
              {" "}and living at Urban Hub. Explore our{" "}
              <Link to="/about" className="underline hover:text-primary transition-colors">about</Link>
              {" "}page or{" "}
              <Link to="/reviews" className="underline hover:text-primary transition-colors">reviews</Link>
              .
            </AnimatedParagraph>
            <AnimatedText delay={0.3}>
              <div className="relative max-w-md mx-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search blogs"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12 rounded-lg border-2 border-white/30 bg-white/95 text-gray-900 placeholder:text-gray-500 focus:border-white focus:ring-2 focus:ring-white/30 w-full"
                />
              </div>
            </AnimatedText>
          </div>
        </section>
      </div>

      <main className="bg-red-50 py-12 md:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          {/* The Latest and Top Reads Section */}
          {featuredPost && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
              {/* The Latest - Featured Post (clickable) */}
              <div className="lg:col-span-2">
                <h2 className="text-2xl md:text-3xl font-display font-black uppercase tracking-wide text-gray-900 mb-6">
                  The Latest
                </h2>
                <Link to={`/${featuredPost.slug}`} className="block group">
                  <Card className="overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300">
                    <div className="relative">
                      <img
                        src={featuredPost.featured_image_url || "/placeholder.svg"}
                        alt={featuredPost.title}
                        className="w-full h-64 md:h-80 object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                      {featuredPost.tags && featuredPost.tags.length > 0 && (
                        <div className="absolute bottom-4 left-4 flex gap-2">
                          {featuredPost.tags.slice(0, 2).map((tag) => (
                            <Link
                              key={tag.slug}
                              to={`/blog?tag=${encodeURIComponent(tag.slug)}`}
                              onClick={(e) => e.stopPropagation()}
                              className="bg-black/80 text-white text-xs font-semibold px-3 py-1 rounded-full hover:bg-black"
                            >
                              {tag.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                    <CardContent className="p-6">
                      <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-3 line-clamp-2 group-hover:text-primary transition-colors">
                        {featuredPost.title}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDate(featuredPost.published_at)}
                        </span>
                        <span className="flex items-center gap-1 text-gray-600">
                          <User className="h-4 w-4" />
                          Urban Hub Preston
                        </span>
                      </div>
                      <p className="text-gray-700 mb-4 line-clamp-3">{featuredPost.excerpt}</p>
                      <span className="text-primary font-semibold group-hover:underline inline-flex items-center gap-1">
                        Read more
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              </div>

              {/* Top Reads Sidebar (4 on desktop, clickable) */}
              {topReads.length > 0 && (
                <div>
                  <h2 className="text-2xl md:text-3xl font-display font-black uppercase tracking-wide text-gray-900 mb-6">
                    Top Reads
                  </h2>
                  <div className="space-y-4">
                    {topReads.map((post) => (
                      <Link key={post.id} to={`/${post.slug}`} className="block group">
                        <Card className="overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-300">
                          <div className="flex gap-4 p-4">
                            <img
                              src={post.featured_image_url || "/placeholder.svg"}
                              alt={post.title}
                              className="w-24 h-24 object-cover rounded-lg flex-shrink-0 group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-gray-900 mb-2 line-clamp-2 text-sm group-hover:text-primary transition-colors">
                                {post.title}
                              </h4>
                              <div className="flex items-center gap-3 text-xs text-gray-600">
                                <span>{formatDate(post.published_at)}</span>
                                Urban Hub Preston
                              </div>
                            </div>
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Active tag filter chip */}
          {tagSlugFromUrl && (
            <div className="mb-6 flex items-center gap-2">
              <span className="text-sm text-gray-600">Filtering by tag:</span>
              <span className="px-3 py-1 bg-primary text-white text-sm font-semibold rounded-full">
                {tagSlugFromUrl}
              </span>
              <Link to="/blog" className="text-sm text-primary hover:underline">
                Clear
              </Link>
            </div>
          )}

          {/* Blog Grid - 3 per row on desktop, initially 3 rows (9), Load more adds 3 */}
          {gridPosts.length > 0 ? (
            <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleGridPosts.map((post, index) => (
                <AnimatedCard key={post.id} delay={0.3} index={index}>
                  <Card
                    className="overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 group"
                  >
                    <Link to={`/${post.slug}`} className="block">
                      <div className="relative">
                        <img
                          src={post.featured_image_url || "/placeholder.svg"}
                          alt={post.title}
                          className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        {post.tags && post.tags.length > 0 && (
                          <div className="absolute bottom-3 left-3 flex gap-2">
                            {post.tags.slice(0, 2).map((tag) => (
                              <Link
                                key={tag.slug}
                                to={`/blog?tag=${encodeURIComponent(tag.slug)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-black/80 text-white text-xs font-semibold px-2 py-1 rounded hover:bg-black"
                              >
                                {tag.name}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                      <CardContent className="p-5">
                        <h3 className="font-bold text-lg text-gray-900 mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                          {post.title}
                        </h3>
                        <p className="text-sm text-gray-600 mb-3">{formatDate(post.published_at)}</p>
                        <p className="text-gray-700 text-sm mb-4 line-clamp-3">{post.excerpt}</p>
                        <span className="text-primary font-semibold text-sm hover:underline">
                          Read More
                        </span>
                      </CardContent>
                    </Link>
                  </Card>
                </AnimatedCard>
              ))}
            </div>
            {hasMoreGridPosts && (
              <div className="flex justify-center mt-10">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setVisibleGridCount((prev) => prev + 3)}
                  className="min-w-[160px]"
                >
                  Load more
                </Button>
              </div>
            )}
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg">
                {searchQuery || tagSlugFromUrl
                  ? "No blog posts found matching your criteria."
                  : "No blog posts available yet. Check back soon!"}
              </p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Blog;
