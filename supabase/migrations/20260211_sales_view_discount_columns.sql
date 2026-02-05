-- Add discount_value and discount_applied to sales_demographics_report (mirror cashback)

DROP VIEW IF EXISTS public.sales_demographics_report;
CREATE VIEW public.sales_demographics_report AS
SELECT
  sa.id                                       AS application_id,
  sa.student_id                               AS student_id,
  (step1.payload ->> 'ucas_id')               AS ucas_id,
  p.first_name                                AS first_name,
  p.last_name                                 AS last_name,
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
  pr.validated_referral_code                  AS partner_referral_code,
  par.name                                    AS partner_name,
  (COALESCE(sa.is_rebooking, false) OR sa.booking_source = 'rebooker') AS is_rebooker,
  CASE
    WHEN c.contract_start IS NOT NULL AND EXTRACT(MONTH FROM c.contract_start) BETWEEN 6 AND 8
    THEN sa.total_contract_value
    ELSE 0
  END                                         AS summer_sales_value
FROM public.student_applications sa
JOIN public.contracts c ON c.id = sa.contract_id
JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
LEFT JOIN public.studios s ON s.id = sa.assigned_studio_id
LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.student_application_steps step1 ON step1.application_id = sa.id AND step1.step_number = 1
LEFT JOIN public.student_application_steps step3 ON step3.application_id = sa.id AND step3.step_number = 3
LEFT JOIN LATERAL (SELECT ac.* FROM public.application_cashbacks ac WHERE ac.application_id = sa.id ORDER BY ac.applied_at DESC LIMIT 1) ac ON TRUE
LEFT JOIN LATERAL (SELECT ad.* FROM public.application_discounts ad WHERE ad.application_id = sa.id ORDER BY ad.applied_at DESC LIMIT 1) ad ON TRUE
LEFT JOIN public.partner_referrals pr_raw ON pr_raw.application_id = sa.id
LEFT JOIN LATERAL (SELECT pra.* FROM public.partner_referred_applications pra WHERE pra.application_id = sa.id ORDER BY pra.referral_created_at DESC LIMIT 1) pr ON TRUE
LEFT JOIN public.partners par ON par.referral_code = pr.validated_referral_code
WHERE sa.status = 'confirmed';

GRANT SELECT ON public.sales_demographics_report TO authenticated;

-- Update accounts_receivable_report to include discount and correct adjusted_contract_value
DROP VIEW IF EXISTS public.accounts_receivable_report;
CREATE VIEW public.accounts_receivable_report AS
SELECT
  sa.id AS application_id,
  sa.student_id,
  p.first_name || ' ' || p.last_name AS student_name,
  sa.status AS application_status,
  c.name AS contract_name,
  sg.name AS studio_grade,
  sa.total_contract_value,
  COALESCE(ac.cashback_amount, 0) AS cashback_amount,
  COALESCE(sa.discount_amount, 0) AS discount_amount,
  COALESCE(sa.total_contract_value, 0) - COALESCE(ac.cashback_amount, 0) - COALESCE(sa.discount_amount, 0) AS adjusted_contract_value,
  COALESCE(ps.total_due, 0) AS total_due,
  COALESCE(ps.total_paid, 0) AS total_paid,
  COALESCE(ps.remaining_balance, 0) AS outstanding_balance,
  ps.payment_status,
  sa.assigned_studio_id,
  s.studio_number,
  sa.created_at AS application_date,
  c.contract_start,
  c.contract_end,
  ay.name AS academic_year_name
FROM public.student_applications sa
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
LEFT JOIN public.studios s ON s.id = sa.assigned_studio_id
LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
LEFT JOIN LATERAL (SELECT ac2.cashback_amount FROM public.application_cashbacks ac2 WHERE ac2.application_id = sa.id ORDER BY ac2.applied_at DESC LIMIT 1) ac ON TRUE
CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
WHERE sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature')
  AND COALESCE(ps.remaining_balance, 0) > 0;

GRANT SELECT ON public.accounts_receivable_report TO authenticated;
