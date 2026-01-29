-- Fix get_payment_summary so remaining_balance updates after manual payment approval
-- Issue: total_paid was taken from stripe_payments first; only when that was 0 did we
-- use unified_payment_history. So when a student had any Stripe instalment, manual
-- payments were never counted and remaining_balance stayed wrong.
-- Fix: Sum total_paid from both stripe_payments (payment_type = 'instalment') and
-- manual_payments (payment_type = 'instalment'). Using tables only avoids depending
-- on unified_payment_history view columns (e.g. payment_metadata) which may not exist.

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
  v_tolerance NUMERIC := 1.00; -- £1.00 tolerance for rounding
  v_schedule_exists BOOLEAN := false;
  v_stripe_paid NUMERIC := 0;
  v_stripe_count INTEGER := 0;
  v_stripe_last TIMESTAMPTZ;
  v_manual_paid NUMERIC := 0;
  v_manual_count INTEGER := 0;
  v_manual_last TIMESTAMPTZ;
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
  v_remaining_balance := GREATEST(v_contract_total - v_deposit_amount, 0);

  -- Check if contract_payment_schedule exists
  SELECT EXISTS (
    SELECT 1 FROM public.contract_payment_schedule WHERE contract_id = v_contract_id
  ) INTO v_schedule_exists;

  -- If contract_payment_schedule exists, use it (EXCLUDING deposits with multiple checks)
  IF v_schedule_exists THEN
    BEGIN
      SELECT COALESCE(SUM(amount), 0)
      INTO v_total_due
      FROM public.contract_payment_schedule
      WHERE contract_id = v_contract_id
        AND LOWER(COALESCE(label, '')) NOT LIKE '%deposit%'
        AND (sequence > 1 OR amount != v_deposit_amount);
      
      IF v_total_due IS NULL OR v_total_due = 0 THEN
        v_total_due := v_remaining_balance;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_total_due := v_remaining_balance;
    END;
  END IF;

  -- If no schedule exists, calculate from payment_plan_installments with last-installment adjustment
  IF NOT v_schedule_exists AND v_payment_plan_id IS NOT NULL AND v_remaining_balance > 0 THEN
    BEGIN
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
        COALESCE(sp.sum_prev, 0) + GREATEST(v_remaining_balance - COALESCE(sp.sum_prev, 0), 0)
      INTO v_total_due
      FROM sum_previous sp;
      
      IF v_total_due IS NULL OR v_total_due <= 0 THEN
        v_total_due := v_remaining_balance;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_total_due := v_remaining_balance;
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

  v_total_due_after_cashback := GREATEST(v_total_due - COALESCE(v_cashback, 0), 0);

  -- Get total paid: Stripe instalments (from stripe_payments) + manual instalments (from manual_payments).
  -- Using tables only, not the view, so we never depend on unified_payment_history column structure.
  BEGIN
    -- Stripe instalment payments (source of truth; payment_type is on the table)
    SELECT 
      COALESCE(SUM(amount), 0),
      COUNT(*),
      MAX(created_at)
    INTO v_stripe_paid, v_stripe_count, v_stripe_last
    FROM public.stripe_payments
    WHERE student_application_id = p_application_id
      AND payment_type = 'instalment'
      AND status IN ('succeeded', 'completed');

    -- Manual instalment payments (e.g. after admin approves a manual payment request)
    SELECT 
      COALESCE(SUM(amount), 0),
      COUNT(*),
      MAX(payment_date::TIMESTAMPTZ)
    INTO v_manual_paid, v_manual_count, v_manual_last
    FROM public.manual_payments
    WHERE application_id = p_application_id
      AND payment_type = 'instalment';
  EXCEPTION WHEN OTHERS THEN
    v_stripe_paid := 0;
    v_stripe_count := 0;
    v_stripe_last := NULL;
    v_manual_paid := 0;
    v_manual_count := 0;
    v_manual_last := NULL;
  END;

  v_total_paid := COALESCE(v_stripe_paid, 0) + COALESCE(v_manual_paid, 0);
  v_payment_count := COALESCE(v_stripe_count, 0) + COALESCE(v_manual_count, 0);
  v_last_payment_date := COALESCE(GREATEST(v_stripe_last, v_manual_last), v_stripe_last, v_manual_last);

  -- Calculate remaining balance
  v_remaining_balance := GREATEST(v_total_due_after_cashback - v_total_paid, 0);
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
      WHEN v_remaining_balance <= v_tolerance AND v_total_paid > 0 THEN 'fully_paid'
      WHEN v_total_due_after_cashback <= 0.01 THEN 'fully_paid'
      WHEN v_total_paid > 0 THEN 'partially_paid'
      ELSE 'unpaid'
    END AS payment_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_summary(UUID) TO authenticated, anon;
