-- Unified Payment History System
-- Combines Stripe payments and manual payment entries

-- View that unifies all payment records
CREATE OR REPLACE VIEW public.unified_payment_history AS
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
  sa.user_id AS student_id,
  pp.installment_number,
  pp.due_date,
  c.id AS contract_id,
  c.name AS contract_name,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name
FROM public.stripe_payments sp
INNER JOIN public.student_applications sa ON sp.student_application_id = sa.id
LEFT JOIN public.payment_plans pp ON sp.payment_plan_id = pp.id
LEFT JOIN public.contracts c ON sa.contract_id = c.id
LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id
WHERE sp.status IN ('succeeded', 'completed')

UNION ALL

SELECT 
  'manual' AS payment_source,
  mp.id AS payment_id,
  mp.student_application_id,
  mp.payment_plan_id,
  mp.amount AS amount_paid,
  mp.currency,
  'completed' AS payment_status,
  NULL::TEXT AS stripe_payment_intent_id,
  mp.payment_date AS payment_date,
  mp.created_at AS updated_at,
  mp.id AS manual_entry_id,
  mp.notes AS manual_entry_notes,
  mp.entered_by_user_id,
  sa.user_id AS student_id,
  pp.installment_number,
  pp.due_date,
  c.id AS contract_id,
  c.name AS contract_name,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name
FROM public.manual_payments mp
INNER JOIN public.student_applications sa ON mp.student_application_id = sa.id
LEFT JOIN public.payment_plans pp ON mp.payment_plan_id = pp.id
LEFT JOIN public.contracts c ON sa.contract_id = c.id
LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id
WHERE mp.is_active = true;

-- Grant permissions
GRANT SELECT ON public.unified_payment_history TO authenticated;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_unified_payments_student_date 
ON public.stripe_payments(student_application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_manual_payments_student_date 
ON public.manual_payments(student_application_id, payment_date DESC);

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
  -- Get total due from payment plans
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_due
  FROM public.payment_plans
  WHERE student_application_id = p_application_id;

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

