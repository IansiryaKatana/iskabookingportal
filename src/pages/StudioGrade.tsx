import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Navigation from "@/components/Navigation";
import HeroSection from "@/components/HeroSection";
import ImageGallery from "@/components/ImageGallery";
import PaymentBanner from "@/components/PaymentBanner";
import StudioOverview from "@/components/StudioOverview";
import AmenitiesSection from "@/components/AmenitiesSection";
import Footer from "@/components/Footer";
import FloatingContactRail from "@/components/FloatingContactRail";
import WhatsAppButton from "@/components/WhatsAppButton";
import ContractShowcase from "@/components/ContractShowcase";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useBrandingSettings } from "@/hooks/useBranding";
import type { Database } from "@/integrations/supabase/types";

type StudioGradeRow = Database["public"]["Tables"]["studio_grades"]["Row"];
type StudioGradeMediaRow =
  Database["public"]["Tables"]["studio_grade_media"]["Row"];
type StudioGradeAmenityRow =
  Database["public"]["Tables"]["studio_grade_amenities"]["Row"];
type AmenityRow = Database["public"]["Tables"]["amenities"]["Row"];
type StudioGradeBannerRow =
  Database["public"]["Tables"]["studio_grade_banners"]["Row"];
type StudioGradePriceRow =
  Database["public"]["Tables"]["studio_grade_prices"]["Row"];
type ContractRow = Database["public"]["Tables"]["contracts"]["Row"];
type AcademicYearRow =
  Database["public"]["Tables"]["academic_years"]["Row"];
type PaymentPlanRow =
  Database["public"]["Tables"]["payment_plans"]["Row"];
type PaymentPlanInstallmentRow =
  Database["public"]["Tables"]["payment_plan_installments"]["Row"];
type ContractPaymentScheduleRow =
  Database["public"]["Tables"]["contract_payment_schedule"]["Row"];
type ContractPaymentPlanRow =
  Database["public"]["Tables"]["contract_payment_plans"]["Row"];

type StudioGradeMedia = StudioGradeMediaRow;
type StudioGradeAmenity = StudioGradeAmenityRow & {
  amenity: AmenityRow | null;
};
type StudioGradeBanner = StudioGradeBannerRow;

type StudioContractPaymentPlan = ContractPaymentPlanRow & {
  payment_plan: (PaymentPlanRow & {
    payment_plan_installments: PaymentPlanInstallmentRow[];
  }) | null;
};

type StudioContract = ContractRow & {
  academic_year: AcademicYearRow | null;
  contract_payment_plans: StudioContractPaymentPlan[];
  contract_payment_schedule: ContractPaymentScheduleRow[];
  computed_weekly_price: number | null;
  computed_deposit_amount: number | null;
};

type StudioGradeData = StudioGradeRow & {
  studio_grade_media: StudioGradeMedia[];
  studio_grade_amenities: StudioGradeAmenity[];
  studio_grade_prices: StudioGradePriceRow[];
  studio_grade_banners: StudioGradeBanner[];
  contracts: StudioContract[];
};

