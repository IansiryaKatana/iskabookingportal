-- Add payment plan label to student-level accounting reports (defaults + custom contracts).

CREATE OR REPLACE FUNCTION public.resolve_application_payment_plan_id(
  p_selected_payment_plan_id uuid,
  p_contract_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    p_selected_payment_plan_id,
    (
      SELECT c.payment_plan_id
      FROM public.contracts c
      WHERE c.id = p_contract_id
    ),
    (
      SELECT cpp.payment_plan_id
      FROM public.contract_payment_plans cpp
      WHERE cpp.contract_id = p_contract_id
      ORDER BY cpp.display_order ASC, cpp.created_at ASC
      LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.resolve_payment_plan_label(p_plan_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_plan_id IS NULL THEN NULL
    ELSE COALESCE(
      source_pp.name,
      CASE
        WHEN inst.non_deposit_count = 1 THEN 'Pay in Full'
        WHEN inst.non_deposit_count > 1 THEN inst.non_deposit_count::text || ' Instalments'
        ELSE NULL
      END,
      pp.name
    )
  END
  FROM (SELECT p_plan_id AS plan_id) input
  LEFT JOIN public.payment_plans pp ON pp.id = input.plan_id
  LEFT JOIN public.payment_plans source_pp ON source_pp.id = pp.source_payment_plan_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS non_deposit_count
    FROM public.payment_plan_installments ppi
    WHERE ppi.payment_plan_id = input.plan_id
      AND COALESCE(lower(ppi.label), '') NOT LIKE '%deposit%'
  ) inst ON TRUE;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_application_payment_plan_id(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_payment_plan_label(uuid) TO authenticated;

-- 1) Accounts Receivable
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
WHERE sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature')
  AND COALESCE(ps.remaining_balance, 0) > 0;

GRANT SELECT ON public.accounts_receivable_report TO authenticated;

-- 2) Outstanding Balances
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
    SELECT MIN(cps.due_date)
    FROM public.contract_payment_schedule cps
    LEFT JOIN public.stripe_payments sp ON sp.metadata->>'instalment_id' = cps.id::text
      AND sp.status = 'succeeded'
    LEFT JOIN public.manual_payments mp ON mp.instalment_id = cps.id
    WHERE cps.contract_id = sa.contract_id
      AND sp.id IS NULL
      AND mp.id IS NULL
      AND cps.due_date < CURRENT_DATE
  ) AS oldest_unpaid_due_date,
  CASE
    WHEN (
      SELECT MIN(cps.due_date)
      FROM public.contract_payment_schedule cps
      LEFT JOIN public.stripe_payments sp ON sp.metadata->>'instalment_id' = cps.id::text
        AND sp.status = 'succeeded'
      LEFT JOIN public.manual_payments mp ON mp.instalment_id = cps.id
      WHERE cps.contract_id = sa.contract_id
        AND sp.id IS NULL
        AND mp.id IS NULL
        AND cps.due_date < CURRENT_DATE
    ) IS NOT NULL THEN
      CURRENT_DATE - (
        SELECT MIN(cps.due_date)
        FROM public.contract_payment_schedule cps
        LEFT JOIN public.stripe_payments sp ON sp.metadata->>'instalment_id' = cps.id::text
          AND sp.status = 'succeeded'
        LEFT JOIN public.manual_payments mp ON mp.instalment_id = cps.id
        WHERE cps.contract_id = sa.contract_id
          AND sp.id IS NULL
          AND mp.id IS NULL
          AND cps.due_date < CURRENT_DATE
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

-- 3) Deposit vs Installment Breakdown
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
WHERE sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature');

GRANT SELECT ON public.deposit_installment_breakdown TO authenticated;

-- 4) Bank Reconciliation
CREATE OR REPLACE VIEW public.bank_reconciliation_report AS
SELECT
  uph.payment_id,
  uph.payment_source,
  uph.student_application_id,
  sa.student_id,
  p.first_name || ' ' || p.last_name AS student_name,
  uph.amount_paid,
  uph.currency,
  uph.payment_status,
  uph.payment_date,
  uph.stripe_payment_intent_id,
  CASE
    WHEN uph.payment_source = 'stripe' THEN 'Stripe'
    ELSE 'Manual Entry'
  END AS payment_method,
  uph.manual_entry_notes,
  uph.entered_by_user_id,
  CASE
    WHEN uph.payment_source = 'manual' THEN
      (SELECT first_name || ' ' || last_name FROM public.profiles WHERE id = uph.entered_by_user_id)
    ELSE NULL
  END AS entered_by_name,
  CASE
    WHEN COALESCE(uph.payment_metadata->>'type', uph.payment_type) = 'deposit' THEN 'Deposit'
    ELSE 'Installment'
  END AS payment_type,
  c.name AS contract_name,
  sg.name AS studio_grade,
  CASE
    WHEN uph.payment_source = 'stripe' THEN
      (SELECT invoice_number FROM public.stripe_payments WHERE id = uph.payment_id)
    ELSE
      (SELECT invoice_number FROM public.manual_payments WHERE id = uph.payment_id)
  END AS invoice_number,
  CASE
    WHEN uph.payment_source = 'stripe' THEN
      (SELECT invoice_generated_at FROM public.stripe_payments WHERE id = uph.payment_id)
    ELSE
      (SELECT invoice_generated_at FROM public.manual_payments WHERE id = uph.payment_id)
  END AS invoice_generated_at,
  public.resolve_payment_plan_label(
    public.resolve_application_payment_plan_id(sa.selected_payment_plan_id, sa.contract_id)
  ) AS payment_plan
