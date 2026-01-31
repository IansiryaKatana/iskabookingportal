import { useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useBrandingSettings } from "@/hooks/useBranding";
import { useSlotUrl } from "@/hooks/useWebsiteImageSlots";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useReviews } from "@/hooks/useReviews";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { AnimatedText, AnimatedParagraph } from "@/components/animations/AnimatedText";
import TypingTitle from "@/components/TypingTitle";
import { Star, Loader2, BadgeCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const REVIEWS_PAGE_PATH = "/reviews";

const Reviews = () => {
  const { data: brandingSettings } = useBrandingSettings();
  const { data: seo } = usePageSeo(REVIEWS_PAGE_PATH);
  const location = useLocation();
  const companyName = brandingSettings?.company_name || "Urban Hub";
  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";
  const twitterHandle = brandingSettings?.twitter_handle || "@UrbanHubBooking";

  const { data: reviews, isLoading } = useReviews();

  useEffect(() => {
    const pageTitle = seo?.meta_title ?? `Reviews | ${companyName} Student Accommodation Preston`;
    const pageDescription =
      seo?.meta_description ??
      `Read honest reviews from students and residents at ${companyName} Preston. See what others say about our student accommodation, studios, and facilities.`;
    const ogImage = seo?.og_image_url || brandingSettings?.favicon_path || "/favicon.png";
    const canonical = seo?.canonical_url || `${siteUrl}${location.pathname}`;

    document.title = pageTitle;

    const setMeta = (nameOrProperty: string, content: string, isProperty = false) => {
      const attr = isProperty ? "property" : "name";
      let el = document.querySelector(`meta[${attr}="${nameOrProperty}"]`) as HTMLMetaElement;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, nameOrProperty);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setMeta("description", pageDescription);
    const keywords = `reviews, student accommodation reviews, ${companyName} reviews, Preston student housing reviews, Urban Hub reviews`;
    setMeta("keywords", keywords);
    if (seo?.robots_meta) setMeta("robots", seo.robots_meta);

    setMeta("og:title", seo?.og_title ?? pageTitle, true);
    setMeta("og:description", seo?.og_description ?? pageDescription, true);
    setMeta("og:url", canonical, true);
    setMeta("og:type", "website", true);
    setMeta("og:image", ogImage, true);

    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", seo?.twitter_title ?? pageTitle);
    setMeta("twitter:description", seo?.twitter_description ?? pageDescription);
    setMeta("twitter:image", seo?.twitter_image_url || ogImage);
    setMeta("twitter:site", twitterHandle);

    let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute("href", canonical);

    const aggregateRating =
      reviews && reviews.length > 0
        ? {
            "@type": "AggregateRating" as const,
            ratingValue: reviews.reduce((a, r) => a + r.rating, 0) / reviews.length,
            bestRating: 5,
            worstRating: 1,
            ratingCount: reviews.length,
            reviewCount: reviews.length,
          }
        : null;
    const reviewItems =
      reviews?.slice(0, 10).map((r) => ({
        "@type": "Review" as const,
        author: { "@type": "Person" as const, name: r.reviewer_name },
        datePublished: r.created_at,
        reviewRating: { "@type": "Rating" as const, ratingValue: r.rating, bestRating: 5, worstRating: 1 },
        ...(r.title && { name: r.title }),
        reviewBody: r.content,
      })) ?? [];

    const structuredData = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: pageTitle,
      description: pageDescription,
      url: canonical,
      ...(aggregateRating && { aggregateRating }),
      ...(reviewItems.length > 0 && { review: reviewItems }),
    };

    const scriptId = "reviews-page-structured-data";
    const existing = document.getElementById(scriptId);
    if (existing) existing.remove();
    const script = document.createElement("script");
    script.id = scriptId;
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(structuredData);
    document.head.appendChild(script);

    return () => {
      const toRemove = document.getElementById(scriptId);
      if (toRemove) toRemove.remove();
    };
  }, [
    companyName,
    siteUrl,
    location.pathname,
    seo,
    brandingSettings?.favicon_path,
    twitterHandle,
    reviews,
  ]);

  const heroSlotUrl = useSlotUrl("hero_reviews", brandingSettings?.studio_catalog_hero_image);
  const heroImagePath = heroSlotUrl || "https://urbanhub.uk/wp-content/uploads/2025/05/URBAN-HUB-OUTSIDE-A-3-of-1-scaled-1.webp";

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Hero */}
      <div className="w-full p-[5px] bg-red-50">
        <section
          aria-label="Urban Hub Preston student accommodation building - Reviews page hero"
          className="relative flex items-center justify-center rounded-3xl overflow-hidden"
          style={{
            minHeight: "50vh",
            backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.5) 50%, rgba(0, 0, 0, 0.7) 100%), url('${heroImagePath}')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="container mx-auto max-w-4xl px-4 text-center text-white space-y-6 py-24">
            <TypingTitle
              as="h1"
              text="REVIEWS"
              className="text-5xl md:text-6xl lg:text-7xl font-display font-black uppercase leading-tight"
              typingSpeed={32}
            />
            <AnimatedParagraph delay={0.2} className="text-sm md:text-base text-white/90 max-w-2xl mx-auto">
              See what our residents say about living at{" "}
              <Link to="/about" className="underline hover:text-accent-yellow transition-colors">{companyName}</Link>
              . Explore our{" "}
              <Link to="/studios" className="underline hover:text-accent-yellow transition-colors">studios</Link>
              {" "}or{" "}
              <Link to="/contact" className="underline hover:text-accent-yellow transition-colors">contact us</Link>
              . Share your experience too.
            </AnimatedParagraph>
          </div>
        </section>
      </div>

      <main className="bg-red-50 py-16 md:py-24" role="main" id="main-content">
        <div className="container mx-auto px-4 max-w-5xl space-y-16">
          {/* Add review form */}
          <section aria-labelledby="add-review-heading">
            <AnimatedText delay={0.1}>
              <h2 id="add-review-heading" className="text-2xl md:text-3xl font-display font-black uppercase tracking-wide text-center mb-8">
                Add your review
              </h2>
            </AnimatedText>
            <ReviewForm />
          </section>

          {/* Reviews list */}
          <section aria-labelledby="reviews-heading">
            <AnimatedText delay={0.2}>
              <h2 id="reviews-heading" className="text-2xl md:text-3xl font-display font-black uppercase tracking-wide text-center mb-8">
                What our residents say
              </h2>
            </AnimatedText>

            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              </div>
            ) : !reviews?.length ? (
              <div className="rounded-2xl border border-dashed bg-card/50 p-12 text-center">
                <p className="text-muted-foreground">No reviews yet. Be the first to share your experience!</p>
              </div>
            ) : (
              <div className="grid gap-6 md:gap-8" role="list">
                {reviews.map((review) => (
                  <Card
                    key={review.id}
                    className={`overflow-hidden transition-shadow hover:shadow-md ${review.featured ? "ring-2 ring-primary/30" : ""}`}
                  >
                    <CardContent className="p-6 md:p-8">
                    <article itemScope itemType="https://schema.org/Review" role="listitem">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`h-5 w-5 ${
                                    star <= review.rating ? "fill-primary text-primary" : "text-muted-foreground/30"
                                  }`}
                                />
                              ))}
                            </div>
                            {review.verified_purchase && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <BadgeCheck className="h-4 w-4 text-green-600" />
                                Verified resident
                              </span>
                            )}
                            {review.featured && (
                              <span className="text-xs font-semibold uppercase tracking-wide text-primary">Featured</span>
                            )}
                          </div>
                          <time className="text-sm text-muted-foreground" dateTime={review.created_at}>
                            {new Date(review.created_at).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </time>
                        </div>
                        {review.title && (
                          <h3 className="text-lg font-semibold" itemProp="name">{review.title}</h3>
                        )}
                        <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap" itemProp="reviewBody">{review.content}</p>
                        <p className="text-sm font-medium" itemProp="author" itemScope itemType="https://schema.org/Person">
                          <span itemProp="name">— {review.reviewer_name}</span>
                        </p>
                      </div>
                    </article>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Reviews;
