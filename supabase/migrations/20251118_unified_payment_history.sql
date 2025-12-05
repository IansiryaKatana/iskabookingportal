-- Unified Payment History System
-- Combines Stripe payments and manual payment entries
-- NOTE: Requires stripe_payments table to exist (created in 20251118_create_stripe_payments_table.sql)

-- View that unifies all payment records
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
  -- Extract installment number from metadata or contract_payment_schedule
  CASE 
    WHEN sp.metadata->>'instalment_id' IS NOT NULL THEN
      (SELECT cps.sequence 
       FROM public.contract_payment_schedule cps 
       WHERE cps.id::text = sp.metadata->>'instalment_id'
       LIMIT 1)
    ELSE NULL
  END AS installment_number,
  -- Extract due date from contract_payment_schedule if available
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
  ay.name AS academic_year_name
FROM public.stripe_payments sp
INNER JOIN public.student_applications sa ON sp.student_application_id = sa.id
LEFT JOIN public.contracts c ON sa.contract_id = c.id
LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id
WHERE sp.status IN ('succeeded', 'completed')

UNION ALL

-- Deposits from student_applications that aren't in stripe_payments yet (backward compatibility)
-- This ensures deposits are always shown even if webhook hasn't created stripe_payments record yet
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
  ay.name AS academic_year_name
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
  ay.name AS academic_year_name
FROM public.manual_payments mp
INNER JOIN public.student_applications sa ON mp.application_id = sa.id
LEFT JOIN public.contract_payment_schedule cps ON mp.instalment_id = cps.id
LEFT JOIN public.contracts c ON sa.contract_id = c.id
LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id;

-- Grant permissions
GRANT SELECT ON public.unified_payment_history TO authenticated;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_unified_payments_student_date 
ON public.stripe_payments(student_application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_manual_payments_student_date 
ON public.manual_payments(application_id, payment_date DESC);

-- Function to get payment summary for a student application
CREATE OR REPLACE FUNCTION public.get_payment_summary(p_application_id UUID)
RETURNS TABLE (
  total_due NUMERIC,
  total_paid NUMERIC,
  remaining_balance NUMERIC,
  payment_count INTEGER,
  last_payment_date TIMESTAMPTZ,
  payment_status TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total_due NUMERIC;
  v_total_paid NUMERIC;
  v_payment_count INTEGER;
  v_last_payment_date TIMESTAMPTZ;
BEGIN
  -- Get total due from contract payment schedule
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_due
  FROM public.contract_payment_schedule cps
  INNER JOIN public.student_applications sa ON sa.contract_id = cps.contract_id
  WHERE sa.id = p_application_id;

  -- Get total paid from unified history
  SELECT 
    COALESCE(SUM(amount_paid), 0),
    COUNT(*),
    MAX(payment_date)
  INTO v_total_paid, v_payment_count, v_last_payment_date
  FROM public.unified_payment_history
  WHERE student_application_id = p_application_id
    AND payment_status = 'completed';

  RETURN QUERY SELECT 
    COALESCE(v_total_due, 0),
    COALESCE(v_total_paid, 0),
    COALESCE(v_total_due, 0) - COALESCE(v_total_paid, 0),
    COALESCE(v_payment_count, 0),
    v_last_payment_date,
    CASE 
      WHEN COALESCE(v_total_paid, 0) >= COALESCE(v_total_due, 0) THEN 'fully_paid'
      WHEN COALESCE(v_total_paid, 0) > 0 THEN 'partially_paid'
      ELSE 'unpaid'
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_summary(UUID) TO authenticated;