FROM public.unified_payment_history uph
LEFT JOIN public.student_applications sa ON sa.id = uph.student_application_id
LEFT JOIN public.profiles p ON p.id = uph.student_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
WHERE uph.payment_status IN ('succeeded', 'completed')
ORDER BY uph.payment_date DESC;

GRANT SELECT ON public.bank_reconciliation_report TO authenticated;

-- 5) Upcoming & Paid Installments
CREATE OR REPLACE VIEW public.upcoming_and_paid_installments_report AS
WITH installment_payments AS (
  SELECT
    cps.id AS schedule_id,
    sa.id AS application_id,
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
    ), 0) AS manual_paid,
    COALESCE((
      SELECT MAX(sp.created_at)::date
      FROM public.stripe_payments sp
      WHERE sp.student_application_id = sa.id
        AND sp.metadata->>'instalment_id' = cps.id::text
        AND sp.status IN ('succeeded', 'completed')
    ), (
      SELECT MAX(mp.payment_date)
      FROM public.manual_payments mp
      WHERE mp.instalment_id = cps.id
        AND mp.application_id = sa.id
    )) AS last_paid_date
  FROM public.contract_payment_schedule cps
  INNER JOIN public.contracts c ON c.id = cps.contract_id
  INNER JOIN public.student_applications sa ON sa.contract_id = c.id
    AND sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature')
)
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
  cps.id AS installment_id,
  cps.sequence,
  cps.label AS installment_label,
  cps.due_date,
  cps.amount,
  (cps.label ILIKE '%deposit%') AS is_deposit,
  (ip.stripe_paid + ip.manual_paid) AS amount_paid,
  GREATEST(cps.amount - (ip.stripe_paid + ip.manual_paid), 0) AS amount_remaining,
  ((ip.stripe_paid + ip.manual_paid) >= GREATEST(cps.amount - 0.01, 0)) AS is_paid,
  ip.last_paid_date AS paid_date,
  CASE
    WHEN (ip.stripe_paid + ip.manual_paid) >= GREATEST(cps.amount - 0.01, 0) THEN 'paid'
    WHEN (ip.stripe_paid + ip.manual_paid) > 0 THEN 'partially_paid'
    WHEN cps.due_date < CURRENT_DATE THEN 'overdue'
    ELSE 'upcoming'
  END AS status,
  public.resolve_payment_plan_label(
    public.resolve_application_payment_plan_id(sa.selected_payment_plan_id, c.id)
  ) AS payment_plan
FROM public.contract_payment_schedule cps
INNER JOIN public.contracts c ON c.id = cps.contract_id
INNER JOIN public.student_applications sa ON sa.contract_id = c.id
  AND sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature')
LEFT JOIN installment_payments ip ON ip.schedule_id = cps.id AND ip.application_id = sa.id
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.studios s ON s.id = sa.assigned_studio_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id;

GRANT SELECT ON public.upcoming_and_paid_installments_report TO authenticated;

-- 6) Fully Paid Students view + RPC
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
WHERE sa.status = 'confirmed'
  AND ps.payment_status = 'fully_paid'
  AND ps.remaining_balance <= 0;

GRANT SELECT ON public.fully_paid_students TO authenticated;

DROP FUNCTION IF EXISTS public.get_fully_paid_students(uuid, uuid, text, text);

CREATE FUNCTION public.get_fully_paid_students(
  p_contract_id uuid DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_start_date text DEFAULT NULL,
  p_end_date text DEFAULT NULL
)
RETURNS TABLE (
  application_id uuid,
  student_id uuid,
  first_name text,
  last_name text,
  email text,
  contract_id uuid,
  contract_name text,
  academic_year_id uuid,
  academic_year_name text,
  total_due numeric,
  total_paid numeric,
  remaining_balance numeric,
  payment_status text,
  last_payment_date timestamptz,
  application_status text,
  application_created_at timestamptz,
  studio_number text,
  studio_grade_name text,
  payment_plan text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_start_date date;
  v_end_date date;
BEGIN
  v_start_date := CASE WHEN p_start_date IS NULL OR p_start_date = '' THEN NULL ELSE p_start_date::date END;
  v_end_date := CASE WHEN p_end_date IS NULL OR p_end_date = '' THEN NULL ELSE p_end_date::date END;

  RETURN QUERY
  SELECT
    fps.application_id,
    fps.student_id,
    fps.first_name,
    fps.last_name,
    COALESCE(u.email, '')::text AS email,
    fps.contract_id,
    fps.contract_name,
    fps.academic_year_id,
    fps.academic_year_name,
    fps.total_due,
    fps.total_paid,
    fps.remaining_balance,
    fps.payment_status,
    fps.last_payment_date,
    fps.application_status,
    fps.application_created_at,
    fps.studio_number,
    fps.studio_grade_name,
    fps.payment_plan
  FROM public.fully_paid_students fps
  LEFT JOIN auth.users u ON fps.student_id = u.id
  WHERE (p_contract_id IS NULL OR fps.contract_id = p_contract_id)
    AND (p_academic_year_id IS NULL OR fps.academic_year_id = p_academic_year_id)
    AND (v_start_date IS NULL OR fps.last_payment_date IS NULL OR date(fps.last_payment_date) >= v_start_date)
    AND (v_end_date IS NULL OR fps.last_payment_date IS NULL OR date(fps.last_payment_date) <= v_end_date)
  ORDER BY fps.last_payment_date DESC, fps.application_created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_fully_paid_students(uuid, uuid, text, text) TO authenticated;