const loadStudioGrade = async (slug: string, academicYearName?: string): Promise<StudioGradeData | null> => {
  const { data: grade, error: gradeError } = await supabase
    .from("studio_grades")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (gradeError) {
    throw gradeError;
  }

  if (!grade) {
    return null;
  }

  const gradeId = grade.id;

  // If academic year is specified, get its ID to filter contracts
  let academicYearId: string | undefined;
  if (academicYearName) {
    // Normalize year format (handle both "2026-2027" and "2026/2027")
    const normalizedYear = academicYearName.replace(/-/g, "/");
    const { data: yearData } = await supabase
      .from("academic_years")
      .select("id")
      .eq("name", normalizedYear)
      .eq("is_active", true)
      .maybeSingle();
    
    if (yearData) {
      academicYearId = yearData.id;
    }
  }

  const [
    mediaRes,
    amenitiesRes,
    pricesRes,
    contractsRes,
    bannersRes,
  ] = await Promise.all([
    supabase
      .from("studio_grade_media")
      .select("*")
      .eq("studio_grade_id", gradeId)
      .order("position", { ascending: true }),
    supabase
      .from("studio_grade_amenities")
      .select("*, amenity:amenities(*)")
      .eq("studio_grade_id", gradeId),
    supabase
      .from("studio_grade_prices")
      .select("*")
      .eq("studio_grade_id", gradeId),
    (() => {
      let contractsQuery = supabase
        .from("contracts")
        .select(
          `*,
           academic_year:academic_years(*),
           contract_payment_plans:contract_payment_plans(
              *,
              payment_plan:payment_plans(*, payment_plan_installments(*))
           ),
           contract_payment_schedule(*)
          `,
        )
        .eq("studio_grade_id", gradeId)
        .eq("is_active", true)
        .eq("visible_on_portal", true);
      
      // Filter by academic year if specified
      if (academicYearId) {
        contractsQuery = contractsQuery.eq("academic_year_id", academicYearId);
      }
      
      return contractsQuery.order("display_order", { ascending: true });
    })(),
    supabase
      .from("studio_grade_banners")
      .select("*")
      .eq("studio_grade_id", gradeId)
      .order("display_order", { ascending: true }),
  ]);

  if (mediaRes.error) throw mediaRes.error;
  if (amenitiesRes.error) throw amenitiesRes.error;
  if (pricesRes.error) throw pricesRes.error;
  if (contractsRes.error) throw contractsRes.error;
  if (bannersRes.error) throw bannersRes.error;

  const media = (mediaRes.data ?? []).filter(
    (item) => item.media_type === "image",
  );

  const amenities = amenitiesRes.data ?? [];
  const banners = bannersRes.data ?? [];
  const prices = pricesRes.data ?? [];

  const contracts: StudioContract[] = (contractsRes.data ?? []).map(
    (contract) => {
      const matchingPrice = prices.find(
        (price) =>
          price.academic_year_id === contract.academic_year_id &&
          price.is_active,
      );

      const planOptions: StudioContractPaymentPlan[] =
        (contract.contract_payment_plans ?? [])
          .map((link) => ({
            ...link,
            payment_plan: link.payment_plan
              ? {
                  ...link.payment_plan,
                  payment_plan_installments:
                    link.payment_plan.payment_plan_installments ?? [],
                }
              : null,
          }))
          .filter((link) => link.payment_plan)
          .sort(
            (a, b) =>
              (a.display_order ?? 0) - (b.display_order ?? 0),
          );

      const primaryPlan = planOptions[0]?.payment_plan ?? null;

      const computedWeeklyPrice =
        contract.weekly_price_override ?? matchingPrice?.weekly_price ?? null;

      const computedDepositAmount =
        contract.deposit_override ??
        primaryPlan?.deposit_amount ??
        matchingPrice?.deposit_amount_override ??
        null;

      return {
        ...contract,
        academic_year: contract.academic_year ?? null,
        contract_payment_plans: planOptions,
        contract_payment_schedule:
          contract.contract_payment_schedule ?? [],
        computed_weekly_price: computedWeeklyPrice,
        computed_deposit_amount: computedDepositAmount,
      };
    },
  );

  contracts.sort(
    (a, b) =>
      (a.display_order ?? Number.MAX_SAFE_INTEGER) -
      (b.display_order ?? Number.MAX_SAFE_INTEGER),
  );

  return {
    ...grade,
    studio_grade_media: media,
    studio_grade_amenities: amenities,
    studio_grade_prices: prices,
    studio_grade_banners: banners,
    contracts,
  };
};

