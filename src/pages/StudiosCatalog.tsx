import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllStudioAvailability, getAvailabilityTag, isFullyBooked } from "@/hooks/useStudioAvailability";

type StudioGradeSummary = {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  gallery: { url: string }[];
  weeklyPrice: number | null;
  academicYear: string | null;
};

const StudiosCatalog = () => {
  const [grades, setGrades] = useState<StudioGradeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: availabilityData, isLoading: availabilityLoading } = useAllStudioAvailability();

  useEffect(() => {
    let mounted = true;

    const loadGrades = async () => {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from("studio_grades")
        .select(
          `
            id,
            name,
            slug,
            short_description,
            studio_grade_media (
              url,
              is_hero,
              position
            ),
            studio_grade_prices!inner (
              weekly_price,
              academic_year:academic_years (
                name
              )
            )
          `,
        )
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (!mounted) return;

      if (fetchError) {
        console.error("Unable to load studio grades:", fetchError);
        setError("We couldn't load the studio catalogue just now. Please try again shortly.");
        setGrades([]);
        setLoading(false);
        return;
      }

      const summaries =
        data?.map((grade) => {
          const gallery =
            grade.studio_grade_media
              ?.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
              .map((item) => ({ url: item.url }))
              .filter((item) => Boolean(item.url)) ?? [];

          const sortedPrices =
            grade.studio_grade_prices
              ?.filter((price) => typeof price.weekly_price === "number")
              .sort(
                (a, b) =>
                  (a.weekly_price ?? Number.POSITIVE_INFINITY) -
                  (b.weekly_price ?? Number.POSITIVE_INFINITY),
              ) ?? [];
          const primaryPrice = sortedPrices[0];

          return {
            id: grade.id,
            name: grade.name,
            slug: grade.slug,
            short_description: grade.short_description,
            gallery,
            weeklyPrice: primaryPrice?.weekly_price ?? null,
            academicYear: primaryPrice?.academic_year?.name ?? null,
          };
        }) ?? [];

      setGrades(summaries);
      setError(null);
      setLoading(false);
    };

    loadGrades();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <section className="relative flex items-center justify-center min-h-[65vh] overflow-hidden bg-muted/30">
          <div className="absolute inset-0 bg-gradient-to-b from-muted/50 via-muted/40 to-muted/60" />
          <div className="relative z-10 container mx-auto max-w-4xl px-4 text-center text-muted-foreground space-y-6 py-24">
            <Skeleton className="mx-auto h-4 w-52 rounded-full bg-muted-foreground/40" />
            <div className="space-y-3">
              <Skeleton className="mx-auto h-10 w-3/4 rounded-full bg-muted-foreground/25" />
              <Skeleton className="mx-auto h-10 w-1/2 rounded-full bg-muted-foreground/25" />
              <Skeleton className="mx-auto h-10 w-2/3 rounded-full bg-muted-foreground/25" />
            </div>
            <Skeleton className="mx-auto h-11 w-48 rounded-full bg-muted-foreground/30" />
          </div>
        </section>
        <main className="container mx-auto px-4 pt-16 pb-20 max-w-6xl space-y-12">
          <header className="space-y-4 text-center">
            <Skeleton className="mx-auto h-3 w-48 rounded-full" />
            <Skeleton className="mx-auto h-9 w-80 rounded-full" />
            <Skeleton className="mx-auto h-4 w-3/4 rounded-full" />
            <Skeleton className="mx-auto h-4 w-2/3 rounded-full" />
          </header>
          <section className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <article
                // eslint-disable-next-line react/no-array-index-key
                key={idx}
                className="flex h-full flex-col overflow-hidden rounded-[28px] border border-border/40 bg-muted/20 p-5"
              >
                <div className="relative h-48 w-full overflow-hidden rounded-2xl bg-muted/40">
                  <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
                  <div className="absolute inset-x-4 top-4 flex justify-between">
                    <Skeleton className="h-6 w-24 rounded-full bg-black/40" />
                    <Skeleton className="h-6 w-24 rounded-full bg-black/40" />
                  </div>
                  <Skeleton className="absolute left-4 bottom-4 h-6 w-32 rounded-full bg-black/50" />
                </div>
                <div className="mt-5 flex flex-1 flex-col gap-4">
                  <Skeleton className="h-6 w-40 rounded-full" />
                  <Skeleton className="h-3 w-full rounded-full" />
                  <Skeleton className="h-3 w-3/4 rounded-full" />
                  <Skeleton className="h-3 w-2/3 rounded-full" />
                  <div className="mt-auto flex items-center justify-between gap-4">
                    <Skeleton className="h-11 w-32 rounded-full" />
                    <div className="space-y-2 text-right">
                      <Skeleton className="ml-auto h-6 w-24 rounded-full" />
                      <Skeleton className="ml-auto h-3 w-16 rounded-full" />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <section
        className="relative flex items-center justify-center"
        style={{
          minHeight: "65vh",
          backgroundImage:
            "linear-gradient(180deg, rgba(5, 6, 9, 0.7) 0%, rgba(5, 6, 9, 0.35) 65%, rgba(5, 6, 9, 0.7) 100%), url('https://urbanhub.uk/wp-content/uploads/2025/05/URBAN-HUB-OUTSIDE-A-3-of-1-scaled-1.webp')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="container mx-auto max-w-4xl px-4 text-center text-white space-y-6 py-24">
          <p className="text-[11px] uppercase tracking-[0.5em] text-white/70">
            Book 25/26 Academic Year
          </p>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-black uppercase leading-tight">
            Secure your
            <br />
            Student Accommodation
            <br />
            at Urban Hub for £99
          </h1>
          <Button
            asChild
            className="rounded-full bg-[#ff2020] hover:bg-[#ff4040] px-8 py-3 text-sm font-semibold uppercase tracking-[0.35em]"
          >
            <Link to="/portal/login">Book a Viewing</Link>
          </Button>
        </div>
      </section>
      <main className="container mx-auto px-4 pt-16 pb-20 max-w-6xl space-y-12">
        <header className="space-y-4 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
            Discover Urban Hub
          </p>
          <h1 className="text-4xl md:text-5xl font-display font-black uppercase tracking-wide">
            5 Room Grades to Choose From
          </h1>
          <p className="max-w-3xl mx-auto text-muted-foreground text-sm md:text-base">
            Explore our available studio grades and jump straight into the space that suits you.
            Each option links to a detailed overview with galleries, contracts, and amenities.
          </p>
        </header>

        {error ? (
          <div className="rounded-3xl border border-destructive/40 bg-destructive/10 px-6 py-8 text-center text-destructive">
            <p className="text-lg font-semibold uppercase tracking-wide">Studio catalogue unavailable</p>
            <p className="mt-3">{error}</p>
          </div>
        ) : grades.length === 0 ? (
          <div className="rounded-3xl border border-dashed px-6 py-8 text-center">
            <p className="text-lg font-semibold uppercase tracking-wide">Studios coming soon</p>
            <p className="mt-3 text-muted-foreground">
              We’re preparing the new catalogue. Check back shortly for the latest availability.
            </p>
          </div>
        ) : (
          <section className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            {grades.map((grade) => {
              // Get availability for this grade (use first active contract if multiple)
              const gradeAvailability = availabilityData?.find(
                (avail) => avail.studio_grade_id === grade.id
              ) || null;

              const availabilityTag = getAvailabilityTag(gradeAvailability);
              const fullyBooked = isFullyBooked(gradeAvailability);

              return (
                <article
                  key={grade.id}
                  className="group flex h-full flex-col overflow-hidden rounded-[28px] border border-border/40 bg-background shadow-[0_18px_40px_rgba(0,0,0,0.08)] transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(0,0,0,0.12)]"
                >
                  <div className="relative h-48 w-full overflow-hidden bg-muted/30">
                    {grade.gallery.length ? (
                      <Carousel
                        className="h-full w-full"
                        opts={{ loop: true }}
                        setApi={(api) => {
                          if (!api) return;
                          let raf: number;
                          const startAutoScroll = () => {
                            raf = window.setInterval(() => {
                              api.scrollNext();
                            }, 5000);
                          };
                          const stopAutoScroll = () => {
                            window.clearInterval(raf);
                          };
                          startAutoScroll();
                          api.on("pointerDown", stopAutoScroll);
                          api.on("pointerUp", startAutoScroll);
                          api.on("destroy", stopAutoScroll);
                        }}
                      >
                        <CarouselContent className="-ml-0">
                          {grade.gallery.map((image, idx) => (
                            <CarouselItem key={`${grade.id}-${idx}`} className="pl-0">
                              <img
                                src={image.url}
                                alt={`${grade.name} ${idx + 1}`}
                                className="h-48 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                loading="lazy"
                              />
                            </CarouselItem>
                          ))}
                        </CarouselContent>
                      </Carousel>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.4em] text-muted-foreground">
                        Urban Hub
                      </div>
                    )}
                    {grade.academicYear && (
                      <span className="absolute left-4 bottom-4 rounded-full bg-black/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-white">
                        {grade.academicYear}
                      </span>
                    )}
                    {availabilityTag && (
                      <span className={`absolute right-4 top-4 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] ${availabilityTag.className}`}>
                        {availabilityTag.label}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-4 px-5 pb-5 pt-6">
                    <div>
                      <h2 className="text-2xl font-display font-black uppercase tracking-wide text-foreground">
                        {grade.name}
                      </h2>
                      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                        {grade.short_description ?? "Discover this studio grade, explore availability, and compare contract options tailored for you."}
                      </p>
                      {gradeAvailability && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {gradeAvailability.available_count} of {gradeAvailability.total_capacity} studios available
                        </p>
                      )}
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-4">
                      {fullyBooked ? (
                        <Button
                          disabled
                          className="rounded-full bg-gray-400 px-6 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-white cursor-not-allowed"
                        >
                          Fully Booked
                        </Button>
                      ) : (
                        <Button
                          asChild
                          className="rounded-full bg-accent-yellow px-6 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-black shadow-[0_12px_24px_rgba(255,204,0,0.35)] hover:bg-accent-yellow/90"
                        >
                          <Link to={`/studios/${grade.slug}`}>Book Now</Link>
                        </Button>
                      )}
                      <div className="text-right">
                        <p className="text-xl font-black uppercase tracking-wide text-foreground">
                          {typeof grade.weeklyPrice === "number" ? `£${grade.weeklyPrice.toLocaleString("en-GB")}` : "£—"}
                        </p>
                        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">
                          Per wk
                        </p>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default StudiosCatalog;


