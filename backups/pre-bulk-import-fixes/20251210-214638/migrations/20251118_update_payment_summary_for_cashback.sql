-- Update payment summary function to account for cashback
-- This migration updates the get_payment_summary function to subtract cashback from total_due

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
  v_cashback NUMERIC;
  v_total_due_after_cashback NUMERIC;
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

  -- Get cashback amount
  SELECT COALESCE(cashback_amount, 0)
  INTO v_cashback
  FROM public.student_applications
  WHERE id = p_application_id;

  -- Calculate total due after cashback (minimum 0)
  v_total_due_after_cashback := GREATEST(COALESCE(v_total_due, 0) - COALESCE(v_cashback, 0), 0);

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
    v_total_due_after_cashback, -- Return cashback-adjusted total
    COALESCE(v_total_paid, 0),
    GREATEST(v_total_due_after_cashback - COALESCE(v_total_paid, 0), 0), -- Remaining balance
    COALESCE(v_payment_count, 0),
    v_last_payment_date,
    CASE 
      WHEN COALESCE(v_total_paid, 0) >= v_total_due_after_cashback THEN 'fully_paid'
      WHEN COALESCE(v_total_paid, 0) > 0 THEN 'partially_paid'
      ELSE 'unpaid'
    END;
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.get_payment_summary(UUID) IS 'Returns payment summary for an application, accounting for cashback discounts';

