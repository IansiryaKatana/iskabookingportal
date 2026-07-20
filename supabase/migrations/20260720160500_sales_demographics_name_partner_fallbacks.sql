-- Sales demographics: fill student names from Step 1 when profiles are blank,
-- and resolve partner from application linkage without waiting for partner_referrals.
-- Commission amount still comes only from partner_referred_applications (confirmed).

CREATE OR REPLACE VIEW public.sales_demographics_report AS
SELECT
  sa.id                                       AS application_id,
  sa.student_id                               AS student_id,
  (step1.payload ->> 'ucas_id')               AS ucas_id,
  COALESCE(
    NULLIF(TRIM(p.first_name), ''),
    NULLIF(TRIM(step1.payload ->> 'first_name'), '')
  )                                           AS first_name,
  COALESCE(
    NULLIF(TRIM(p.last_name), ''),
    NULLIF(TRIM(step1.payload ->> 'last_name'), '')
  )                                           AS last_name,
  (step1.payload ->> 'country')               AS country,
  (step3.payload ->> 'entry_into_uk')         AS entry_into_uk,
  s.studio_number                             AS studio_number,
  sg.name                                     AS studio_grade,
  NULL::text                                  AS company_name,
  sa.created_at                               AS created_at,
  COALESCE(sa.submitted_at, sa.created_at)    AS confirmed_date,
  c.contract_start                            AS arrival_date,
  c.contract_end                              AS departure_date,
  CASE
    WHEN c.contract_start IS NOT NULL AND c.contract_end IS NOT NULL
    THEN GREATEST(1, (c.contract_end::date - c.contract_start::date) / 7)
    ELSE NULL
  END                                         AS weeks,
  ay.id                                       AS academic_year_id,
  ay.name                                     AS academic_year_name,
  COALESCE(c.weekly_price_override, 0)::numeric      AS weekly_rent,
  sa.total_contract_value                     AS total_sales_value,
  COALESCE(ac.cashback_amount, 0)::numeric    AS cashback_value,
  CASE WHEN ac.id IS NULL THEN false ELSE true END AS cashback_applied,
  COALESCE(ad.discount_amount, sa.discount_amount, 0)::numeric AS discount_value,
  CASE WHEN ad.id IS NOT NULL OR COALESCE(sa.discount_amount, 0) > 0 THEN true ELSE false END AS discount_applied,
  pr.commission_amount                        AS partner_commission,
  COALESCE(pr.validated_referral_code, sa.validated_referral_code)
                                              AS partner_referral_code,
  COALESCE(par.name, par_by_code.name)        AS partner_name,
  (COALESCE(sa.is_rebooking, false) OR sa.booking_source = 'rebooker') AS is_rebooker,
  CASE
    WHEN c.contract_start IS NOT NULL AND EXTRACT(MONTH FROM c.contract_start) BETWEEN 6 AND 8
    THEN sa.total_contract_value
    ELSE 0
  END                                         AS summer_sales_value,
  sa.booking_source                           AS booking_source,
  sa.status                                   AS application_status,
  COALESCE(
    source_pp.name,
    CASE
      WHEN inst.non_deposit_count = 1 THEN 'Pay in Full'
      WHEN inst.non_deposit_count > 1 THEN inst.non_deposit_count::text || ' Instalments'
      ELSE NULL
    END,
    pp.name
  )                                           AS payment_plan
FROM public.student_applications sa
JOIN public.contracts c ON c.id = sa.contract_id
JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
LEFT JOIN public.studios s ON s.id = sa.assigned_studio_id
LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.student_application_steps step1 ON step1.application_id = sa.id AND step1.step_number = 1
LEFT JOIN public.student_application_steps step3 ON step3.application_id = sa.id AND step3.step_number = 3
LEFT JOIN LATERAL (
  SELECT COALESCE(
    sa.selected_payment_plan_id,
    c.payment_plan_id,
    (
      SELECT cpp.payment_plan_id
      FROM public.contract_payment_plans cpp
      WHERE cpp.contract_id = c.id
      ORDER BY cpp.display_order ASC, cpp.created_at ASC
      LIMIT 1
    )
  ) AS resolved_plan_id
) resolved ON TRUE
LEFT JOIN public.payment_plans pp ON pp.id = resolved.resolved_plan_id
LEFT JOIN public.payment_plans source_pp ON source_pp.id = pp.source_payment_plan_id
LEFT JOIN LATERAL (
  SELECT COUNT(*)::integer AS non_deposit_count
  FROM public.payment_plan_installments ppi
  WHERE ppi.payment_plan_id = resolved.resolved_plan_id
    AND COALESCE(lower(ppi.label), '') NOT LIKE '%deposit%'
) inst ON TRUE
LEFT JOIN LATERAL (
  SELECT ac.*
  FROM public.application_cashbacks ac
  WHERE ac.application_id = sa.id
  ORDER BY ac.applied_at DESC
  LIMIT 1
) ac ON TRUE
LEFT JOIN LATERAL (
  SELECT ad.*
  FROM public.application_discounts ad
  WHERE ad.application_id = sa.id
  ORDER BY ad.applied_at DESC
  LIMIT 1
) ad ON TRUE
LEFT JOIN public.partner_referrals pr_raw ON pr_raw.application_id = sa.id
LEFT JOIN LATERAL (
  SELECT pra.*
  FROM public.partner_referred_applications pra
  WHERE pra.application_id = sa.id
  ORDER BY pra.referral_created_at DESC
  LIMIT 1
) pr ON TRUE
LEFT JOIN public.partners par ON par.id = sa.referred_by_partner_id
LEFT JOIN public.partners par_by_code
  ON COALESCE(pr.validated_referral_code, sa.validated_referral_code) IS NOT NULL
  AND UPPER(TRIM(par_by_code.referral_code))
    = UPPER(TRIM(COALESCE(pr.validated_referral_code, sa.validated_referral_code)))
WHERE public.is_committed_sale_status(sa.status);

GRANT SELECT ON public.sales_demographics_report TO authenticated;

-- Backfill blank profiles from Step 1 for the two reported students only.
UPDATE public.profiles AS p
SET
  first_name = NULLIF(TRIM(step1.payload ->> 'first_name'), ''),
  last_name = NULLIF(TRIM(step1.payload ->> 'last_name'), ''),
  updated_at = now()
FROM public.student_applications AS sa
JOIN public.student_application_steps AS step1
  ON step1.application_id = sa.id
  AND step1.step_number = 1
WHERE p.id = sa.student_id
  AND sa.id IN (
    '66cc6389-1294-489d-bc51-f4acbff5b6ee',
    '94c3a3aa-bd66-41dd-8f3f-e1bc1c94b27e'
  )
  AND p.first_name IS NULL
  AND p.last_name IS NULL
  AND (
    NULLIF(TRIM(step1.payload ->> 'first_name'), '') IS NOT NULL
    OR NULLIF(TRIM(step1.payload ->> 'last_name'), '') IS NOT NULL
  );
