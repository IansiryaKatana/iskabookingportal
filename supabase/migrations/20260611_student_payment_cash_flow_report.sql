-- Student Payment Cash Flow report: one row per application (header) and one row per application/month (grid).
-- Supports accountant-style monthly cash-flow matrix with deposit, studio, and partial payment tracking.

CREATE OR REPLACE VIEW public.student_payment_cash_flow_applications AS
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
  COALESCE((
    SELECT SUM(cps.amount)
    FROM public.contract_payment_schedule cps
    WHERE cps.contract_id = c.id
      AND LOWER(COALESCE(cps.label, '')) NOT LIKE '%deposit%'
  ), 0) AS total_installments_due
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
WHERE sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature');

GRANT SELECT ON public.student_payment_cash_flow_applications TO authenticated;

CREATE OR REPLACE VIEW public.student_payment_cash_flow_monthly AS
WITH installment_payments AS (
  SELECT
    cps.id AS schedule_id,
    sa.id AS application_id,
    c.academic_year_id,
    cps.due_date,
    cps.amount,
    COALESCE((
      SELECT SUM(sp.amount)
      FROM public.stripe_payments sp
      WHERE sp.student_application_id = sa.id
        AND sp.metadata->>'instalment_id' = cps.id::text
        AND sp.status IN ('succeeded', 'completed')
    ), 0) AS stripe_paid,
    COALESCE((
      SELECT SUM(mp.amount)
      FROM public.manual_payments mp
      WHERE mp.instalment_id = cps.id
        AND mp.application_id = sa.id
    ), 0) AS manual_paid
  FROM public.contract_payment_schedule cps
  INNER JOIN public.contracts c ON c.id = cps.contract_id
  INNER JOIN public.student_applications sa ON sa.contract_id = c.id
    AND sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature')
  WHERE LOWER(COALESCE(cps.label, '')) NOT LIKE '%deposit%'
),
due_by_month AS (
  SELECT
    ip.application_id,
    ip.academic_year_id,
    to_char(date_trunc('month', ip.due_date)::date, 'YYYY-MM') AS month_key,
    date_trunc('month', ip.due_date)::date AS month_start,
    UPPER(to_char(date_trunc('month', ip.due_date)::date, 'Mon')) AS month_label,
    SUM(ip.amount) AS amount_due,
    SUM(ip.stripe_paid + ip.manual_paid) AS amount_paid_on_due,
    GREATEST(SUM(ip.amount) - SUM(ip.stripe_paid + ip.manual_paid), 0) AS amount_remaining,
    MAX(ip.due_date) AS latest_due_date_in_month
  FROM installment_payments ip
  GROUP BY ip.application_id, ip.academic_year_id, date_trunc('month', ip.due_date)::date
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
    AND c.month_key = d.month_key
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

COMMENT ON VIEW public.student_payment_cash_flow_applications IS
  'Cash flow report header: one row per application with deposit, studio, contract type, and total installments due.';
COMMENT ON VIEW public.student_payment_cash_flow_monthly IS
  'Cash flow report monthly cells: due amounts by due-date month, paid/remaining, and collected by payment-date month.';
