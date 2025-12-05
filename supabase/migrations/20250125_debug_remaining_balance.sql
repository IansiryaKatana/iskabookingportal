-- Debug and fix remaining balance calculation
-- This migration adds diagnostic functions and fixes the calculation

-- First, create a diagnostic function to see what's happening
CREATE OR REPLACE FUNCTION public.debug_payment_summary(p_application_id UUID)
RETURNS TABLE (
  debug_info JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_due NUMERIC := 0;
  v_total_paid NUMERIC := 0;
  v_payment_count INTEGER := 0;
  v_debug JSONB;
  v_payments JSONB;
BEGIN
  -- Get total due
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_due
  FROM public.contract_payment_schedule cps
  INNER JOIN public.student_applications sa ON sa.contract_id = cps.contract_id
  WHERE sa.id = p_application_id;

  -- Get all payments from unified history
  SELECT 
    jsonb_agg(
      jsonb_build_object(
        'payment_id', payment_id,
        'amount_paid', amount_paid,
        'payment_status', payment_status,
        'payment_source', payment_source,
        'installment_number', installment_number,
        'payment_metadata', payment_metadata,
        'payment_metadata_type', payment_metadata->>'type',
        'is_instalment', (
          payment_metadata->>'type' = 'instalment' 
          OR installment_number IS NOT NULL
        ),
        'is_deposit', payment_metadata->>'type' = 'deposit'
      )
    ),
    COALESCE(SUM(amount_paid), 0),
    COUNT(*)
  INTO v_payments, v_total_paid, v_payment_count
  FROM public.unified_payment_history
  WHERE student_application_id = p_application_id
    AND payment_status IN ('succeeded', 'completed');

  -- Get installment payments only
  SELECT COALESCE(SUM(amount_paid), 0)
  INTO v_total_paid
  FROM public.unified_payment_history
  WHERE student_application_id = p_application_id
    AND payment_status IN ('succeeded', 'completed')
    AND (
      payment_metadata->>'type' = 'instalment'
      OR installment_number IS NOT NULL
    )
    AND COALESCE(payment_metadata->>'type', '') != 'deposit';

  v_debug := jsonb_build_object(
    'application_id', p_application_id,
    'total_due', v_total_due,
    'total_paid_installments', v_total_paid,
    'payment_count', v_payment_count,
    'remaining_balance', GREATEST(v_total_due - v_total_paid, 0),
    'all_payments', v_payments
  );

  RETURN QUERY SELECT v_debug;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_payment_summary(UUID) TO authenticated, anon;

-- Now fix the get_payment_summary function with better logic
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
  -- Validate application exists
  IF NOT EXISTS (SELECT 1 FROM public.student_applications WHERE id = p_application_id) THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::INTEGER, NULL::TIMESTAMPTZ, 'unpaid'::TEXT;
    RETURN;
  END IF;

  -- First, try to get total due from contract payment schedule (installments only, not deposits)
  BEGIN
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
  
  v_total_due := COALESCE(v_total_due, 0);

  -- Get cashback amount
  BEGIN
    SELECT COALESCE(cashback_amount, 0)
    INTO v_cashback
    FROM public.student_applications
    WHERE id = p_application_id;
  EXCEPTION WHEN OTHERS THEN
    v_cashback := 0;
  END;

  v_total_due_after_cashback := GREATEST(COALESCE(v_total_due, 0) - COALESCE(v_cashback, 0), 0);

  -- Get total paid from unified history
  -- FIXED: More robust logic to identify installment payments
  BEGIN
    SELECT 
      COALESCE(SUM(amount_paid), 0),
      COUNT(*),
      MAX(payment_date)
    INTO v_total_paid, v_payment_count, v_last_payment_date
    FROM public.unified_payment_history
    WHERE student_application_id = p_application_id
      AND payment_status IN ('succeeded', 'completed')
      -- Include payments that are installments:
      -- 1. Type is 'instalment' in metadata
      -- 2. OR has installment_number (linked to payment schedule)
      -- 3. OR is from stripe_payments with payment_type = 'instalment' (check via payment_source and metadata)
      AND (
        -- Explicitly marked as instalment
        (payment_metadata->>'type' = 'instalment')
        -- OR has installment_number (means it's linked to a schedule item)
        OR (installment_number IS NOT NULL)
        -- OR payment_source is stripe and we can infer from metadata
        OR (
          payment_source = 'stripe' 
          AND payment_metadata->>'type' IS NULL 
          AND installment_number IS NOT NULL
        )
      )
      -- Exclude deposits explicitly
      AND COALESCE(payment_metadata->>'type', '') != 'deposit';
  EXCEPTION WHEN OTHERS THEN
    v_total_paid := 0;
    v_payment_count := 0;
    v_last_payment_date := NULL;
  END;

  -- Calculate remaining balance
  -- Ensure it's never negative and correctly shows 0 when fully paid
  RETURN QUERY SELECT 
    v_total_due_after_cashback,
    COALESCE(v_total_paid, 0),
    GREATEST(v_total_due_after_cashback - COALESCE(v_total_paid, 0), 0) AS remaining_balance,
    COALESCE(v_payment_count, 0),
    v_last_payment_date,
    CASE 
      -- Fully paid if total paid >= total due after cashback (with small tolerance for rounding)
      WHEN COALESCE(v_total_paid, 0) >= (v_total_due_after_cashback - 0.01) AND v_total_due_after_cashback > 0 
        THEN 'fully_paid'
      -- Also fully paid if total paid >= original total due when cashback equals total due
      WHEN COALESCE(v_total_paid, 0) >= (v_total_due - 0.01) AND v_total_due > 0 AND v_total_due_after_cashback = 0
        THEN 'fully_paid'
      -- Fully paid if no installments required
      WHEN v_total_due_after_cashback = 0
        THEN 'fully_paid'
      WHEN COALESCE(v_total_paid, 0) > 0 THEN 'partially_paid'
      ELSE 'unpaid'
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_summary(UUID) TO authenticated, anon;

