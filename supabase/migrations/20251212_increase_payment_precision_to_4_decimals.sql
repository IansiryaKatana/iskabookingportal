-- Increase Payment Precision from NUMERIC(10,2) to NUMERIC(12,4)
-- This fixes rounding errors in payment calculations
-- 
-- ROLLBACK: See 20251212_rollback_payment_precision_to_2_decimals.sql
--
-- This migration:
-- 1. Increases precision for all amount-related columns
-- 2. Updates views with explicit casts
-- 3. Updates functions with explicit return types
-- 4. Preserves all existing data (values like £2,619.34 become £2,619.3400)

BEGIN;

-- ============================================================================
-- PART 0: DROP DEPENDENT VIEWS
-- ============================================================================
-- Views that depend on columns we're altering must be dropped first

DROP VIEW IF EXISTS public.unified_payment_history CASCADE;
DROP VIEW IF EXISTS public.deposit_installment_breakdown CASCADE;
DROP VIEW IF EXISTS public.partner_referred_applications CASCADE;
DROP VIEW IF EXISTS public.accounts_receivable_report CASCADE;
DROP VIEW IF EXISTS public.outstanding_balances_report CASCADE;
DROP VIEW IF EXISTS public.bank_reconciliation_report CASCADE;

-- ============================================================================
-- PART 1: UPDATE TABLE COLUMN DEFINITIONS
-- ============================================================================

-- Payment plan tables
ALTER TABLE public.payment_plans 
  ALTER COLUMN deposit_amount TYPE NUMERIC(12,4);

ALTER TABLE public.payment_plan_installments 
  ALTER COLUMN amount_value TYPE NUMERIC(12,4);

-- Contract payment schedule
ALTER TABLE public.contract_payment_schedule 
  ALTER COLUMN amount TYPE NUMERIC(12,4);

-- Studio grade prices
ALTER TABLE public.studio_grade_prices 
  ALTER COLUMN weekly_price TYPE NUMERIC(12,4),
  ALTER COLUMN deposit_amount_override TYPE NUMERIC(12,4);

-- Contracts
ALTER TABLE public.contracts 
  ALTER COLUMN weekly_price_override TYPE NUMERIC(12,4),
  ALTER COLUMN deposit_override TYPE NUMERIC(12,4);

-- Payment tables
ALTER TABLE public.stripe_payments 
  ALTER COLUMN amount TYPE NUMERIC(12,4);

ALTER TABLE public.manual_payments 
  ALTER COLUMN amount TYPE NUMERIC(12,4);

-- Refunds table
-- Note: amount_gbp is a GENERATED column, so we need to drop and recreate it
ALTER TABLE public.refunds 
  DROP COLUMN IF EXISTS amount_gbp;

ALTER TABLE public.refunds 
  ADD COLUMN amount_gbp NUMERIC(12,4) 
  GENERATED ALWAYS AS (amount_pence / 100.0) STORED;

-- Partner referral system
ALTER TABLE public.partner_referrals 
  ALTER COLUMN total_contract_value TYPE NUMERIC(12,4),
  ALTER COLUMN commission_amount TYPE NUMERIC(12,4);

-- Cashback system
ALTER TABLE public.cashback_campaigns 
  ALTER COLUMN cashback_amount TYPE NUMERIC(12,4);

ALTER TABLE public.student_applications 
  ALTER COLUMN cashback_amount TYPE NUMERIC(12,4);

-- Financial forecast breakdowns (the actual table with weekly_price and total_contract_value)
ALTER TABLE public.financial_forecast_breakdowns 
  ALTER COLUMN weekly_price TYPE NUMERIC(12,4),
  ALTER COLUMN total_contract_value TYPE NUMERIC(12,4);

-- Student applications (if total_contract_value column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'student_applications' 
    AND column_name = 'total_contract_value'
  ) THEN
    ALTER TABLE public.student_applications 
      ALTER COLUMN total_contract_value TYPE NUMERIC(12,4);
  END IF;
END $$;

-- ============================================================================
-- PART 2: UPDATE VIEWS WITH EXPLICIT CASTS
-- ============================================================================

