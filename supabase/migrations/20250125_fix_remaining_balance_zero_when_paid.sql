-- Fix remaining balance to show 0 when all installments are paid
-- Accounts for small rounding differences and ensures balance is 0 when fully paid

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
  v_contract_id UUID;
  v_remaining_balance NUMERIC := 0;
  v_tolerance NUMERIC := 1.00; -- Allow £1 tolerance for rounding differences
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.student_applications WHERE id = p_application_id) THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::INTEGER, NULL::TIMESTAMPTZ, 'unpaid'::TEXT;
    RETURN;
  END IF;

  -- Get contract_id
  SELECT contract_id INTO v_contract_id
  FROM public.student_applications
  WHERE id = p_application_id;

  -- Get total due from contract payment schedule
  BEGIN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_due
    FROM public.contract_payment_schedule
    WHERE contract_id = v_contract_id;
  EXCEPTION WHEN OTHERS THEN
    v_total_due := 0;
  END;

  -- If no payment schedule, calculate from payment plan installments
  IF COALESCE(v_total_due, 0) = 0 OR v_total_due IS NULL THEN
    BEGIN
      SELECT 
        sa.selected_payment_plan_id,
        COALESCE(c.weekly_price_override, sgp.weekly_price, 0),
        COALESCE(c.weeks, 0),
        c.id
      INTO 
        v_payment_plan_id,
        v_contract_weekly_price,
        v_contract_weeks,
        v_contract_id
      FROM public.student_applications sa
      INNER JOIN public.contracts c ON sa.contract_id = c.id
      LEFT JOIN public.studio_grade_prices sgp 
        ON sgp.academic_year_id = c.academic_year_id 
        AND sgp.studio_grade_id = c.studio_grade_id
        AND sgp.is_active = true
      WHERE sa.id = p_application_id;

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
      ELSIF COALESCE(v_contract_weekly_price, 0) > 0 
           AND COALESCE(v_contract_weeks, 0) > 0 THEN
        BEGIN
          v_total_due := v_contract_weekly_price * v_contract_weeks;
        EXCEPTION WHEN OTHERS THEN
          v_total_due := 0;
        END;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_total_due := 0;
    END;
  END IF;
  
  v_total_due := COALESCE(v_total_due, 0);

  -- Get cashback
  BEGIN
    SELECT COALESCE(cashback_amount, 0)
    INTO v_cashback
    FROM public.student_applications
    WHERE id = p_application_id;
  EXCEPTION WHEN OTHERS THEN
    v_cashback := 0;
  END;

  v_total_due_after_cashback := GREATEST(COALESCE(v_total_due, 0) - COALESCE(v_cashback, 0), 0);

  -- Get total paid from installment payments
  BEGIN
    -- Try stripe_payments first - this is the source of truth
    SELECT 
      COALESCE(SUM(amount), 0),
      COUNT(*),
      MAX(created_at)
    INTO v_total_paid, v_payment_count, v_last_payment_date
    FROM public.stripe_payments
    WHERE student_application_id = p_application_id
      AND payment_type = 'instalment'
      AND status IN ('succeeded', 'completed');
    
    -- If stripe_payments returns 0 or NULL, try unified_payment_history as fallback
    IF COALESCE(v_total_paid, 0) = 0 OR v_total_paid IS NULL THEN
      SELECT 
        COALESCE(SUM(amount_paid), 0),
        COUNT(*),
        MAX(payment_date)
      INTO v_total_paid, v_payment_count, v_last_payment_date
      FROM public.unified_payment_history
      WHERE student_application_id = p_application_id
        AND payment_status IN ('succeeded', 'completed')
        AND (
          payment_metadata->>'type' = 'instalment'
          OR installment_number IS NOT NULL
        )
        AND COALESCE(payment_metadata->>'type', '') != 'deposit';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_total_paid := 0;
    v_payment_count := 0;
    v_last_payment_date := NULL;
  END;

  -- Ensure v_total_paid is never NULL
  v_total_paid := COALESCE(v_total_paid, 0);

  -- Calculate remaining balance
  -- CRITICAL FIX: If total_paid >= total_due (within tolerance), set remaining to 0
  -- This handles rounding differences and ensures balance is 0 when fully paid
  v_remaining_balance := GREATEST(v_total_due_after_cashback - v_total_paid, 0);
  
  -- If the difference is within tolerance (likely due to rounding), set to 0
  IF v_remaining_balance <= v_tolerance AND v_total_paid > 0 AND v_total_due_after_cashback > 0 THEN
    -- Check if we're very close to fully paid (within £1)
    IF ABS(v_total_due_after_cashback - v_total_paid) <= v_tolerance THEN
      v_remaining_balance := 0;
    END IF;
  END IF;

  RETURN QUERY SELECT 
    v_total_due_after_cashback,
    v_total_paid,
    v_remaining_balance AS remaining_balance,
    COALESCE(v_payment_count, 0),
    v_last_payment_date,
    CASE 
      -- Fully paid if remaining balance is 0 or within tolerance
      WHEN v_remaining_balance <= v_tolerance AND v_total_paid > 0
        THEN 'fully_paid'
      WHEN v_total_due_after_cashback <= 0.01
        THEN 'fully_paid'
      WHEN v_total_paid > 0 THEN 'partially_paid'
      ELSE 'unpaid'
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_summary(UUID) TO authenticated, anon;