const StudioGradePage = () => {
  const { data: brandingSettings } = useBrandingSettings();
  const companyName = brandingSettings?.company_name || "StudentStaySolutions";
  const { slug, year } = useParams<{ slug: string; year?: string }>();
  const navigate = useNavigate();
  const [redirecting, setRedirecting] = useState(false);
  const [redirectError, setRedirectError] = useState<string | null>(null);
  const [grade, setGrade] = useState<StudioGradeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [slug]);

  useEffect(() => {
    let cancelled = false;

    if (slug) return;

    const fetchDefaultGrade = async () => {
      setRedirecting(true);
      setRedirectError(null);

      const { data, error } = await supabase
        .from("studio_grades")
        .select("slug")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("Failed to load default studio grade:", error);
        setRedirectError("We couldn't load the studio catalogue right now.");
        setRedirecting(false);
        return;
      }

      if (data?.slug) {
        // Preserve year in URL if it exists
        const yearPath = year ? `${year}/` : "";
        navigate(`/studios/${yearPath}${data.slug}`, { replace: true });
      } else {
        setRedirectError("No studio grades are live yet. Please check back soon.");
        setRedirecting(false);
      }
    };

    fetchDefaultGrade();

    return () => {
      cancelled = true;
    };
  }, [slug, navigate]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        // Pass the year parameter to filter contracts by academic year
        const result = await loadStudioGrade(slug, year || undefined);
        if (!cancelled) {
          setGrade(result);
          if (!result) {
            setLoadError("No studio grade found");
          }
        }
      } catch (error) {
        console.error("Failed to load studio grade data:", error);
        if (!cancelled) {
          setGrade(null);
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [slug, year]);

  const galleryImages = useMemo(() => {
    if (!grade) return [];
    return grade.studio_grade_media
      .filter((media) => media.media_type === "image")
      .map((media) => ({
        src: media.url,
        alt: media.title ?? grade.name,
      }));
  }, [grade]);

  const heroImage = useMemo(() => {
    if (!grade) return null;
    // First, try to find an image explicitly marked as hero
    const heroMedia = grade.studio_grade_media.find(
      (media) => media.media_type === "image" && media.is_hero === true,
    );
    
    // If a hero is explicitly set, use it
    if (heroMedia) {
      return heroMedia.url;
    }
    
    // Only fallback to first image if no hero is explicitly set
    // This ensures that when a hero is set, it's always used
    const firstImage = grade.studio_grade_media.find(
      (media) => media.media_type === "image",
    );
    return firstImage?.url ?? galleryImages[0]?.src ?? null;
  }, [grade, galleryImages]);

  const AMENITIES_VIDEO_FALLBACK = "https://pzptocwdaqpczexlbajr.supabase.co/storage/v1/object/public/branding/amenities-video.mp4";
  const isValidVideoUrl = (u: string | null | undefined) =>
    typeof u === "string" && u.trim().startsWith("http") && u.trim().length > 10;

  const videoUrl = useMemo(() => {
    if (!grade) return null;
    if (isValidVideoUrl(grade.promo_video_url)) return grade.promo_video_url?.trim() ?? null;
    const mediaVideo = grade.studio_grade_media.find((media) => media.media_type === "video")?.url;
    if (isValidVideoUrl(mediaVideo)) return mediaVideo?.trim() ?? null;
    const url = brandingSettings?.amenities_video_url?.trim();
    if (isValidVideoUrl(url)) return url ?? null;
    return AMENITIES_VIDEO_FALLBACK;
  }, [grade, brandingSettings?.amenities_video_url]);

  const amenities = useMemo(() => {
    if (!grade) return [];
    return grade.studio_grade_amenities
      .map((item) => ({
        id: item.id,
        name: item.amenity?.name ?? "Amenity",
        description: item.description_override ?? item.amenity?.description,
        icon_url: item.amenity?.icon_url ?? undefined,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [grade]);

  const badgeText = useMemo(() => {
    if (!grade) return undefined;
    const weeklyFrom = grade.contracts
      .map((contract) => contract.computed_weekly_price ?? 0)
      .filter(Boolean)
      .sort((a, b) => a - b)[0];
    if (weeklyFrom) {
      return `FROM £${weeklyFrom.toLocaleString("en-GB")} PP/PW`;
    }
    if (grade.max_occupancy) {
      return `Sleeps ${grade.max_occupancy}`;
    }
    return undefined;
  }, [grade]);

  if (redirecting) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
        <Skeleton className="h-10 w-10 rounded-full mb-4" />
        <p className="text-muted-foreground">
          Loading the {companyName} studio experience...
        </p>
      </div>
    );
  }

  if (redirectError && !slug) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 text-center space-y-6">
        <div className="max-w-md space-y-6">
          <h1 className="text-4xl font-display font-bold uppercase tracking-wide">
            Studio Catalogue Unavailable
          </h1>
          <p className="text-muted-foreground">{redirectError}</p>
          <Button
            variant="outline"
            className="rounded-full uppercase tracking-wide"
            onClick={() => navigate(0)}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const contractAcademicYearName = grade?.contracts[0]?.academic_year?.name;

  if (redirecting || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />

        <section className="relative h-[70vh] min-h-[520px] overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-black via-slate-900 to-slate-800 animate-pulse" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/80" />
          <div className="relative z-10 h-full flex flex-col items-center justify-center px-6 text-center text-white space-y-4">
            <Skeleton className="h-12 w-64 rounded-full bg-white/15" />
            <Skeleton className="h-6 w-40 rounded-full bg-white/15" />
            <div className="space-y-2 w-full max-w-xl">
              {[...Array(4)].map((_, idx) => (
                <Skeleton
                  // eslint-disable-next-line react/no-array-index-key
                  key={idx}
                  className="h-3 w-full rounded-full bg-white/10"
                />
              ))}
            </div>
          </div>
        </section>

        <main className="max-w-7xl mx-auto px-4 py-12 md:py-16 space-y-12">
          <section className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-3 space-y-4">
              <Skeleton className="aspect-[4/3] w-full rounded-3xl bg-muted/40" />
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 md:gap-4">
                {[...Array(6)].map((_, idx) => (
                  <Skeleton
                    // eslint-disable-next-line react/no-array-index-key
                    key={idx}
                    className="aspect-video rounded-2xl bg-muted/30"
                  />
                ))}
              </div>
            </div>
            <div className="lg:col-span-2 space-y-4">
              {[...Array(3)].map((_, idx) => (
                <div
                  // eslint-disable-next-line react/no-array-index-key
                  key={idx}
                  className="rounded-3xl border border-border/60 bg-muted/20 p-5 space-y-5"
                >
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-3 w-32 rounded-full" />
                    <Skeleton className="h-6 w-48 rounded-full" />
                    <Skeleton className="h-3 w-24 rounded-full" />
                  </div>
                  <div className="grid gap-3">
                    <Skeleton className="h-4 w-40 rounded-full" />
                    <Skeleton className="h-16 w-full rounded-2xl" />
                  </div>
                  <Skeleton className="h-12 w-full rounded-full" />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-full border border-accent-yellow/50 bg-accent-yellow/20 px-6 py-5 flex flex-wrap items-center gap-3">
            {[...Array(4)].map((_, idx) => (
              <Skeleton
                // eslint-disable-next-line react/no-array-index-key
                key={idx}
                className="h-8 w-40 rounded-full bg-accent-yellow/60"
              />
            ))}
          </section>

          <section className="rounded-3xl bg-black text-white px-6 py-12 space-y-4">
            <Skeleton className="h-8 w-64 rounded-full bg-white/15" />
            {[...Array(5)].map((_, idx) => (
              <Skeleton
                // eslint-disable-next-line react/no-array-index-key
                key={idx}
                className="h-3 w-full rounded-full bg-white/10"
              />
            ))}
          </section>

          <section className="rounded-3xl bg-muted/20 px-6 py-10 space-y-6">
            <Skeleton className="h-6 w-48 rounded-full bg-muted/40" />
            <div className="grid gap-4 md:grid-cols-2">
              {[...Array(6)].map((_, idx) => (
                <Skeleton
                  // eslint-disable-next-line react/no-array-index-key
                  key={idx}
                  className="h-20 rounded-2xl bg-muted/40"
                />
              ))}
            </div>
          </section>
        </main>

        <Footer />
        <FloatingContactRail />
        <WhatsAppButton />
      </div>
    );
  }

  if (loadError || !grade) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-lg text-center space-y-6">
          <h1 className="text-4xl font-display font-bold uppercase tracking-wide">
            Studio Not Found
          </h1>
          <p className="text-muted-foreground">
            We couldn’t find the studio grade you’re looking for. Please return
            to the main page and choose another grade.
          </p>
          <Button
            variant="outline"
            className="rounded-full uppercase tracking-wide"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <HeroSection
        title={grade.name}
        badgeText={badgeText}
        description={grade.short_description ?? undefined}
        backgroundImage={heroImage}
      />
      <main>
        <section className="container mx-auto px-4 py-12 md:py-16 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-3">
              <ImageGallery images={galleryImages} />
            </div>
            <div className="lg:col-span-2">
              <ContractShowcase
                contracts={grade.contracts}
                getWeeks={(contract) => contract.weeks}
                getWeeklyPrice={(contract) => contract.computed_weekly_price}
                getDeposit={(contract) => contract.computed_deposit_amount}
                getStartDate={(contract) => contract.contract_start}
                getEndDate={(contract) => contract.contract_end}
                onSelect={(contract) => navigate(`/contracts/${encodeURIComponent(contract.slug)}`)}
                subtitle={contractAcademicYearName ?? undefined}
                emptyState={
                  <span>
                    No live contracts for this studio grade yet. Check back
                    shortly or contact our team.
                  </span>
                }
              />
            </div>
          </div>
        </section>

        <PaymentBanner
          messages={
            grade.studio_grade_banners.length
              ? grade.studio_grade_banners.map((banner) => ({
                  icon: "💳",
                  text: banner.text,
                }))
              : undefined
          }
        />

        <StudioOverview
          title={`${grade.name} Overview`}
          intro={grade.short_description ?? undefined}
          description={grade.long_description ?? undefined}
        />

        <AmenitiesSection
          amenities={amenities}
          videoUrl={videoUrl ?? undefined}
          fallbackVideoUrl={AMENITIES_VIDEO_FALLBACK}
        />
      </main>

      <Footer />
      <FloatingContactRail />
      <WhatsAppButton />
    </div>
  );
};

export default StudioGradePage;

