-- Add 2026/27 flexible-stay portal contracts for each studio grade,
-- matching the 2025/26 placeholders so students can book after 45/51 start.

INSERT INTO public.contracts (
  academic_year_id,
  studio_grade_id,
  slug,
  name,
  summary,
  contract_start,
  contract_end,
  weeks,
  weekly_price_override,
  deposit_override,
  display_order,
  is_active,
  visible_on_portal,
  extra_days,
  is_custom_duration_placeholder
)
SELECT
  ay.id,
  sg.id,
  v.slug,
  v.name,
  '',
  ay.start_date,
  ay.end_date,
  51,
  src.weekly_price_override,
  src.deposit_override,
  999,
  true,
  true,
  0,
  true
FROM (
  VALUES
    ('silver', 'silver-flexible-26-27', 'Silver – Flexible stay (custom duration)', 'silver-51-weeks-26/27'),
    ('gold', 'gold-flexible-26-27', 'Gold – Flexible stay', 'gold-51-weeks-26/27'),
    ('platinum', 'platinum-flexible-26-27', 'Platinum Studio – Flexible stay', 'platinum-51-weeks-26/27'),
    ('rhodium', 'rhodium-flexible-26-27', 'Rhodium Studio – Flexible stay', 'rhodium-51-weeks-26/27'),
    ('rhodium-plus', 'rhodium-plus-flexible-26-27', 'Rhodium Plus Studio – Flexible stay', 'rhodium plus-51-weeks-26/27')
) AS v(grade_slug, slug, name, source_slug)
JOIN public.academic_years ay ON ay.name = '2026/2027'
JOIN public.studio_grades sg ON sg.slug = v.grade_slug
JOIN public.contracts src ON src.slug = v.source_slug
WHERE NOT EXISTS (
  SELECT 1 FROM public.contracts existing WHERE existing.slug = v.slug
);

INSERT INTO public.contract_payment_plans (contract_id, payment_plan_id, display_order)
SELECT flex.id, cpp.payment_plan_id, cpp.display_order
FROM (
  VALUES
    ('silver-flexible-26-27', 'silver-51-weeks-26/27'),
    ('gold-flexible-26-27', 'gold-51-weeks-26/27'),
    ('platinum-flexible-26-27', 'platinum-51-weeks-26/27'),
    ('rhodium-flexible-26-27', 'rhodium-51-weeks-26/27'),
    ('rhodium-plus-flexible-26-27', 'rhodium plus-51-weeks-26/27')
) AS v(flex_slug, source_slug)
JOIN public.contracts flex ON flex.slug = v.flex_slug
JOIN public.contracts src ON src.slug = v.source_slug
JOIN public.contract_payment_plans cpp ON cpp.contract_id = src.id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.contract_payment_plans existing
  WHERE existing.contract_id = flex.id
    AND existing.payment_plan_id = cpp.payment_plan_id
);
