-- Fix get_payment_summary function with better error handling
-- This version handles all edge cases and returns safe defaults instead of errors

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
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_due NUMERIC := 0;
  v_cashback NUMERIC := 0;
  v_total_due_after_cashback NUMERIC := 0;
  v_total_paid NUMERIC := 0;
  v_payment_count INTEGER := 0;
  v_last_payment_date TIMESTAMPTZ;
  v_contract_weekly_price NUMERIC;
  v_contract_weeks INTEGER;
  v_payment_plan_id UUID;
  v_total_contract_value NUMERIC;
BEGIN
  -- Validate input
  IF p_application_id IS NULL THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::INTEGER, NULL::TIMESTAMPTZ, 'unpaid'::TEXT;
    RETURN;
  END IF;

  -- Validate application exists
  IF NOT EXISTS (SELECT 1 FROM public.student_applications WHERE id = p_application_id) THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::INTEGER, NULL::TIMESTAMPTZ, 'unpaid'::TEXT;
    RETURN;
  END IF;

  BEGIN
    -- First, try to get total due from contract payment schedule
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_due
    FROM public.contract_payment_schedule cps
    INNER JOIN public.student_applications sa ON sa.contract_id = cps.contract_id
    WHERE sa.id = p_application_id;
  EXCEPTION WHEN OTHERS THEN
    v_total_due := 0;
  END;

  -- If no payment schedule exists, calculate from payment plan installments
  IF COALESCE(v_total_due, 0) = 0 THEN
    BEGIN
      -- Get application details with payment plan
      SELECT 
        sa.selected_payment_plan_id,
        COALESCE(c.weekly_price_override, sgp.weekly_price, 0),
        COALESCE(c.weeks, 0)
      INTO 
        v_payment_plan_id,
        v_contract_weekly_price,
        v_contract_weeks
      FROM public.student_applications sa
      INNER JOIN public.contracts c ON sa.contract_id = c.id
      LEFT JOIN public.studio_grade_prices sgp 
        ON sgp.academic_year_id = c.academic_year_id 
        AND sgp.studio_grade_id = c.studio_grade_id
        AND sgp.is_active = true
      WHERE sa.id = p_application_id;

      -- If we have a payment plan and contract details, calculate from installments
      IF v_payment_plan_id IS NOT NULL 
         AND COALESCE(v_contract_weekly_price, 0) > 0 
         AND COALESCE(v_contract_weeks, 0) > 0 THEN
        BEGIN
          v_total_contract_value := v_contract_weekly_price * v_contract_weeks;

          SELECT COALESCE(SUM(
            CASE 
              WHEN amount_type = 'percentage' THEN (v_total_contract_value * amount_value / 100)
              WHEN amount_type = 'fixed' THEN amount_value
              ELSE 0
            END
          ), 0)
          INTO v_total_due
          FROM public.payment_plan_installments
          WHERE payment_plan_id = v_payment_plan_id;
        EXCEPTION WHEN OTHERS THEN
          v_total_due := 0;
        END;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_total_due := 0;
    END;
  END IF;
  
  -- Ensure v_total_due is never NULL
  v_total_due := COALESCE(v_total_due, 0);

  BEGIN
    -- Get cashback amount
    SELECT COALESCE(cashback_amount, 0)
    INTO v_cashback
    FROM public.student_applications
    WHERE id = p_application_id;
  EXCEPTION WHEN OTHERS THEN
    v_cashback := 0;
  END;

  -- Calculate total due after cashback (minimum 0)
  v_total_due_after_cashback := GREATEST(COALESCE(v_total_due, 0) - COALESCE(v_cashback, 0), 0);

  BEGIN
    -- Get total paid from unified history
    SELECT 
      COALESCE(SUM(amount_paid), 0),
      COUNT(*),
      MAX(payment_date)
    INTO v_total_paid, v_payment_count, v_last_payment_date
    FROM public.unified_payment_history
    WHERE student_application_id = p_application_id
      AND payment_status = 'completed';
  EXCEPTION WHEN OTHERS THEN
    v_total_paid := 0;
    v_payment_count := 0;
    v_last_payment_date := NULL;
  END;

  -- Return results
  RETURN QUERY SELECT 
    v_total_due_after_cashback,
    COALESCE(v_total_paid, 0),
    GREATEST(v_total_due_after_cashback - COALESCE(v_total_paid, 0), 0),
    COALESCE(v_payment_count, 0),
    v_last_payment_date,
    CASE 
      WHEN COALESCE(v_total_paid, 0) >= v_total_due_after_cashback AND v_total_due_after_cashback > 0 THEN 'fully_paid'
      WHEN COALESCE(v_total_paid, 0) > 0 THEN 'partially_paid'
      ELSE 'unpaid'
    END;
END;
$$;

-- Update comment
COMMENT ON FUNCTION public.get_payment_summary(UUID) IS 'Returns payment summary for an application, accounting for cashback discounts. Handles Pay in Full plans by calculating from payment_plan_installments when contract_payment_schedule is empty. Includes comprehensive error handling.';

-- Ensure permissions
GRANT EXECUTE ON FUNCTION public.get_payment_summary(UUID) TO authenticated, anon;