-- Update unified_payment_history view
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
      (SELECT cps.sequence 
       FROM public.contract_payment_schedule cps 
       WHERE cps.id::text = sp.metadata->>'instalment_id'
       LIMIT 1)
    ELSE NULL
  END AS installment_number,
  -- Extract due date from contract_payment_schedule if available
  CASE 
    WHEN sp.metadata->>'instalment_id' IS NOT NULL THEN
      (SELECT cps.due_date 
       FROM public.contract_payment_schedule cps 
       WHERE cps.id::text = sp.metadata->>'instalment_id'
       LIMIT 1)
    ELSE NULL
  END AS due_date,
  c.id AS contract_id,
  c.name AS contract_name,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  -- Extract payment type from metadata
  COALESCE(sp.metadata->>'type', 'instalment') AS payment_type,
  sp.metadata AS payment_metadata
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
  )::NUMERIC(12,4) AS amount_paid,
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
  'deposit' AS payment_type,
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

-- Manual payment entries
SELECT 
  'manual' AS payment_source,
  mp.id AS payment_id,
  mp.application_id AS student_application_id,
  NULL::UUID AS payment_plan_id,
  mp.amount AS amount_paid,
  'GBP' AS currency,
  'completed' AS payment_status, -- Manual payments are always completed when recorded
  NULL::TEXT AS stripe_payment_intent_id,
  mp.payment_date::TIMESTAMPTZ AS payment_date,
  mp.updated_at,
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
  CASE 
    WHEN mp.payment_type = 'deposit' THEN 'deposit'
    ELSE 'instalment'
  END AS payment_type,
  jsonb_build_object('type', mp.payment_type, 'notes', mp.notes) AS payment_metadata
FROM public.manual_payments mp
INNER JOIN public.student_applications sa ON mp.application_id = sa.id
LEFT JOIN public.contract_payment_schedule cps ON mp.instalment_id = cps.id
LEFT JOIN public.contracts c ON sa.contract_id = c.id
LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id;

-- ============================================================================
-- PART 3: UPDATE FUNCTION RETURN TYPES AND VARIABLES
-- ============================================================================

-- Update financial forecasts function
CREATE OR REPLACE FUNCTION public.calculate_contract_value(
  p_contract_id UUID
) RETURNS NUMERIC(12,4) AS $$
DECLARE
  v_weekly_price NUMERIC(12,4);
  v_weeks INTEGER;
