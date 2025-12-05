-- Fix remaining balance calculation when all installments are paid
-- This ensures the unified_payment_history view correctly includes payment_metadata
-- and the get_payment_summary function correctly identifies and counts installment payments

-- First, ensure unified_payment_history view includes payment_metadata with type
CREATE OR REPLACE VIEW public.unified_payment_history AS
-- Stripe payments from stripe_payments table
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
  -- Extract installment number from metadata or contract_payment_schedule
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
  -- Extract due date from contract_payment_schedule or payment_plan_installments
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
  -- CRITICAL: Include payment_metadata with type from payment_type column
  -- Merge existing metadata with payment_type to ensure type is always available
  COALESCE(sp.metadata, '{}'::jsonb) || jsonb_build_object('type', sp.payment_type) AS payment_metadata
FROM public.stripe_payments sp
INNER JOIN public.student_applications sa ON sp.student_application_id = sa.id
LEFT JOIN public.contracts c ON sa.contract_id = c.id
LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id
WHERE sp.status IN ('succeeded', 'completed')

UNION ALL

-- Deposits from student_applications that aren't in stripe_payments yet (backward compatibility)
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

-- Manual payments
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

-- Grant permissions
GRANT SELECT ON public.unified_payment_history TO authenticated;

-- Now fix the get_payment_summary function to correctly calculate remaining balance
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
  -- CRITICAL FIX: Only count installment payments, NOT deposits
  -- Improved logic to correctly identify installment payments:
  -- 1. Payment type is 'instalment' in metadata, OR
  -- 2. Has installment_number (which means it's linked to a payment schedule), OR
  -- 3. Payment source is 'manual' and has installment_number
  -- Exclude if payment type is explicitly 'deposit'
  BEGIN
    SELECT 
      COALESCE(SUM(amount_paid), 0),
      COUNT(*),
      MAX(payment_date)
    INTO v_total_paid, v_payment_count, v_last_payment_date
    FROM public.unified_payment_history
    WHERE student_application_id = p_application_id
      AND payment_status IN ('succeeded', 'completed')
      -- Include installment payments: type is 'instalment' OR has installment_number
      -- Exclude deposits: type is NOT 'deposit'
      AND (
        -- Payment type is explicitly 'instalment'
        (payment_metadata->>'type' = 'instalment')
        -- OR has installment_number (linked to payment schedule)
        OR (installment_number IS NOT NULL)
        -- OR is manual payment with installment_number
        OR (payment_source = 'manual' AND installment_number IS NOT NULL)
      )
      -- Exclude deposits
      AND COALESCE(payment_metadata->>'type', '') != 'deposit';
  EXCEPTION WHEN OTHERS THEN
    v_total_paid := 0;
    v_payment_count := 0;
    v_last_payment_date := NULL;
  END;

  -- Calculate remaining balance (ensure it's never negative)
  -- If total_paid >= total_due_after_cashback, remaining should be 0
  RETURN QUERY SELECT 
    v_total_due_after_cashback,
    COALESCE(v_total_paid, 0),
    GREATEST(v_total_due_after_cashback - COALESCE(v_total_paid, 0), 0) AS remaining_balance,
    COALESCE(v_payment_count, 0),
    v_last_payment_date,
    CASE 
      -- Consider fully paid if total paid (installments only) >= total due after cashback
      WHEN COALESCE(v_total_paid, 0) >= v_total_due_after_cashback AND v_total_due_after_cashback > 0 
        THEN 'fully_paid'
      -- Also consider fully paid if total paid >= original total due when cashback equals total due
      WHEN COALESCE(v_total_paid, 0) >= v_total_due AND v_total_due > 0 AND v_total_due_after_cashback = 0
        THEN 'fully_paid'
      -- Consider fully paid if total_due is 0 (no installments required)
      WHEN v_total_due_after_cashback = 0
        THEN 'fully_paid'
      WHEN COALESCE(v_total_paid, 0) > 0 THEN 'partially_paid'
      ELSE 'unpaid'
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_summary(UUID) TO authenticated, anon;

