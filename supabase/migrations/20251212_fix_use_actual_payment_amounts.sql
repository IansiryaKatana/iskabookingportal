-- Fix get_payment_summary to use ACTUAL payment amounts when available
-- When contract_payment_schedule doesn't exist, use the sum of actual installment payments
-- This ensures total_due matches what was actually created/paid, not recalculated percentages
--
-- Issue: Function calculates from payment_plan_installments = £9,125.0874
-- But actual installments paid = £9,027.01 (with last-installment adjustment)
-- This causes remaining_balance = £98.0774 instead of £0.00
--
-- Fix: When no schedule exists, use sum of actual stripe_payments (installments only)

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
  v_contract_total NUMERIC := 0;
  v_deposit_amount NUMERIC := 0;
  v_total_due NUMERIC := 0; -- This is for INSTALLMENTS ONLY (Contract Total - Deposit)
  v_cashback NUMERIC := 0;
  v_total_due_after_cashback NUMERIC := 0;
  v_total_paid NUMERIC := 0;
  v_payment_count INTEGER := 0;
  v_last_payment_date TIMESTAMPTZ;
  v_contract_weekly_price NUMERIC;
  v_contract_weeks INTEGER;
  v_payment_plan_id UUID;
  v_contract_id UUID;
  v_remaining_balance NUMERIC;
  v_tolerance NUMERIC := 1.00; -- £1.00 tolerance for rounding (increased from £0.01)
  v_schedule_exists BOOLEAN := false;
  v_actual_installment_total NUMERIC := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.student_applications WHERE id = p_application_id) THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::INTEGER, NULL::TIMESTAMPTZ, 'unpaid'::TEXT;
    RETURN;
  END IF;

  -- Get contract_id and payment plan
  SELECT 
    sa.contract_id,
    sa.selected_payment_plan_id
  INTO 
    v_contract_id,
    v_payment_plan_id
  FROM public.student_applications sa
  WHERE sa.id = p_application_id;

  -- Calculate Contract Total = weekly_price × weeks
  BEGIN
    SELECT 
      COALESCE(c.weekly_price_override, sgp.weekly_price, 0),
      COALESCE(c.weeks, 0)
    INTO 
      v_contract_weekly_price,
      v_contract_weeks
    FROM public.student_applications sa
    INNER JOIN public.contracts c ON sa.contract_id = c.id
    LEFT JOIN public.studio_grade_prices sgp 
      ON sgp.academic_year_id = c.academic_year_id 
      AND sgp.studio_grade_id = c.studio_grade_id
      AND sgp.is_active = true
    WHERE sa.id = p_application_id;
  EXCEPTION WHEN OTHERS THEN
    v_contract_weekly_price := 0;
    v_contract_weeks := 0;
  END;

  v_contract_total := COALESCE(v_contract_weekly_price, 0) * COALESCE(v_contract_weeks, 0);

  -- Get Deposit amount
  BEGIN
    SELECT COALESCE(
      c.deposit_override,
      pp.deposit_amount,
      sgp.deposit_amount_override,
      0
    )
    INTO v_deposit_amount
    FROM public.student_applications sa
    INNER JOIN public.contracts c ON sa.contract_id = c.id
    LEFT JOIN public.payment_plans pp ON pp.id = v_payment_plan_id
    LEFT JOIN public.studio_grade_prices sgp 
      ON sgp.academic_year_id = c.academic_year_id 
      AND sgp.studio_grade_id = c.studio_grade_id
      AND sgp.is_active = true
    WHERE sa.id = p_application_id;
  EXCEPTION WHEN OTHERS THEN
    v_deposit_amount := 0;
  END;

  v_deposit_amount := COALESCE(v_deposit_amount, 0);

  -- CRITICAL: Calculate Total Due for INSTALLMENTS = Contract Total - Deposit
  -- This is the remaining balance that needs to be paid in installments
  v_total_due := GREATEST(v_contract_total - v_deposit_amount, 0);

  -- Check if contract_payment_schedule exists
  SELECT EXISTS (
    SELECT 1 FROM public.contract_payment_schedule WHERE contract_id = v_contract_id
  ) INTO v_schedule_exists;

  -- If contract_payment_schedule exists, use it (excluding deposits)
  IF v_schedule_exists THEN
    BEGIN
      SELECT COALESCE(SUM(amount), 0)
      INTO v_total_due
      FROM public.contract_payment_schedule
      WHERE contract_id = v_contract_id
        AND LOWER(COALESCE(label, '')) NOT LIKE '%deposit%';
      
      -- If schedule exists but sum is 0 (all rows were deposits), use calculated value
      IF v_total_due IS NULL OR v_total_due = 0 THEN
        v_total_due := GREATEST(v_contract_total - v_deposit_amount, 0);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_total_due := GREATEST(v_contract_total - v_deposit_amount, 0);
    END;
  END IF;

  -- CRITICAL FIX: If no schedule exists, try to use ACTUAL payment amounts first
  -- This ensures total_due matches what was actually created/paid (with last-installment adjustment)
  IF NOT v_schedule_exists THEN
    BEGIN
      -- Get sum of actual installment payments that were created
      -- This includes any last-installment adjustments made by the frontend
      SELECT COALESCE(SUM(amount), 0)
      INTO v_actual_installment_total
      FROM public.stripe_payments
      WHERE student_application_id = p_application_id
        AND payment_type = 'instalment'
        AND status IN ('succeeded', 'completed', 'pending', 'processing');
      
      -- If we have actual payments, use their sum as total_due
      -- This ensures total_due matches the actual installments that were created
      IF v_actual_installment_total > 0 THEN
        v_total_due := v_actual_installment_total;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- If error, continue to fallback calculation
      NULL;
    END;
  END IF;

  -- Fallback: If still no total_due, calculate from payment_plan_installments
  -- This is only used if no schedule exists AND no payments have been made yet
  IF COALESCE(v_total_due, 0) = 0 AND v_payment_plan_id IS NOT NULL THEN
    BEGIN
      -- Calculate remaining balance first
      v_remaining_balance := GREATEST(v_contract_total - v_deposit_amount, 0);
      SELECT COALESCE(SUM(
        CASE 
          WHEN amount_type = 'percentage' THEN (v_remaining_balance * amount_value / 100)
          WHEN amount_type = 'fixed' THEN amount_value
          ELSE 0
        END
      ), 0)
      INTO v_total_due
      FROM public.payment_plan_installments
      WHERE payment_plan_id = v_payment_plan_id
        -- CRITICAL: Exclude deposit installment (label "Deposit")
        AND LOWER(COALESCE(label, '')) NOT LIKE '%deposit%';
    EXCEPTION WHEN OTHERS THEN
      v_total_due := GREATEST(v_contract_total - v_deposit_amount, 0);
    END;
  END IF;
  
  -- Ensure v_total_due is never NULL and represents installments only
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

  -- Apply cashback to installment total (not contract total)
  v_total_due_after_cashback := GREATEST(v_total_due - COALESCE(v_cashback, 0), 0);

  -- Get total paid from installment payments only
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
  -- If total_paid >= total_due_after_cashback (within tolerance), set to 0
  v_remaining_balance := GREATEST(v_total_due_after_cashback - v_total_paid, 0);
  -- If very close to fully paid (within tolerance), set to 0
  IF ABS(v_total_due_after_cashback - v_total_paid) <= v_tolerance AND v_total_paid > 0 THEN
    v_remaining_balance := 0;
  END IF;

  RETURN QUERY SELECT 
    v_total_due_after_cashback,
    v_total_paid,
    v_remaining_balance AS remaining_balance,
    COALESCE(v_payment_count, 0),
    v_last_payment_date,
    CASE 
      WHEN v_remaining_balance <= v_tolerance AND v_total_paid > 0 THEN 'paid'
      WHEN v_total_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END AS payment_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_summary(UUID) TO authenticated, anon;

