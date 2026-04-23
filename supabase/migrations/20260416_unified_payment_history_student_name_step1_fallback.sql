-- Ensure payment history name search works even when profiles first/last name is blank.
-- Fallback order for student_name:
-- 1) profiles.first_name + profiles.last_name
-- 2) student_application_steps step 1 payload first_name/last_name
-- 3) "Unknown student"

CREATE OR REPLACE VIEW public.unified_payment_history AS
-- Stripe payments from stripe_payments table
SELECT
  'stripe' AS payment_source,
  sp.id AS payment_id,
  sp.student_application_id,
  sp.payment_plan_id,
  sp.amount AS amount_paid,
  sp.currency,
  sp.status AS payment_status,
  sp.stripe_payment_intent_id,
  sp.created_at AS payment_date,
  sp.updated_at,
  NULL::UUID AS manual_entry_id,
  NULL::TEXT AS manual_entry_notes,
  NULL::UUID AS entered_by_user_id,
  sa.student_id,
  CASE
    WHEN sp.metadata->>'instalment_id' IS NOT NULL THEN
      (SELECT cps.sequence
       FROM public.contract_payment_schedule cps
       WHERE cps.id::text = sp.metadata->>'instalment_id'
       LIMIT 1)
    ELSE NULL
  END AS installment_number,
  CASE
    WHEN sp.metadata->>'instalment_id' IS NOT NULL THEN
      (SELECT cps.due_date
       FROM public.contract_payment_schedule cps
       WHERE cps.id::text = sp.metadata->>'instalment_id'
       LIMIT 1)
    ELSE NULL
  END AS due_date,
  c.id AS contract_id,
  c.name AS contract_name,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  COALESCE(sp.metadata->>'type', 'instalment') AS payment_type,
  sp.metadata AS payment_metadata,
  COALESCE(
    NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
    NULLIF(TRIM(COALESCE(step1.payload->>'first_name', '') || ' ' || COALESCE(step1.payload->>'last_name', '')), ''),
    'Unknown student'
  ) AS student_name,
  s.studio_number,
  sg.name AS studio_grade
FROM public.stripe_payments sp
INNER JOIN public.student_applications sa ON sp.student_application_id = sa.id
LEFT JOIN public.contracts c ON sa.contract_id = c.id
LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.studios s ON s.id = sa.assigned_studio_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
LEFT JOIN LATERAL (
  SELECT sas.payload
  FROM public.student_application_steps sas
  WHERE sas.application_id = sa.id
    AND sas.step_number = 1
  ORDER BY sas.updated_at DESC NULLS LAST, sas.created_at DESC NULLS LAST
  LIMIT 1
) step1 ON TRUE
WHERE sp.status IN ('succeeded', 'completed')

UNION ALL

-- Deposits from student_applications (backward compatibility)
SELECT
  'stripe' AS payment_source,
  gen_random_uuid() AS payment_id,
  sa.id AS student_application_id,
  NULL::UUID AS payment_plan_id,
  COALESCE(c.deposit_override, pp.deposit_amount, 0)::NUMERIC(12,4) AS amount_paid,
  'GBP' AS currency,
  'succeeded' AS payment_status,
  sa.deposit_payment_intent_id AS stripe_payment_intent_id,
  COALESCE(sa.submitted_at, sa.created_at) AS payment_date,
  sa.updated_at,
  NULL::UUID AS manual_entry_id,
  NULL::TEXT AS manual_entry_notes,
  NULL::UUID AS entered_by_user_id,
  sa.student_id,
  NULL::INTEGER AS installment_number,
  NULL::DATE AS due_date,
  c.id AS contract_id,
  c.name AS contract_name,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  'deposit' AS payment_type,
  jsonb_build_object('type', 'deposit') AS payment_metadata,
  COALESCE(
    NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
    NULLIF(TRIM(COALESCE(step1.payload->>'first_name', '') || ' ' || COALESCE(step1.payload->>'last_name', '')), ''),
    'Unknown student'
  ) AS student_name,
  s.studio_number,
  sg.name AS studio_grade
FROM public.student_applications sa
LEFT JOIN public.contracts c ON sa.contract_id = c.id
LEFT JOIN public.payment_plans pp ON c.payment_plan_id = pp.id
LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.studios s ON s.id = sa.assigned_studio_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
LEFT JOIN LATERAL (
  SELECT sas.payload
  FROM public.student_application_steps sas
  WHERE sas.application_id = sa.id
    AND sas.step_number = 1
  ORDER BY sas.updated_at DESC NULLS LAST, sas.created_at DESC NULLS LAST
  LIMIT 1
) step1 ON TRUE
WHERE sa.deposit_payment_intent_id IS NOT NULL
  AND sa.deposit_payment_intent_id NOT LIKE 'manual-%'
  AND NOT EXISTS (
    SELECT 1 FROM public.stripe_payments sp2
    WHERE sp2.stripe_payment_intent_id = sa.deposit_payment_intent_id
      AND sp2.payment_type = 'deposit'
  )

UNION ALL

-- Manual payment entries
SELECT
  'manual' AS payment_source,
  mp.id AS payment_id,
  mp.application_id AS student_application_id,
  NULL::UUID AS payment_plan_id,
  mp.amount AS amount_paid,
  'GBP' AS currency,
  'completed' AS payment_status,
  NULL::TEXT AS stripe_payment_intent_id,
  mp.payment_date::TIMESTAMPTZ AS payment_date,
  mp.updated_at,
  mp.id AS manual_entry_id,
  mp.notes AS manual_entry_notes,
  mp.recorded_by AS entered_by_user_id,
  sa.student_id,
  cps.sequence AS installment_number,
  cps.due_date,
  c.id AS contract_id,
  c.name AS contract_name,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  CASE WHEN mp.payment_type = 'deposit' THEN 'deposit' ELSE 'instalment' END AS payment_type,
  jsonb_build_object('type', mp.payment_type, 'notes', mp.notes) AS payment_metadata,
  COALESCE(
    NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
    NULLIF(TRIM(COALESCE(step1.payload->>'first_name', '') || ' ' || COALESCE(step1.payload->>'last_name', '')), ''),
    'Unknown student'
  ) AS student_name,
  s.studio_number,
  sg.name AS studio_grade
FROM public.manual_payments mp
INNER JOIN public.student_applications sa ON mp.application_id = sa.id
LEFT JOIN public.contract_payment_schedule cps ON mp.instalment_id = cps.id
LEFT JOIN public.contracts c ON sa.contract_id = c.id
LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.studios s ON s.id = sa.assigned_studio_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
LEFT JOIN LATERAL (
  SELECT sas.payload
  FROM public.student_application_steps sas
  WHERE sas.application_id = sa.id
    AND sas.step_number = 1
  ORDER BY sas.updated_at DESC NULLS LAST, sas.created_at DESC NULLS LAST
  LIMIT 1
) step1 ON TRUE;

COMMENT ON VIEW public.unified_payment_history IS 'Unified payment history (Stripe + manual) with robust student_name fallback from profile or step 1 payload for reliable search/reporting.';
