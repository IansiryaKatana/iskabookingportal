-- Committed sale status helpers: separate operational occupancy from financial reporting.
-- checked_out = completed stay (studio released); financially equivalent to confirmed.

CREATE OR REPLACE FUNCTION public.is_committed_sale_status(p_status public.application_status)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT p_status IN (
    'confirmed',
    'checked_out',
    'awaiting_deposit',
    'awaiting_signature',
    'awaiting_verification'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_realized_sale_status(p_status public.application_status)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT p_status IN ('confirmed', 'checked_out');
$$;

COMMENT ON FUNCTION public.is_committed_sale_status(public.application_status) IS
  'True for committed sales cohort used by financial/accounting reports (includes checked_out and pipeline statuses).';
COMMENT ON FUNCTION public.is_realized_sale_status(public.application_status) IS
  'True for realized sales (confirmed or checked_out) used by sales velocity/occupancy charts.';

GRANT EXECUTE ON FUNCTION public.is_committed_sale_status(public.application_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_realized_sale_status(public.application_status) TO authenticated;

-- ============================================================================
-- Sales & Demographics
-- ============================================================================
CREATE OR REPLACE VIEW public.sales_demographics_report AS
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
LEFT JOIN public.partners par ON par.referral_code = pr.validated_referral_code
WHERE public.is_committed_sale_status(sa.status);

GRANT SELECT ON public.sales_demographics_report TO authenticated;

-- ============================================================================
-- Sales occupancy & rebookers (realized sales by contract-start month)
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
WHERE public.is_realized_sale_status(sa.status)
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

CREATE OR REPLACE VIEW public.sales_rebookers_monthly AS
SELECT
  ay.id                              AS academic_year_id,
  ay.name                            AS academic_year_name,
  DATE_TRUNC('month', c.contract_start)::date AS month_start,
  TO_CHAR(DATE_TRUNC('month', c.contract_start), 'Mon YYYY') AS month_label,
  COUNT(*) FILTER (WHERE (COALESCE(sa.is_rebooking, false) OR sa.booking_source = 'rebooker')) AS rebooker_contracts,
  SUM(sa.total_contract_value) FILTER (WHERE (COALESCE(sa.is_rebooking, false) OR sa.booking_source = 'rebooker')) AS rebooker_total_sales_value,
  COUNT(*)                           AS total_contracts,
  CASE
    WHEN COUNT(*) = 0 THEN 0
    ELSE ROUND(
      COUNT(*) FILTER (WHERE (COALESCE(sa.is_rebooking, false) OR sa.booking_source = 'rebooker'))::numeric
      / COUNT(*)::numeric * 100,
      2
    )
  END                                AS rebooker_share_percentage
FROM public.student_applications sa
JOIN public.contracts c
  ON c.id = sa.contract_id
LEFT JOIN public.academic_years ay
  ON ay.id = c.academic_year_id
WHERE public.is_realized_sale_status(sa.status)
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

-- ============================================================================
-- Cash flow & accounting reports (drop/recreate cash flow monthly — column-safe)
-- ============================================================================
DROP VIEW IF EXISTS public.student_payment_cash_flow_monthly;
DROP VIEW IF EXISTS public.student_payment_cash_flow_applications;

CREATE VIEW public.student_payment_cash_flow_applications AS
SELECT
  sa.id AS application_id,
  sa.student_id,
  TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS student_name,
  s.studio_number,
  sg.name AS studio_grade,
  c.id AS contract_id,
  c.name AS contract_name,
  c.contract_start,
  c.contract_end,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  ay.start_date AS academic_year_start,
  ay.end_date AS academic_year_end,
  CASE
    WHEN sa.extension_of_application_id IS NOT NULL THEN 'extension'
    WHEN COALESCE(c.is_custom_duration_placeholder, false) THEN 'custom'
    ELSE 'standard'
  END AS contract_type,
  sa.extension_of_application_id,
  sa.status AS application_status,
  public.resolve_payment_plan_label(
    public.resolve_application_payment_plan_id(sa.selected_payment_plan_id, c.id)
  ) AS payment_plan,
  COALESCE(
    c.deposit_override,
    pp_selected.deposit_amount,
    pp.deposit_amount,
    sgp.deposit_amount_override,
    0
  ) AS deposit_due,
  COALESCE((
    SELECT SUM(uph.amount_paid)
    FROM public.unified_payment_history uph
    WHERE uph.student_application_id = sa.id
      AND COALESCE(uph.payment_metadata->>'type', uph.payment_type) = 'deposit'
      AND uph.payment_status IN ('succeeded', 'completed')
  ), 0) AS deposit_paid,
  CASE
    WHEN COALESCE(
      c.deposit_override,
      pp_selected.deposit_amount,
      pp.deposit_amount,
      sgp.deposit_amount_override,
      0
    ) <= 0 THEN 'n/a'
    WHEN COALESCE((
      SELECT SUM(uph.amount_paid)
      FROM public.unified_payment_history uph
      WHERE uph.student_application_id = sa.id
        AND COALESCE(uph.payment_metadata->>'type', uph.payment_type) = 'deposit'
        AND uph.payment_status IN ('succeeded', 'completed')
    ), 0) >= GREATEST(
      COALESCE(
        c.deposit_override,
        pp_selected.deposit_amount,
        pp.deposit_amount,
        sgp.deposit_amount_override,
        0
      ) - 0.01,
      0
    ) THEN 'paid'
    WHEN COALESCE((
      SELECT SUM(uph.amount_paid)
      FROM public.unified_payment_history uph
      WHERE uph.student_application_id = sa.id
        AND COALESCE(uph.payment_metadata->>'type', uph.payment_type) = 'deposit'
        AND uph.payment_status IN ('succeeded', 'completed')
    ), 0) > 0 THEN 'partial'
    ELSE 'unpaid'
  END AS deposit_status,
  COALESCE(ps.total_due, 0) AS total_installments_due
FROM public.student_applications sa
INNER JOIN public.contracts c ON c.id = sa.contract_id
INNER JOIN public.academic_years ay ON ay.id = c.academic_year_id
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.studios s ON s.id = sa.assigned_studio_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
LEFT JOIN public.payment_plans pp ON pp.id = c.payment_plan_id
LEFT JOIN public.payment_plans pp_selected ON pp_selected.id = sa.selected_payment_plan_id
LEFT JOIN public.studio_grade_prices sgp
  ON sgp.academic_year_id = c.academic_year_id
  AND sgp.studio_grade_id = sa.studio_grade_id
  AND sgp.is_active = true
CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
WHERE public.is_committed_sale_status(sa.status);

GRANT SELECT ON public.student_payment_cash_flow_applications TO authenticated;

CREATE VIEW public.student_payment_cash_flow_monthly AS
WITH per_app_installments AS (
  SELECT
    sa.id AS application_id,
    c.academic_year_id,
    gb.due_date,
    gb.amount_due,
    gb.amount_paid,
    gb.remaining_amount
  FROM public.student_applications sa
  INNER JOIN public.contracts c ON c.id = sa.contract_id
  CROSS JOIN LATERAL public.get_installment_breakdown(sa.id) gb
  WHERE public.is_committed_sale_status(sa.status)
),
due_by_month AS (
  SELECT
    pai.application_id,
    pai.academic_year_id,
    to_char(date_trunc('month', pai.due_date)::date, 'YYYY-MM') AS month_key,
    date_trunc('month', pai.due_date)::date AS month_start,
    UPPER(to_char(date_trunc('month', pai.due_date)::date, 'Mon')) AS month_label,
    SUM(pai.amount_due) AS amount_due,
    SUM(pai.amount_paid) AS amount_paid_on_due,
    GREATEST(SUM(pai.remaining_amount), 0) AS amount_remaining,
    MAX(pai.due_date) AS latest_due_date_in_month
  FROM per_app_installments pai
  GROUP BY pai.application_id, pai.academic_year_id, date_trunc('month', pai.due_date)::date
),
collected_by_month AS (
  SELECT
    uph.student_application_id AS application_id,
    c.academic_year_id,
    to_char(date_trunc('month', uph.payment_date)::date, 'YYYY-MM') AS month_key,
    date_trunc('month', uph.payment_date)::date AS month_start,
    UPPER(to_char(date_trunc('month', uph.payment_date)::date, 'Mon')) AS month_label,
    SUM(uph.amount_paid) AS amount_collected
  FROM public.unified_payment_history uph
  INNER JOIN public.student_applications sa ON sa.id = uph.student_application_id
  INNER JOIN public.contracts c ON c.id = sa.contract_id
  WHERE uph.payment_status IN ('succeeded', 'completed')
    AND COALESCE(uph.payment_metadata->>'type', uph.payment_type) != 'deposit'
    AND public.is_committed_sale_status(sa.status)
  GROUP BY uph.student_application_id, c.academic_year_id, date_trunc('month', uph.payment_date)::date
),
merged AS (
  SELECT
    COALESCE(d.application_id, c.application_id) AS application_id,
    COALESCE(d.academic_year_id, c.academic_year_id) AS academic_year_id,
    COALESCE(d.month_key, c.month_key) AS month_key,
    COALESCE(d.month_start, c.month_start) AS month_start,
    COALESCE(d.month_label, c.month_label) AS month_label,
    COALESCE(d.amount_due, 0) AS amount_due,
    COALESCE(d.amount_paid_on_due, 0) AS amount_paid_on_due,
    COALESCE(d.amount_remaining, 0) AS amount_remaining,
    COALESCE(c.amount_collected, 0) AS amount_collected,
    d.latest_due_date_in_month
  FROM due_by_month d
  FULL OUTER JOIN collected_by_month c
    ON c.application_id = d.application_id
    AND c.academic_year_id = d.academic_year_id
    AND d.month_key = c.month_key
)
SELECT
  m.application_id,
  m.academic_year_id,
  m.month_key,
  m.month_start,
  m.month_label,
  m.amount_due,
  m.amount_paid_on_due,
  m.amount_remaining,
  m.amount_collected,
  CASE
    WHEN m.amount_due <= 0 AND m.amount_collected > 0 THEN 'collected_only'
    WHEN m.amount_due <= 0 THEN 'empty'
    WHEN m.amount_paid_on_due >= GREATEST(m.amount_due - 0.01, 0) THEN 'paid'
    WHEN m.amount_paid_on_due > 0 THEN 'partially_paid'
    WHEN m.latest_due_date_in_month IS NOT NULL AND m.latest_due_date_in_month < CURRENT_DATE THEN 'overdue'
    ELSE 'upcoming'
  END AS month_status
FROM merged m;

GRANT SELECT ON public.student_payment_cash_flow_monthly TO authenticated;

CREATE OR REPLACE VIEW public.upcoming_and_paid_installments_report AS
SELECT
  sa.id AS application_id,
  sa.student_id,
  TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS student_name,
  s.studio_number,
  sg.name AS studio_grade,
  c.id AS contract_id,
  c.name AS contract_name,
  ay.name AS academic_year_name,
  c.academic_year_id AS academic_year_id,
  gb.installment_id,
  gb.sequence,
  gb.label AS installment_label,
  gb.due_date,
  gb.amount_due AS amount,
  false AS is_deposit,
  gb.amount_paid,
  gb.remaining_amount AS amount_remaining,
  (gb.payment_status = 'paid') AS is_paid,
  CASE
    WHEN gb.amount_paid > 0 AND gb.installment_id IS NOT NULL THEN
      COALESCE(
        (
          SELECT MAX(sp.created_at)::date
          FROM public.stripe_payments sp
          WHERE sp.student_application_id = sa.id
            AND sp.metadata->>'instalment_id' = gb.installment_id::text
            AND sp.status IN ('succeeded', 'completed')
        ),
        (
          SELECT MAX(mp.payment_date)::date
          FROM public.manual_payments mp
          WHERE mp.instalment_id = gb.installment_id
            AND mp.application_id = sa.id
        )
      )
    ELSE NULL
  END AS paid_date,
  CASE
    WHEN gb.payment_status = 'paid' THEN 'paid'
    WHEN gb.payment_status = 'partial' THEN 'partially_paid'
    WHEN gb.due_date < CURRENT_DATE THEN 'overdue'
    ELSE 'upcoming'
  END AS status,
  public.resolve_payment_plan_label(
    public.resolve_application_payment_plan_id(sa.selected_payment_plan_id, c.id)
  ) AS payment_plan
FROM public.student_applications sa
INNER JOIN public.contracts c ON c.id = sa.contract_id
INNER JOIN public.academic_years ay ON ay.id = c.academic_year_id
CROSS JOIN LATERAL public.get_installment_breakdown(sa.id) gb
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.studios s ON s.id = sa.assigned_studio_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
WHERE public.is_committed_sale_status(sa.status);

GRANT SELECT ON public.upcoming_and_paid_installments_report TO authenticated;

CREATE OR REPLACE VIEW public.outstanding_balances_report AS
SELECT
  sa.id AS application_id,
  sa.student_id,
  p.first_name || ' ' || p.last_name AS student_name,
  sa.status AS application_status,
  c.name AS contract_name,
  sg.name AS studio_grade,
  c.academic_year_id,
  ay.name AS academic_year_name,
  COALESCE(ps.total_due, 0) AS total_due,
  COALESCE(ps.total_paid, 0) AS total_paid,
  COALESCE(ps.remaining_balance, 0) AS outstanding_balance,
  (
    SELECT MIN(gb.due_date)
    FROM public.get_installment_breakdown(sa.id) gb
    WHERE gb.payment_status IN ('unpaid', 'partial')
      AND gb.due_date < CURRENT_DATE
  ) AS oldest_unpaid_due_date,
  CASE
    WHEN (
      SELECT MIN(gb.due_date)
      FROM public.get_installment_breakdown(sa.id) gb
      WHERE gb.payment_status IN ('unpaid', 'partial')
        AND gb.due_date < CURRENT_DATE
    ) IS NOT NULL THEN
      CURRENT_DATE - (
        SELECT MIN(gb.due_date)
        FROM public.get_installment_breakdown(sa.id) gb
        WHERE gb.payment_status IN ('unpaid', 'partial')
          AND gb.due_date < CURRENT_DATE
      )
    ELSE 0
  END AS days_overdue,
  sa.created_at AS application_date,
  c.contract_start,
  c.contract_end,
  public.resolve_payment_plan_label(
    public.resolve_application_payment_plan_id(sa.selected_payment_plan_id, c.id)
  ) AS payment_plan
FROM public.student_applications sa
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
WHERE public.is_committed_sale_status(sa.status)
  AND COALESCE(ps.remaining_balance, 0) > 0;

GRANT SELECT ON public.outstanding_balances_report TO authenticated;

CREATE OR REPLACE VIEW public.accounts_receivable_report AS
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
  ay.name AS academic_year_name,
  public.resolve_payment_plan_label(
    public.resolve_application_payment_plan_id(sa.selected_payment_plan_id, c.id)
  ) AS payment_plan
FROM public.student_applications sa
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
LEFT JOIN public.studios s ON s.id = sa.assigned_studio_id
LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
LEFT JOIN LATERAL (
  SELECT ac2.cashback_amount
  FROM public.application_cashbacks ac2
  WHERE ac2.application_id = sa.id
  ORDER BY ac2.applied_at DESC
  LIMIT 1
) ac ON TRUE
CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
WHERE public.is_committed_sale_status(sa.status)
  AND COALESCE(ps.remaining_balance, 0) > 0;

GRANT SELECT ON public.accounts_receivable_report TO authenticated;

CREATE OR REPLACE VIEW public.deposit_installment_breakdown AS
SELECT
  sa.id AS application_id,
  sa.student_id,
  p.first_name || ' ' || p.last_name AS student_name,
  c.name AS contract_name,
  sg.name AS studio_grade,
  c.academic_year_id,
  ay.name AS academic_year_name,
  sa.total_contract_value,
  COALESCE((
    SELECT SUM(amount_paid)
    FROM public.unified_payment_history
    WHERE student_application_id = sa.id
      AND payment_metadata->>'type' = 'deposit'
      AND payment_status IN ('succeeded', 'completed')
  ), 0) AS deposit_paid,
  COALESCE(
    c.deposit_override,
    pp_selected.deposit_amount,
    pp.deposit_amount,
    sgp.deposit_amount_override,
    0
  ) AS expected_deposit,
  COALESCE((
    SELECT SUM(amount_paid)
    FROM public.unified_payment_history
    WHERE student_application_id = sa.id
      AND payment_metadata->>'type' != 'deposit'
      AND payment_status IN ('succeeded', 'completed')
  ), 0) AS installments_paid,
  COALESCE(ps.total_due, 0) AS expected_installments,
  (
    SELECT COUNT(*)
    FROM public.unified_payment_history
    WHERE student_application_id = sa.id
      AND payment_metadata->>'type' = 'deposit'
      AND payment_status IN ('succeeded', 'completed')
  ) AS deposit_payment_count,
  (
    SELECT COUNT(*)
    FROM public.unified_payment_history
    WHERE student_application_id = sa.id
      AND payment_metadata->>'type' != 'deposit'
      AND payment_status IN ('succeeded', 'completed')
  ) AS installment_payment_count,
  sa.status,
  sa.created_at AS application_date,
  public.resolve_payment_plan_label(
    public.resolve_application_payment_plan_id(sa.selected_payment_plan_id, c.id)
  ) AS payment_plan
FROM public.student_applications sa
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
LEFT JOIN public.payment_plans pp ON pp.id = c.payment_plan_id
LEFT JOIN public.payment_plans pp_selected ON pp_selected.id = sa.selected_payment_plan_id
LEFT JOIN public.studio_grade_prices sgp
  ON sgp.academic_year_id = c.academic_year_id
  AND sgp.studio_grade_id = sa.studio_grade_id
  AND sgp.is_active = true
CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
WHERE public.is_committed_sale_status(sa.status);

GRANT SELECT ON public.deposit_installment_breakdown TO authenticated;

CREATE OR REPLACE VIEW public.fully_paid_students AS
SELECT DISTINCT
  sa.id AS application_id,
  sa.student_id,
  p.first_name,
  p.last_name,
  c.id AS contract_id,
  c.name AS contract_name,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  ps.total_due,
  ps.total_paid,
  ps.remaining_balance,
  ps.payment_status,
  ps.last_payment_date,
  sa.status AS application_status,
  sa.created_at AS application_created_at,
  s.studio_number,
  sg.name AS studio_grade_name,
  public.resolve_payment_plan_label(
    public.resolve_application_payment_plan_id(sa.selected_payment_plan_id, c.id)
  ) AS payment_plan
FROM public.student_applications sa
INNER JOIN public.profiles p ON sa.student_id = p.id
INNER JOIN public.contracts c ON sa.contract_id = c.id
INNER JOIN public.academic_years ay ON c.academic_year_id = ay.id
LEFT JOIN public.studios s ON sa.assigned_studio_id = s.id
LEFT JOIN public.studio_grades sg ON s.studio_grade_id = sg.id
CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
WHERE public.is_realized_sale_status(sa.status)
  AND ps.payment_status = 'fully_paid'
  AND ps.remaining_balance <= 0;

GRANT SELECT ON public.fully_paid_students TO authenticated;
