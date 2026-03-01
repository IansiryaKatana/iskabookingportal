-- Add academic year context to Outstanding Balances and Deposit vs Installment Breakdown
-- so the Accounting Reports UI can show/filter by academic year (like Accounts Receivable).

-- Outstanding Balances Report: add academic_year_id, academic_year_name
DROP VIEW IF EXISTS public.outstanding_balances_report CASCADE;

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
  c.contract_end
FROM public.student_applications sa
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
WHERE sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature')
  AND COALESCE(ps.remaining_balance, 0) > 0;

GRANT SELECT ON public.outstanding_balances_report TO authenticated;

COMMENT ON VIEW public.outstanding_balances_report IS 'Outstanding Balances Report with academic year context.';

-- Deposit vs Installment Breakdown: add academic_year_id, academic_year_name
DROP VIEW IF EXISTS public.deposit_installment_breakdown CASCADE;

CREATE VIEW public.deposit_installment_breakdown AS
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
  sa.created_at AS application_date
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

COMMENT ON VIEW public.deposit_installment_breakdown IS 'Deposit vs Installment Breakdown with academic year context. Counts Stripe and manual payments.';
