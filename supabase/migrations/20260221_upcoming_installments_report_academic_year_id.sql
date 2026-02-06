-- Add academic_year_id to upcoming_and_paid_installments_report for filtering by academic year.
-- "Due within" then applies to active payment plans for the selected year.
-- DROP then CREATE so we can add a new column (CREATE OR REPLACE would require same column count/order).

DROP VIEW IF EXISTS public.upcoming_and_paid_installments_report;

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
  cps.id AS installment_id,
  cps.sequence,
  cps.label AS installment_label,
  cps.due_date,
  cps.amount,
  (cps.label ILIKE '%deposit%') AS is_deposit,
  (
    EXISTS (
      SELECT 1 FROM public.stripe_payments sp
      WHERE sp.metadata->>'instalment_id' = cps.id::text
        AND sp.status IN ('succeeded', 'completed')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.manual_payments mp
      WHERE mp.instalment_id = cps.id
    )
  ) AS is_paid,
  COALESCE(
    (SELECT sp.created_at::date
     FROM public.stripe_payments sp
     WHERE sp.metadata->>'instalment_id' = cps.id::text
       AND sp.status IN ('succeeded', 'completed')
     LIMIT 1),
    (SELECT mp.payment_date::date
     FROM public.manual_payments mp
     WHERE mp.instalment_id = cps.id
     LIMIT 1)
  ) AS paid_date,
  CASE
    WHEN (
      EXISTS (SELECT 1 FROM public.stripe_payments sp WHERE sp.metadata->>'instalment_id' = cps.id::text AND sp.status IN ('succeeded', 'completed'))
      OR EXISTS (SELECT 1 FROM public.manual_payments mp WHERE mp.instalment_id = cps.id)
    ) THEN 'paid'
    WHEN cps.due_date < CURRENT_DATE THEN 'overdue'
    ELSE 'upcoming'
  END AS status
FROM public.contract_payment_schedule cps
INNER JOIN public.contracts c ON c.id = cps.contract_id
INNER JOIN public.student_applications sa ON sa.contract_id = c.id
  AND sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature')
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.studios s ON s.id = sa.assigned_studio_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id;

GRANT SELECT ON public.upcoming_and_paid_installments_report TO authenticated;

COMMENT ON VIEW public.upcoming_and_paid_installments_report IS 'One row per installment: student name, studio, due date, amount, is_paid, paid_date, status. Includes academic_year_id for filtering by academic year (active payment plans for that year).';
