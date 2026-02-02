-- 1. Add booking_source to student_applications (rebooker, website, imported, partner_referral)
-- 2. Fix get_payment_summary so bulk-imported rows without schedule/plan don't show as fully_paid

-- ============================================================================
-- 1. BOOKING_SOURCE COLUMN
-- ============================================================================

ALTER TABLE public.student_applications
ADD COLUMN IF NOT EXISTS booking_source TEXT;

ALTER TABLE public.student_applications
DROP CONSTRAINT IF EXISTS student_applications_booking_source_check;

ALTER TABLE public.student_applications
ADD CONSTRAINT student_applications_booking_source_check
CHECK (booking_source IS NULL OR booking_source IN ('rebooker', 'website', 'imported', 'partner_referral'));

CREATE INDEX IF NOT EXISTS idx_student_applications_booking_source
ON public.student_applications(booking_source)
WHERE booking_source IS NOT NULL;

COMMENT ON COLUMN public.student_applications.booking_source IS 'How the booking was acquired: rebooker, website, imported, partner_referral. Used for attribution and to mark rebookers when previous year record is not yet uploaded.';

-- ============================================================================
-- 2. GET_PAYMENT_SUMMARY FIX (fully_paid when total_due was 0)
-- ============================================================================
-- When contract has no contract_payment_schedule and application has no selected_payment_plan_id,
-- v_total_due stayed 0 so total_due_after_cashback <= 0.01 and status became 'fully_paid'.
-- Fallback: set total_due = remaining_balance so bulk-imported rows show correct status.

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
  v_total_due NUMERIC := 0;
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
  v_tolerance NUMERIC := 1.00;
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

  SELECT sa.contract_id, sa.selected_payment_plan_id
  INTO v_contract_id, v_payment_plan_id
  FROM public.student_applications sa
  WHERE sa.id = p_application_id;

  BEGIN
    SELECT COALESCE(c.weekly_price_override, sgp.weekly_price, 0), COALESCE(c.weeks, 0)
    INTO v_contract_weekly_price, v_contract_weeks
    FROM public.student_applications sa
    INNER JOIN public.contracts c ON sa.contract_id = c.id
    LEFT JOIN public.studio_grade_prices sgp
      ON sgp.academic_year_id = c.academic_year_id AND sgp.studio_grade_id = c.studio_grade_id AND sgp.is_active = true
    WHERE sa.id = p_application_id;
  EXCEPTION WHEN OTHERS THEN
    v_contract_weekly_price := 0;
    v_contract_weeks := 0;
  END;

  v_contract_total := COALESCE(v_contract_weekly_price, 0) * COALESCE(v_contract_weeks, 0);

  BEGIN
    SELECT COALESCE(c.deposit_override, pp.deposit_amount, sgp.deposit_amount_override, 0)
    INTO v_deposit_amount
    FROM public.student_applications sa
    INNER JOIN public.contracts c ON sa.contract_id = c.id
    LEFT JOIN public.payment_plans pp ON pp.id = v_payment_plan_id
    LEFT JOIN public.studio_grade_prices sgp
      ON sgp.academic_year_id = c.academic_year_id AND sgp.studio_grade_id = c.studio_grade_id AND sgp.is_active = true
    WHERE sa.id = p_application_id;
  EXCEPTION WHEN OTHERS THEN
    v_deposit_amount := 0;
  END;

  v_deposit_amount := COALESCE(v_deposit_amount, 0);
  v_remaining_balance := GREATEST(v_contract_total - v_deposit_amount, 0);

  SELECT EXISTS (SELECT 1 FROM public.contract_payment_schedule WHERE contract_id = v_contract_id) INTO v_schedule_exists;

  IF v_schedule_exists THEN
    BEGIN
      SELECT COALESCE(SUM(amount), 0) INTO v_total_due
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

  IF NOT v_schedule_exists AND v_payment_plan_id IS NOT NULL AND v_remaining_balance > 0 THEN
    BEGIN
      WITH installment_calc AS (
        SELECT sequence, amount_type, amount_value,
          CASE WHEN amount_type = 'percentage' THEN (v_remaining_balance * amount_value / 100) WHEN amount_type = 'fixed' THEN amount_value ELSE 0 END AS calculated_amount,
          ROW_NUMBER() OVER (ORDER BY sequence) AS rn, COUNT(*) OVER () AS total
        FROM public.payment_plan_installments
        WHERE payment_plan_id = v_payment_plan_id AND LOWER(COALESCE(label, '')) NOT LIKE '%deposit%'
      ),
      sum_previous AS (SELECT COALESCE(SUM(calculated_amount), 0) AS sum_prev FROM installment_calc WHERE rn < total)
      SELECT COALESCE(sp.sum_prev, 0) + GREATEST(v_remaining_balance - COALESCE(sp.sum_prev, 0), 0) INTO v_total_due FROM sum_previous sp;
      IF v_total_due IS NULL OR v_total_due <= 0 THEN
        v_total_due := v_remaining_balance;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_total_due := v_remaining_balance;
    END;
  END IF;

  -- Fallback: no schedule and no plan (or plan yielded 0) -> total_due = remaining_balance so bulk-imported rows don't show fully_paid
  IF (v_total_due IS NULL OR v_total_due <= 0) AND v_remaining_balance > 0 THEN
    v_total_due := v_remaining_balance;
  END IF;

  v_total_due := COALESCE(v_total_due, 0);

  BEGIN
    SELECT COALESCE(cashback_amount, 0) INTO v_cashback FROM public.student_applications WHERE id = p_application_id;
  EXCEPTION WHEN OTHERS THEN
    v_cashback := 0;
  END;

  v_total_due_after_cashback := GREATEST(v_total_due - COALESCE(v_cashback, 0), 0);

  BEGIN
    SELECT COALESCE(SUM(amount), 0), COUNT(*), MAX(created_at)
    INTO v_stripe_paid, v_stripe_count, v_stripe_last
    FROM public.stripe_payments
    WHERE student_application_id = p_application_id AND payment_type = 'instalment' AND status IN ('succeeded', 'completed');

    SELECT COALESCE(SUM(amount), 0), COUNT(*), MAX(payment_date::TIMESTAMPTZ)
    INTO v_manual_paid, v_manual_count, v_manual_last
    FROM public.manual_payments
    WHERE application_id = p_application_id AND payment_type = 'instalment';
  EXCEPTION WHEN OTHERS THEN
    v_stripe_paid := 0; v_stripe_count := 0; v_stripe_last := NULL;
    v_manual_paid := 0; v_manual_count := 0; v_manual_last := NULL;
  END;

  v_total_paid := COALESCE(v_stripe_paid, 0) + COALESCE(v_manual_paid, 0);
  v_payment_count := COALESCE(v_stripe_count, 0) + COALESCE(v_manual_count, 0);
  v_last_payment_date := COALESCE(GREATEST(v_stripe_last, v_manual_last), v_stripe_last, v_manual_last);

  v_remaining_balance := GREATEST(v_total_due_after_cashback - v_total_paid, 0);
  IF ABS(v_total_due_after_cashback - v_total_paid) <= v_tolerance AND v_total_paid > 0 THEN
    v_remaining_balance := 0;
  END IF;

  RETURN QUERY SELECT
    v_total_due_after_cashback,
    v_total_paid,
    v_remaining_balance,
    COALESCE(v_payment_count, 0),
    v_last_payment_date,
    CASE
      WHEN v_remaining_balance <= v_tolerance AND v_total_paid > 0 THEN 'fully_paid'
      WHEN v_total_due_after_cashback <= 0.01 THEN 'fully_paid'
      WHEN v_total_paid > 0 THEN 'partially_paid'
      ELSE 'unpaid'
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_summary(UUID) TO authenticated, anon;