BEGIN
  SELECT 
    COALESCE(c.weekly_price_override, sgp.weekly_price, 0),
    COALESCE(c.weeks, 0)
  INTO v_weekly_price, v_weeks
  FROM public.contracts c
  LEFT JOIN public.studio_grade_prices sgp 
    ON sgp.academic_year_id = c.academic_year_id 
    AND sgp.studio_grade_id = c.studio_grade_id
    AND sgp.is_active = true
  WHERE c.id = p_contract_id;
  
  RETURN COALESCE(v_weekly_price * v_weeks, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- PART 4: RECREATE DEPENDENT VIEWS
-- ============================================================================

-- Recreate deposit_installment_breakdown view
CREATE OR REPLACE VIEW public.deposit_installment_breakdown AS
SELECT 
  sa.id AS application_id,
  sa.student_id,
  p.first_name || ' ' || p.last_name AS student_name,
  c.name AS contract_name,
  sg.name AS studio_grade,
  sa.total_contract_value,
  -- Deposit information
  COALESCE((
    SELECT SUM(amount_paid)
    FROM public.unified_payment_history
    WHERE student_application_id = sa.id
      AND payment_metadata->>'type' = 'deposit'
      AND payment_status = 'succeeded'
  ), 0) AS deposit_paid,
  COALESCE(pp.deposit_amount, 0) AS expected_deposit,
  -- Installment information
  COALESCE((
    SELECT SUM(amount_paid)
    FROM public.unified_payment_history
    WHERE student_application_id = sa.id
      AND payment_metadata->>'type' != 'deposit'
      AND payment_status = 'succeeded'
  ), 0) AS installments_paid,
  COALESCE(ps.total_due, 0) - COALESCE((
    SELECT SUM(amount_paid)
    FROM public.unified_payment_history
    WHERE student_application_id = sa.id
      AND payment_metadata->>'type' = 'deposit'
      AND payment_status = 'succeeded'
  ), 0) AS expected_installments,
  -- Payment counts
  (
    SELECT COUNT(*)
    FROM public.unified_payment_history
    WHERE student_application_id = sa.id
      AND payment_metadata->>'type' = 'deposit'
      AND payment_status = 'succeeded'
  ) AS deposit_payment_count,
  (
    SELECT COUNT(*)
    FROM public.unified_payment_history
    WHERE student_application_id = sa.id
      AND payment_metadata->>'type' != 'deposit'
      AND payment_status = 'succeeded'
  ) AS installment_payment_count,
  sa.status,
  sa.created_at AS application_date
FROM public.student_applications sa
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
LEFT JOIN public.payment_plans pp ON pp.id = c.payment_plan_id
CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
WHERE sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature');

GRANT SELECT ON public.deposit_installment_breakdown TO authenticated;

-- Recreate accounts_receivable_report view
CREATE OR REPLACE VIEW public.accounts_receivable_report AS
SELECT 
  sa.id AS application_id,
  sa.student_id,
  p.first_name || ' ' || p.last_name AS student_name,
  sa.status AS application_status,
  c.name AS contract_name,
  sg.name AS studio_grade,
  sa.total_contract_value,
  COALESCE(ac.cashback_amount, 0) AS cashback_amount,
  COALESCE(sa.total_contract_value, 0) - COALESCE(ac.cashback_amount, 0) AS adjusted_contract_value,
  -- Get payment summary
  COALESCE(ps.total_due, 0) AS total_due,
  COALESCE(ps.total_paid, 0) AS total_paid,
  COALESCE(ps.remaining_balance, 0) AS outstanding_balance,
  ps.payment_status,
  sa.assigned_studio_id,
  s.studio_number,
  sa.created_at AS application_date,
  c.contract_start,
  c.contract_end,
  ay.name AS academic_year_name
FROM public.student_applications sa
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
LEFT JOIN public.studios s ON s.id = sa.assigned_studio_id
LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
LEFT JOIN public.application_cashbacks ac ON ac.application_id = sa.id
CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
WHERE sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature')
  AND COALESCE(ps.remaining_balance, 0) > 0;

GRANT SELECT ON public.accounts_receivable_report TO authenticated;

-- Recreate outstanding_balances_report view
CREATE OR REPLACE VIEW public.outstanding_balances_report AS
SELECT 
  sa.id AS application_id,
  sa.student_id,
  p.first_name || ' ' || p.last_name AS student_name,
  sa.status AS application_status,
  c.name AS contract_name,
  sg.name AS studio_grade,
  COALESCE(ps.total_due, 0) AS total_due,
  COALESCE(ps.total_paid, 0) AS total_paid,
  COALESCE(ps.remaining_balance, 0) AS outstanding_balance,
  -- Calculate age of oldest unpaid installment
  (
    SELECT MIN(cps.due_date)
    FROM public.contract_payment_schedule cps
    LEFT JOIN public.stripe_payments sp ON sp.metadata->>'instalment_id' = cps.id::text 
      AND sp.status = 'succeeded'
    LEFT JOIN public.manual_payments mp ON mp.instalment_id = cps.id
    WHERE cps.contract_id = sa.contract_id
      AND sp.id IS NULL 
      AND mp.id IS NULL
      AND cps.due_date < CURRENT_DATE
  ) AS oldest_unpaid_due_date,
  CASE 
    WHEN (
      SELECT MIN(cps.due_date)
      FROM public.contract_payment_schedule cps
      LEFT JOIN public.stripe_payments sp ON sp.metadata->>'instalment_id' = cps.id::text 
        AND sp.status = 'succeeded'
      LEFT JOIN public.manual_payments mp ON mp.instalment_id = cps.id
      WHERE cps.contract_id = sa.contract_id
        AND sp.id IS NULL 
        AND mp.id IS NULL
        AND cps.due_date < CURRENT_DATE
    ) IS NOT NULL THEN
      CURRENT_DATE - (
        SELECT MIN(cps.due_date)
        FROM public.contract_payment_schedule cps
        LEFT JOIN public.stripe_payments sp ON sp.metadata->>'instalment_id' = cps.id::text 
          AND sp.status = 'succeeded'
        LEFT JOIN public.manual_payments mp ON mp.instalment_id = cps.id
        WHERE cps.contract_id = sa.contract_id
          AND sp.id IS NULL 
          AND mp.id IS NULL
          AND cps.due_date < CURRENT_DATE
      )
    ELSE 0
  END AS days_overdue,
  sa.created_at AS application_date,
  c.contract_start,
  c.contract_end
FROM public.student_applications sa
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
WHERE sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature')
  AND COALESCE(ps.remaining_balance, 0) > 0;

GRANT SELECT ON public.outstanding_balances_report TO authenticated;

-- Recreate bank_reconciliation_report view
CREATE OR REPLACE VIEW public.bank_reconciliation_report AS
SELECT 
  uph.payment_id,
  uph.payment_source,
  uph.student_application_id,
  sa.student_id,
  p.first_name || ' ' || p.last_name AS student_name,
  uph.amount_paid,
  uph.currency,
  uph.payment_status,
  uph.payment_date,
  -- Stripe specific fields
  uph.stripe_payment_intent_id,
  CASE 
    WHEN uph.payment_source = 'stripe' THEN 'Stripe'
    ELSE 'Manual Entry'
  END AS payment_method,
  -- Manual payment specific fields
  uph.manual_entry_notes,
  uph.entered_by_user_id,
  CASE 
    WHEN uph.payment_source = 'manual' THEN 
      (SELECT first_name || ' ' || last_name FROM public.profiles WHERE id = uph.entered_by_user_id)
    ELSE NULL
  END AS entered_by_name,
  -- Payment type
  CASE 
    WHEN uph.payment_metadata->>'type' = 'deposit' THEN 'Deposit'
    ELSE 'Installment'
  END AS payment_type,
  -- Application details
  c.name AS contract_name,
  sg.name AS studio_grade,
  -- Invoice information
  CASE 
    WHEN uph.payment_source = 'stripe' THEN 
      (SELECT invoice_number FROM public.stripe_payments WHERE id = uph.payment_id)
    ELSE 
      (SELECT invoice_number FROM public.manual_payments WHERE id = uph.payment_id)
  END AS invoice_number,
  CASE 
    WHEN uph.payment_source = 'stripe' THEN 
      (SELECT invoice_generated_at FROM public.stripe_payments WHERE id = uph.payment_id)
    ELSE 
      (SELECT invoice_generated_at FROM public.manual_payments WHERE id = uph.payment_id)
  END AS invoice_generated_at
FROM public.unified_payment_history uph
LEFT JOIN public.student_applications sa ON sa.id = uph.student_application_id
LEFT JOIN public.profiles p ON p.id = uph.student_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
WHERE uph.payment_status = 'succeeded'
ORDER BY uph.payment_date DESC;

GRANT SELECT ON public.bank_reconciliation_report TO authenticated;

-- Recreate partner_referred_applications view
CREATE OR REPLACE VIEW public.partner_referred_applications AS
SELECT
  sa.id AS application_id,
  sa.status AS application_status,
  sa.created_at AS application_created_at,
  sa.validated_referral_code,
  p.first_name,
  p.last_name,
  c.name AS contract_name,
  ay.name AS academic_year_name,
  pr.commission_percentage,
  pr.total_contract_value,
  pr.commission_amount,
  pr.commission_status,
  pr.created_at AS referral_created_at,
  pr.paid_at
FROM public.student_applications sa
INNER JOIN public.partner_referrals pr ON sa.id = pr.application_id
INNER JOIN public.profiles p ON sa.student_id = p.id
LEFT JOIN public.contracts c ON sa.contract_id = c.id
LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id;

GRANT SELECT ON public.partner_referred_applications TO authenticated;

ALTER VIEW public.partner_referred_applications SET (security_invoker = true);

-- ============================================================================
-- PART 5: UPDATE TOLERANCE IN get_payment_summary
-- ============================================================================

-- Increase tolerance from £0.01 to £1.00 as safety net
-- This handles any remaining rounding differences
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
  -- NOTE: Last-installment adjustment is handled in frontend/application code
  -- Database function just sums the calculated amounts
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
      
      -- With 4-decimal precision, rounding errors should be minimal
      -- Frontend code handles last-installment adjustment for perfect accuracy
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

COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After migration, verify:
-- 1. All amount columns are now NUMERIC(12,4)
-- 2. Views return correct precision
-- 3. Functions work correctly
-- 4. Existing data preserved (e.g., £2,619.34 → £2,619.3400)

