-- Fix: Deposit vs Installment Breakdown showed 0.00/0.00 and 0 deposits for bulk-imported applications.
-- Cause: View only counted payment_status = 'succeeded'. Manual payments in unified_payment_history use
-- payment_status = 'completed', so they were excluded. Include both so Stripe and manual payments count.

DROP VIEW IF EXISTS public.deposit_installment_breakdown CASCADE;

CREATE VIEW public.deposit_installment_breakdown AS
SELECT
  sa.id AS application_id,
  sa.student_id,
  p.first_name || ' ' || p.last_name AS student_name,
  c.name AS contract_name,
  sg.name AS studio_grade,
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
LEFT JOIN public.payment_plans pp ON pp.id = c.payment_plan_id
LEFT JOIN public.payment_plans pp_selected ON pp_selected.id = sa.selected_payment_plan_id
LEFT JOIN public.studio_grade_prices sgp
  ON sgp.academic_year_id = c.academic_year_id
  AND sgp.studio_grade_id = sa.studio_grade_id
  AND sgp.is_active = true
CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
WHERE sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature');

GRANT SELECT ON public.deposit_installment_breakdown TO authenticated;

COMMENT ON VIEW public.deposit_installment_breakdown IS 'Deposit vs Installment Breakdown; total_due is installment-only. expected_deposit from contract override, then selected/contract payment plan, then academic year studio_grade_prices. Counts Stripe and manual payments.';
