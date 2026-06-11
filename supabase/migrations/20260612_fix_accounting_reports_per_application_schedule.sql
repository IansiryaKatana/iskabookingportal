-- Fix accounting report views that incorrectly used contract-level contract_payment_schedule.
-- Shared contracts can contain merged rows from multiple payment plans; totals and instalment
-- rows must come from each application's selected plan (same source as application review and
-- get_payment_summary / get_installment_breakdown).

-- Drop without CASCADE so a failed recreate cannot remove unrelated views.
DROP VIEW IF EXISTS public.upcoming_and_paid_installments_report;
DROP VIEW IF EXISTS public.student_payment_cash_flow_monthly;
DROP VIEW IF EXISTS public.student_payment_cash_flow_applications;
DROP VIEW IF EXISTS public.outstanding_balances_report;

-- ============================================================================
-- 1) Student Payment Cash Flow — application header totals
-- ============================================================================
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
WHERE sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature');

GRANT SELECT ON public.student_payment_cash_flow_applications TO authenticated;

-- ============================================================================
-- 2) Student Payment Cash Flow — monthly matrix (per-application instalment schedule)
-- ============================================================================
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
  WHERE sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature')
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
    AND sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature')
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

-- ============================================================================
-- 3) Upcoming & Paid Installments — one row per application instalment
-- ============================================================================
CREATE VIEW public.upcoming_and_paid_installments_report AS
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
WHERE sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature');

GRANT SELECT ON public.upcoming_and_paid_installments_report TO authenticated;

-- ============================================================================
-- 4) Outstanding Balances — fix ageing columns (money columns unchanged)
-- ============================================================================
CREATE VIEW public.outstanding_balances_report AS
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
WHERE sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature')
  AND COALESCE(ps.remaining_balance, 0) > 0;

GRANT SELECT ON public.outstanding_balances_report TO authenticated;

COMMENT ON VIEW public.student_payment_cash_flow_applications IS
  'Cash flow header: per-application instalment total from get_payment_summary (selected payment plan).';
COMMENT ON VIEW public.student_payment_cash_flow_monthly IS
  'Cash flow monthly cells from get_installment_breakdown per application; collected from unified_payment_history.';
COMMENT ON VIEW public.upcoming_and_paid_installments_report IS
  'One row per application instalment from get_installment_breakdown (selected payment plan).';
COMMENT ON VIEW public.outstanding_balances_report IS
  'Outstanding balances: money from get_payment_summary; ageing from get_installment_breakdown unpaid/partial past due.';
