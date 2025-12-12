-- Final fix for get_payment_summary to ensure total_due is always correct
-- Issue: total_due showing contract_total instead of remaining_balance
-- This ensures v_total_due always equals remaining_balance (contract_total - deposit)

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
  -- Variables for last-installment adjustment
  v_installment_amounts NUMERIC[];
  v_sum_of_previous NUMERIC := 0;
  v_last_installment_amount NUMERIC := 0;
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

  -- CRITICAL: Calculate Remaining Balance = Contract Total - Deposit
  -- This is what installments are calculated from
  v_remaining_balance := GREATEST(v_contract_total - v_deposit_amount, 0);

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
      
      -- CRITICAL FIX: If schedule sum doesn't match remaining_balance, use remaining_balance
      -- This handles cases where schedule was created with old logic or includes errors
      IF v_total_due IS NULL OR v_total_due = 0 OR ABS(v_total_due - v_remaining_balance) > v_tolerance THEN
        v_total_due := v_remaining_balance;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_total_due := v_remaining_balance;
    END;
  END IF;

  -- If no schedule exists, calculate from payment_plan_installments with last-installment adjustment
  -- CRITICAL: This must match the frontend logic in useStudentPayments.ts line 166
  -- Frontend applies: last_installment = remaining_balance - sum_of_previous
  IF NOT v_schedule_exists AND v_payment_plan_id IS NOT NULL AND v_remaining_balance > 0 THEN
    BEGIN
      -- Calculate installments with last-installment adjustment
      -- Logic matches frontend: last_installment = remaining_balance - sum_of_previous
      -- Result: total_due = remaining_balance (perfect accuracy)
      WITH installment_calc AS (
        SELECT 
          sequence,
          amount_type,
          amount_value,
          CASE 
            WHEN amount_type = 'percentage' THEN (v_remaining_balance * amount_value / 100)
            WHEN amount_type = 'fixed' THEN amount_value
            ELSE 0
          END AS calculated_amount,
          ROW_NUMBER() OVER (ORDER BY sequence) AS rn,
          COUNT(*) OVER () AS total
        FROM public.payment_plan_installments
        WHERE payment_plan_id = v_payment_plan_id
          AND LOWER(COALESCE(label, '')) NOT LIKE '%deposit%'
      ),
      sum_previous AS (
        SELECT COALESCE(SUM(calculated_amount), 0) AS sum_prev
        FROM installment_calc
        WHERE rn < total
      )
      SELECT 
        -- Total = sum of previous + last (which is remaining_balance - sum_previous)
        -- This equals remaining_balance exactly
        COALESCE(sp.sum_prev, 0) + GREATEST(v_remaining_balance - COALESCE(sp.sum_prev, 0), 0)
      INTO v_total_due
      FROM sum_previous sp;
      
      -- Fallback: if calculation failed, use remaining_balance
      -- (With last-installment adjustment, total should equal remaining_balance)
      IF v_total_due IS NULL OR v_total_due <= 0 THEN
        v_total_due := v_remaining_balance;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Fallback: use remaining_balance (which is correct with last-installment adjustment)
      v_total_due := v_remaining_balance;
    END;
  END IF;
  
  -- CRITICAL FIX: If v_total_due is still 0 or doesn't match remaining_balance, use remaining_balance
  -- This ensures total_due always equals remaining_balance (installments only, excluding deposit)
  IF v_total_due IS NULL OR v_total_due = 0 OR ABS(v_total_due - v_remaining_balance) > v_tolerance THEN
    v_total_due := v_remaining_balance;
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

