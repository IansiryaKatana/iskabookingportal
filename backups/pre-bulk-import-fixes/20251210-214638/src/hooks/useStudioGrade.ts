import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

export type StudioGradeMedia = StudioGradeMediaRow;
export type StudioGradeAmenity = StudioGradeAmenityRow & {
  amenity: AmenityRow | null;
};
export type StudioGradeBanner = StudioGradeBannerRow;

export type StudioContractPaymentPlan = ContractPaymentPlanRow & {
  payment_plan: (PaymentPlanRow & {
    payment_plan_installments: PaymentPlanInstallmentRow[];
  }) | null;
};

export type StudioContract = ContractRow & {
  academic_year: AcademicYearRow | null;
  contract_payment_plans: StudioContractPaymentPlan[];
  contract_payment_schedule: ContractPaymentScheduleRow[];
  computed_weekly_price: number | null;
  computed_deposit_amount: number | null;
};

export type StudioGradeData = StudioGradeRow & {
  studio_grade_media: StudioGradeMedia[];
  studio_grade_amenities: StudioGradeAmenity[];
  studio_grade_prices: StudioGradePriceRow[];
  contracts: StudioContract[];
  studio_grade_banners: StudioGradeBanner[];
};

async function fetchStudioGrade(slug: string): Promise<StudioGradeData | null> {
  const { data: grade, error: gradeError } = await supabase
    .from("studio_grades")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (gradeError) {
    console.error("Failed to fetch studio grade:", gradeError);
    throw gradeError;
  }

  if (!grade) {
    console.warn("No studio grade found for slug", slug);
    return null;
  }

  const gradeId = grade.id;

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
    supabase
      .from("contracts")
      .select(
        `*,
         academic_year:academic_years (*),
         contract_payment_plans:contract_payment_plans (
            *,
            payment_plan:payment_plans (
              *,
              payment_plan_installments (*)
            )
         ),
         contract_payment_schedule (*)
        `,
      )
      .eq("studio_grade_id", gradeId)
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
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

  const transformedContracts: StudioContract[] = (contractsRes.data ?? []).map(
    (contract) => {
      const academicYearPrices = (pricesRes.data ?? []).find(
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
        contract.weekly_price_override ??
        academicYearPrices?.weekly_price ??
        null;

      const computedDepositAmount =
        contract.deposit_override ??
        primaryPlan?.deposit_amount ??
        academicYearPrices?.deposit_amount_override ??
        null;

      return {
        ...contract,
        academic_year: contract.academic_year ?? null,
        contract_payment_plans: planOptions,
        contract_payment_schedule:
          contract.contract_payment_schedule ?? [],
        computed_weekly_price,
        computed_deposit_amount,
      };
    },
  );

  transformedContracts.sort(
    (a, b) =>
      (a.display_order ?? Number.MAX_SAFE_INTEGER) -
      (b.display_order ?? Number.MAX_SAFE_INTEGER),
  );

  return {
    ...grade,
    studio_grade_media: (mediaRes.data ?? []).filter(
      (item) => item.media_type === "image",
    ),
    studio_grade_amenities: amenitiesRes.data ?? [],
    studio_grade_prices: pricesRes.data ?? [],
    contracts: transformedContracts,
    studio_grade_banners: bannersRes.data ?? [],
  };
}

export const useStudioGrade = (slug: string | undefined) =>
  useQuery({
    queryKey: ["studio-grade", slug],
    queryFn: () => (slug ? fetchStudioGrade(slug) : Promise.resolve(null)),
    enabled: Boolean(slug),
    staleTime: 0,
    cacheTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });

