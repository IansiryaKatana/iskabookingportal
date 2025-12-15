-- Sales & Demographics Reporting Views
-- This migration adds read-only reporting surfaces used by the admin
-- Sales & Demographics report and the Excel export.
--
-- Design goals:
-- - Only use live, confirmed applications/contracts (no mock data)
-- - Align closely with the "Sales Report Sample for Ian.xlsx" structure
-- - Keep logic in the database so multiple frontends can reuse it

-- ============================================================================
-- 1. SALES DEMOGRAPHICS REPORT VIEW
--    One row per confirmed application/contract with sales + demographics
-- ============================================================================

CREATE OR REPLACE VIEW public.sales_demographics_report AS
SELECT
  sa.id                                       AS application_id,
  sa.student_id                               AS student_id,
  -- Demographic / identity
  (step1.payload ->> 'ucas_id')               AS ucas_id,
  p.first_name                                AS first_name,
  p.last_name                                 AS last_name,
  (step1.payload ->> 'country')               AS country,
  (step3.payload ->> 'entry_into_uk')         AS entry_into_uk,

  -- Inventory / product
  s.studio_number                             AS studio_number,
  sg.name                                     AS studio_grade,
  NULL::text                                  AS company_name,

  -- Lifecycle / timing
  sa.created_at                               AS created_at,
  COALESCE(sa.submitted_at, sa.created_at)    AS confirmed_date,
  c.contract_start                            AS arrival_date,
  c.contract_end                              AS departure_date,
  CASE
    WHEN c.contract_start IS NOT NULL
     AND c.contract_end   IS NOT NULL
    THEN GREATEST(1, (c.contract_end::date - c.contract_start::date) / 7)
    ELSE NULL
  END                                         AS weeks,
  ay.id                                       AS academic_year_id,
  ay.name                                     AS academic_year_name,

  -- Commercials
  COALESCE(c.weekly_price_override, 0)::numeric      AS weekly_rent,
  sa.total_contract_value                             AS total_sales_value,
  COALESCE(ac.cashback_amount, 0)::numeric    AS cashback_value,
  CASE
    WHEN ac.id IS NULL THEN false
    ELSE true
  END                                         AS cashback_applied,
  pr.commission_amount                        AS partner_commission,

  -- Channel / partner
  pr.validated_referral_code                  AS partner_referral_code,
  par.name                                    AS partner_name,

  -- Rebooking & flags
  COALESCE(sa.is_rebooking, false)            AS is_rebooker,

  -- Summer sales value (simple heuristic: any contract that starts Jun–Aug)
  CASE
    WHEN c.contract_start IS NOT NULL
     AND EXTRACT(MONTH FROM c.contract_start) BETWEEN 6 AND 8
    THEN sa.total_contract_value
    ELSE 0
  END                                         AS summer_sales_value
FROM public.student_applications sa
JOIN public.contracts c
  ON c.id = sa.contract_id
JOIN public.studio_grades sg
  ON sg.id = sa.studio_grade_id
LEFT JOIN public.studios s
  ON s.id = sa.assigned_studio_id
LEFT JOIN public.academic_years ay
  ON ay.id = c.academic_year_id
LEFT JOIN public.profiles p
  ON p.id = sa.student_id
LEFT JOIN public.student_application_steps step1
  ON step1.application_id = sa.id
 AND step1.step_number = 1
LEFT JOIN public.student_application_steps step3
  ON step3.application_id = sa.id
 AND step3.step_number = 3
LEFT JOIN LATERAL (
  SELECT ac.*
  FROM public.application_cashbacks ac
  WHERE ac.application_id = sa.id
  ORDER BY ac.applied_at DESC
  LIMIT 1
) ac ON TRUE
LEFT JOIN public.partner_referrals pr_raw
  ON pr_raw.application_id = sa.id
LEFT JOIN LATERAL (
  -- Use partner_referred_applications view where possible to stay consistent
  SELECT pra.*
  FROM public.partner_referred_applications pra
  WHERE pra.application_id = sa.id
  ORDER BY pra.referral_created_at DESC
  LIMIT 1
) pr ON TRUE
LEFT JOIN public.partners par
  ON par.referral_code = pr.validated_referral_code
