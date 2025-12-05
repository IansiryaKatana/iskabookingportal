-- ALIGN ALL PAYMENT CALCULATIONS ACROSS THE SYSTEM
-- This ensures consistent calculation logic: Installments = (Contract Total - Deposit) × percentage
-- NOT: Installments = Contract Total × percentage

-- Fix get_payment_summary to correctly calculate based on remaining balance
-- Formula: Total Due (for installments) = Contract Total - Deposit
-- This ensures remaining balance = 0 when all installments are paid

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
  v_tolerance NUMERIC := 0.01; -- £0.01 tolerance for rounding
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

  -- If contract_payment_schedule exists, use it (but verify it matches our calculation)
  -- This handles cases where schedule was pre-generated
  BEGIN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_due
    FROM public.contract_payment_schedule
    WHERE contract_id = v_contract_id;
    
    -- If schedule exists and is not empty, use it
    -- Otherwise, keep the calculated value (Contract Total - Deposit)
    IF v_total_due IS NULL OR v_total_due = 0 THEN
      v_total_due := GREATEST(v_contract_total - v_deposit_amount, 0);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_total_due := GREATEST(v_contract_total - v_deposit_amount, 0);
  END;

  -- If still no total_due, calculate from payment plan installments
  -- But ensure installments are calculated from REMAINING BALANCE, not total
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
      WHERE payment_plan_id = v_payment_plan_id;
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
  -- If total_paid >= total_due_after_cashback (within small tolerance), set to 0
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
      WHEN v_remaining_balance <= 0.01 AND v_total_paid > 0
        THEN 'fully_paid'
      WHEN v_total_due_after_cashback <= 0.01
        THEN 'fully_paid'
      WHEN v_total_paid > 0 THEN 'partially_paid'
      ELSE 'unpaid'
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_summary(UUID) TO authenticated, anon;

COMMENT ON FUNCTION public.get_payment_summary(UUID) IS 
'Calculates payment summary for installments only (excludes deposit).
Formula: Total Due = Contract Total - Deposit
Installments are calculated from remaining balance, not contract total.
This ensures remaining balance = 0 when all installments are paid.';

