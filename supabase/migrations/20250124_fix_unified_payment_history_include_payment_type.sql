-- Fix unified_payment_history to include payment_type in metadata
-- This allows get_payment_summary to correctly identify installment vs deposit payments

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
  -- Extract installment number from metadata
  -- Try contract_payment_schedule first, then payment_plan_installments (for Pay in Full)
  CASE 
    WHEN sp.metadata->>'instalment_id' IS NOT NULL THEN
      COALESCE(
        (SELECT cps.sequence 
         FROM public.contract_payment_schedule cps 
         WHERE cps.id::text = sp.metadata->>'instalment_id'
         LIMIT 1),
        (SELECT ppi.sequence 
         FROM public.payment_plan_installments ppi 
         WHERE ppi.id::text = sp.metadata->>'instalment_id'
         LIMIT 1)
      )
    ELSE NULL
  END AS installment_number,
  -- Extract due date from contract_payment_schedule or payment_plan_installments
  CASE 
    WHEN sp.metadata->>'instalment_id' IS NOT NULL THEN
      COALESCE(
        (SELECT cps.due_date 
         FROM public.contract_payment_schedule cps 
         WHERE cps.id::text = sp.metadata->>'instalment_id'
         LIMIT 1),
        (SELECT 
           CASE 
             WHEN ppi.due_date IS NOT NULL THEN ppi.due_date
             WHEN ppi.due_date_offset_days IS NOT NULL THEN 
               (c.contract_start + COALESCE(ppi.due_date_offset_days, 0) * INTERVAL '1 day')::date
             ELSE NULL
           END
         FROM public.payment_plan_installments ppi
         INNER JOIN public.student_applications sa2 ON sa2.selected_payment_plan_id = ppi.payment_plan_id
         INNER JOIN public.contracts c ON sa2.contract_id = c.id
         WHERE ppi.id::text = sp.metadata->>'instalment_id'
           AND sa2.id = sp.student_application_id
         LIMIT 1)
      )
    ELSE NULL
  END AS due_date,
  c.id AS contract_id,
  c.name AS contract_name,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  -- Include metadata with payment_type for proper filtering
  COALESCE(sp.metadata, '{}'::jsonb) || jsonb_build_object('type', sp.payment_type) AS payment_metadata
FROM public.stripe_payments sp
INNER JOIN public.student_applications sa ON sp.student_application_id = sa.id
LEFT JOIN public.contracts c ON sa.contract_id = c.id
LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id
WHERE sp.status IN ('succeeded', 'completed')

UNION ALL

-- Deposits from student_applications that aren't in stripe_payments yet (backward compatibility)
SELECT 
  'stripe' AS payment_source,
  gen_random_uuid() AS payment_id,
  sa.id AS student_application_id,
  NULL::UUID AS payment_plan_id,
  COALESCE(
    c.deposit_override,
    pp.deposit_amount,
    0
  )::NUMERIC(10,2) AS amount_paid,
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
  jsonb_build_object('type', 'deposit') AS payment_metadata
FROM public.student_applications sa
LEFT JOIN public.contracts c ON sa.contract_id = c.id
LEFT JOIN public.payment_plans pp ON c.payment_plan_id = pp.id
LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id
WHERE sa.deposit_payment_intent_id IS NOT NULL
  AND sa.deposit_payment_intent_id NOT LIKE 'manual-%'
  AND NOT EXISTS (
    SELECT 1 FROM public.stripe_payments sp2
    WHERE sp2.stripe_payment_intent_id = sa.deposit_payment_intent_id
      AND sp2.payment_type = 'deposit'
  )

UNION ALL

-- Manual payments
SELECT 
  'manual' AS payment_source,
  mp.id AS payment_id,
  mp.application_id AS student_application_id,
  NULL::UUID AS payment_plan_id,
  mp.amount AS amount_paid,
  'GBP' AS currency,
  'completed' AS payment_status,
  NULL::TEXT AS stripe_payment_intent_id,
  mp.payment_date AS payment_date,
  mp.created_at AS updated_at,
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
  jsonb_build_object('type', 'manual', 'notes', mp.notes) AS payment_metadata
FROM public.manual_payments mp
INNER JOIN public.student_applications sa ON mp.application_id = sa.id
LEFT JOIN public.contract_payment_schedule cps ON mp.instalment_id = cps.id
LEFT JOIN public.contracts c ON sa.contract_id = c.id
LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id;

-- Grant permissions
GRANT SELECT ON public.unified_payment_history TO authenticated;

