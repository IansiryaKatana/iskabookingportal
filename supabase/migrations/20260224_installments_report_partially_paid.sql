-- Add "partially_paid" status to upcoming_and_paid_installments_report.
-- Each installment now shows: paid (full amount), partially_paid (some paid, less than due), overdue, or upcoming.
-- Uses amount-based logic: sum payments linked to this installment vs schedule amount; £0.01 tolerance for "paid".

DROP VIEW IF EXISTS public.upcoming_and_paid_installments_report;

CREATE VIEW public.upcoming_and_paid_installments_report AS
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
  END AS status
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

COMMENT ON VIEW public.upcoming_and_paid_installments_report IS 'One row per installment: student, studio, due date, amount, amount_paid, amount_remaining, is_paid, paid_date, status (paid|partially_paid|overdue|upcoming). Partially paid = some payment linked but less than schedule amount.';
