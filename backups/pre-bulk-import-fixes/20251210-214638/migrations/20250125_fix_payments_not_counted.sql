-- Fix: Payments not being counted because they're not identified as installments
-- This ensures payments are correctly identified and counted

-- Step 1: First, let's see what the actual issue is
-- Check if payments have the right metadata
DO $$
DECLARE
  v_payment_count INTEGER;
  v_payments_with_type INTEGER;
  v_payments_without_type INTEGER;
BEGIN
  -- Count payments for this application
  SELECT COUNT(*) INTO v_payment_count
  FROM public.stripe_payments
  WHERE student_application_id = 'b8326825-6f22-4dcf-ac78-e5d6994bde7b'
    AND payment_type = 'instalment'
    AND status IN ('succeeded', 'completed');
  
  -- Count payments with type in metadata
  SELECT COUNT(*) INTO v_payments_with_type
  FROM public.stripe_payments
  WHERE student_application_id = 'b8326825-6f22-4dcf-ac78-e5d6994bde7b'
    AND payment_type = 'instalment'
    AND status IN ('succeeded', 'completed')
    AND metadata->>'type' = 'instalment';
  
  -- Count payments without type in metadata
  SELECT COUNT(*) INTO v_payments_without_type
  FROM public.stripe_payments
  WHERE student_application_id = 'b8326825-6f22-4dcf-ac78-e5d6994bde7b'
    AND payment_type = 'instalment'
    AND status IN ('succeeded', 'completed')
    AND (metadata->>'type' IS NULL OR metadata->>'type' != 'instalment');
  
  RAISE NOTICE 'Total instalment payments: %', v_payment_count;
  RAISE NOTICE 'Payments with type in metadata: %', v_payments_with_type;
  RAISE NOTICE 'Payments WITHOUT type in metadata: %', v_payments_without_type;
END $$;

-- Step 2: Force update ALL instalment payments to have type in metadata
UPDATE public.stripe_payments
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('type', 'instalment')
WHERE payment_type = 'instalment'
  AND (metadata->>'type' IS NULL OR metadata->>'type' != 'instalment')
  AND status IN ('succeeded', 'completed');

-- Step 3: Recreate the view to ensure it picks up the updated metadata
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
  sa.student_id,
  CASE 
    WHEN sp.metadata->>'instalment_id' IS NOT NULL THEN
      COALESCE(
        (SELECT cps.sequence 
         FROM public.contract_payment_schedule cps 
         WHERE cps.id::text = sp.metadata->>'instalment_id'
         LIMIT 1),
        (SELECT ppi.sequence 
         FROM public.payment_plan_installments ppi 
         WHERE ppi.id::text = sp.metadata->>'instalment_id'
         LIMIT 1)
      )
    ELSE NULL
  END AS installment_number,
  CASE 
    WHEN sp.metadata->>'instalment_id' IS NOT NULL THEN
      COALESCE(
        (SELECT cps.due_date 
         FROM public.contract_payment_schedule cps 
         WHERE cps.id::text = sp.metadata->>'instalment_id'
         LIMIT 1),
        (SELECT 
           CASE 
             WHEN ppi.due_date IS NOT NULL THEN ppi.due_date
             WHEN ppi.due_date_offset_days IS NOT NULL THEN 
               (c.contract_start + COALESCE(ppi.due_date_offset_days, 0) * INTERVAL '1 day')::date
             ELSE NULL
           END
         FROM public.payment_plan_installments ppi
         INNER JOIN public.student_applications sa2 ON sa2.selected_payment_plan_id = ppi.payment_plan_id
         INNER JOIN public.contracts c ON sa2.contract_id = c.id
         WHERE ppi.id::text = sp.metadata->>'instalment_id'
           AND sa2.id = sp.student_application_id
         LIMIT 1)
      )
    ELSE NULL
  END AS due_date,
  c.id AS contract_id,
  c.name AS contract_name,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  -- CRITICAL: Always include type from payment_type, and merge with existing metadata
  -- This ensures type is ALWAYS available
  COALESCE(sp.metadata, '{}'::jsonb) || jsonb_build_object('type', sp.payment_type) AS payment_metadata
FROM public.stripe_payments sp
INNER JOIN public.student_applications sa ON sp.student_application_id = sa.id
LEFT JOIN public.contracts c ON sa.contract_id = c.id
LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id
WHERE sp.status IN ('succeeded', 'completed')

UNION ALL

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
  ay.name AS academic_year_name,
  jsonb_build_object('type', 'deposit') AS payment_metadata
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
  ay.name AS academic_year_name,
  jsonb_build_object('type', COALESCE(mp.payment_type, 'manual'), 'notes', mp.notes) AS payment_metadata
FROM public.manual_payments mp
INNER JOIN public.student_applications sa ON mp.application_id = sa.id
LEFT JOIN public.contract_payment_schedule cps ON mp.instalment_id = cps.id
LEFT JOIN public.contracts c ON sa.contract_id = c.id
LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id;

GRANT SELECT ON public.unified_payment_history TO authenticated;

-- Step 4: Update get_payment_summary to be more aggressive in finding payments
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

  -- CRITICAL FIX: Get total paid - check BOTH unified_payment_history AND stripe_payments directly
  -- This ensures we catch payments even if the view has issues
  BEGIN
    -- First try unified_payment_history
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
    
    -- If that returns 0, try direct stripe_payments query as fallback
    IF COALESCE(v_total_paid, 0) = 0 THEN
      SELECT 
        COALESCE(SUM(amount), 0),
        COUNT(*),
        MAX(created_at)
      INTO v_total_paid, v_payment_count, v_last_payment_date
      FROM public.stripe_payments
      WHERE student_application_id = p_application_id
        AND payment_type = 'instalment'
        AND status IN ('succeeded', 'completed');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_total_paid := 0;
    v_payment_count := 0;
    v_last_payment_date := NULL;
  END;

  RETURN QUERY SELECT 
    v_total_due_after_cashback,
    COALESCE(v_total_paid, 0),
    GREATEST(v_total_due_after_cashback - COALESCE(v_total_paid, 0), 0) AS remaining_balance,
    COALESCE(v_payment_count, 0),
    v_last_payment_date,
    CASE 
      WHEN COALESCE(v_total_paid, 0) >= (v_total_due_after_cashback - 0.01) AND v_total_due_after_cashback > 0.01
        THEN 'fully_paid'
      WHEN v_total_due_after_cashback <= 0.01
        THEN 'fully_paid'
      WHEN COALESCE(v_total_paid, 0) > 0 THEN 'partially_paid'
      ELSE 'unpaid'
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_summary(UUID) TO authenticated, anon;