WHERE sa.status = 'confirmed';

GRANT SELECT ON public.sales_demographics_report TO authenticated;

-- ============================================================================
-- 2. SALES OCCUPANCY MONTHLY VIEW
--    Occupancy by academic year, month and studio grade (confirmed only)
-- ============================================================================

CREATE OR REPLACE VIEW public.sales_occupancy_monthly AS
WITH grade_capacity AS (
  SELECT
    sg.id   AS studio_grade_id,
    COUNT(s.id)::integer AS total_studios
  FROM public.studio_grades sg
  LEFT JOIN public.studios s
    ON s.studio_grade_id = sg.id
  GROUP BY sg.id
)
SELECT
  ay.id                              AS academic_year_id,
  ay.name                            AS academic_year_name,
  DATE_TRUNC('month', c.contract_start)::date AS month_start,
  TO_CHAR(DATE_TRUNC('month', c.contract_start), 'Mon YYYY') AS month_label,
  sg.id                              AS studio_grade_id,
  sg.name                            AS studio_grade_name,
  COALESCE(gc.total_studios, 0)      AS capacity,
  COUNT(DISTINCT sa.id)              AS confirmed_contracts,
  CASE
    WHEN COALESCE(gc.total_studios, 0) = 0 THEN 0
    ELSE ROUND(
      COUNT(DISTINCT sa.id)::numeric
      / gc.total_studios::numeric * 100,
      2
    )
  END                                AS occupancy_percentage
FROM public.student_applications sa
JOIN public.contracts c
  ON c.id = sa.contract_id
JOIN public.studio_grades sg
  ON sg.id = sa.studio_grade_id
LEFT JOIN grade_capacity gc
  ON gc.studio_grade_id = sg.id
LEFT JOIN public.academic_years ay
  ON ay.id = c.academic_year_id
WHERE sa.status = 'confirmed'
  AND c.contract_start IS NOT NULL
GROUP BY
  ay.id,
  ay.name,
  month_start,
  TO_CHAR(DATE_TRUNC('month', c.contract_start), 'Mon YYYY'),
  sg.id,
  sg.name,
  gc.total_studios
ORDER BY
  ay.start_date,
  month_start,
  sg.name;

GRANT SELECT ON public.sales_occupancy_monthly TO authenticated;

-- ============================================================================
-- 3. SALES REBOOKERS MONTHLY VIEW
--    Rebooking performance per academic year and month
-- ============================================================================

CREATE OR REPLACE VIEW public.sales_rebookers_monthly AS
SELECT
  ay.id                              AS academic_year_id,
  ay.name                            AS academic_year_name,
  DATE_TRUNC('month', c.contract_start)::date AS month_start,
  TO_CHAR(DATE_TRUNC('month', c.contract_start), 'Mon YYYY') AS month_label,
  COUNT(*) FILTER (WHERE COALESCE(sa.is_rebooking, false))      AS rebooker_contracts,
  SUM(sa.total_contract_value) FILTER (WHERE COALESCE(sa.is_rebooking, false)) AS rebooker_total_sales_value,
  COUNT(*)                                                        AS total_contracts,
  CASE
    WHEN COUNT(*) = 0 THEN 0
    ELSE ROUND(
      COUNT(*) FILTER (WHERE COALESCE(sa.is_rebooking, false))::numeric
      / COUNT(*)::numeric * 100,
      2
    )
  END                                AS rebooker_share_percentage
FROM public.student_applications sa
JOIN public.contracts c
  ON c.id = sa.contract_id
LEFT JOIN public.academic_years ay
  ON ay.id = c.academic_year_id
WHERE sa.status = 'confirmed'
  AND c.contract_start IS NOT NULL
GROUP BY
  ay.id,
  ay.name,
  month_start,
  TO_CHAR(DATE_TRUNC('month', c.contract_start), 'Mon YYYY')
ORDER BY
  ay.start_date,
  month_start;

GRANT SELECT ON public.sales_rebookers_monthly TO authenticated;


