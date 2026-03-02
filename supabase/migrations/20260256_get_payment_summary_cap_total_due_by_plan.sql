-- Fix get_payment_summary so Instalment progress total_due matches Total Value and the payment schedule table.
--
-- ROOT CAUSE: The UI shows:
--   - Total Value = application.total_contract_value (from contract: weekly_price * effective_weeks).
--   - Payment schedule = built from payment_plan_installments for selected_payment_plan_id (useStudentPayments).
--   - Instalment progress total_due was coming from SUM(contract_payment_schedule) for the contract.
-- After the append migration, contract_payment_schedule can have MORE rows than this application's plan
-- (e.g. same contract used by apps on different plans, or multiple appends), so the sum was wrong (£20,400 vs £8,160).
--
-- FIX: When the application has selected_payment_plan_id, compute total_due from the PLAN (payment_plan_installments)
-- using the same contract total (v_installment_base). Do NOT use contract_payment_schedule for total_due in that case.
-- This matches the UI schedule and Total Value exactly.

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
  v_installment_base NUMERIC := 0;
  v_total_due NUMERIC := 0;
  v_cashback NUMERIC := 0;
  v_discount NUMERIC := 0;
  v_total_due_after_reductions NUMERIC := 0;
  v_total_paid NUMERIC := 0;
  v_payment_count INTEGER := 0;
  v_last_payment_date TIMESTAMPTZ;
  v_contract_weekly_price NUMERIC;
  v_contract_weeks INTEGER;
  v_contract_extra_days SMALLINT := 0;
  v_effective_weeks NUMERIC := 0;
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
    SELECT
      COALESCE(c.weekly_price_override, sgp.weekly_price, 0),
      COALESCE(c.weeks, 0),
      COALESCE(c.extra_days, 0)
    INTO v_contract_weekly_price, v_contract_weeks, v_contract_extra_days
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
    v_contract_extra_days := 0;
  END;

  v_effective_weeks := COALESCE(v_contract_weeks, 0) + (LEAST(6, GREATEST(0, COALESCE(v_contract_extra_days, 0)))::NUMERIC / 7.0);
  v_contract_total := COALESCE(v_contract_weekly_price, 0) * v_effective_weeks;
  v_installment_base := v_contract_total;

  BEGIN
    SELECT COALESCE(c.deposit_override, pp.deposit_amount, sgp.deposit_amount_override, 0)
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

  SELECT EXISTS (SELECT 1 FROM public.contract_payment_schedule WHERE contract_id = v_contract_id)
  INTO v_schedule_exists;

  -- When application has a selected payment plan, total_due MUST come from that plan's instalments
  -- (same source as the UI schedule and Total Value). Do NOT use contract_payment_schedule,
  -- which may have extra rows from other plans on the same contract.
  IF v_payment_plan_id IS NOT NULL AND v_installment_base > 0 THEN
    BEGIN
      WITH installment_calc AS (
        SELECT
          sequence,
          amount_type,
          amount_value,
          CASE
            WHEN amount_type = 'percentage' THEN (v_installment_base * amount_value / 100)
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
      SELECT COALESCE(sp.sum_prev, 0) + GREATEST(v_installment_base - COALESCE(sp.sum_prev, 0), 0)
      INTO v_total_due
      FROM sum_previous sp;

      IF v_total_due IS NULL OR v_total_due <= 0 THEN
        v_total_due := v_installment_base;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_total_due := v_installment_base;
    END;
  ELSIF v_schedule_exists THEN
    BEGIN
      SELECT COALESCE(SUM(amount), 0)
      INTO v_total_due
      FROM public.contract_payment_schedule
      WHERE contract_id = v_contract_id
        AND LOWER(COALESCE(label, '')) NOT LIKE '%deposit%'
        AND (sequence > 1 OR amount != v_deposit_amount);

      IF v_total_due IS NULL OR v_total_due = 0 THEN
        v_total_due := v_installment_base;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_total_due := v_installment_base;
    END;
  END IF;

  v_total_due := COALESCE(v_total_due, 0);

  BEGIN
    SELECT COALESCE(cashback_amount, 0), COALESCE(discount_amount, 0)
    INTO v_cashback, v_discount
    FROM public.student_applications
    WHERE id = p_application_id;
  EXCEPTION WHEN OTHERS THEN
    v_cashback := 0;
    v_discount := 0;
  END;

  v_total_due_after_reductions := GREATEST(v_total_due - COALESCE(v_cashback, 0) - COALESCE(v_discount, 0), 0);

  BEGIN
    SELECT COALESCE(SUM(amount), 0), COUNT(*), MAX(created_at)
    INTO v_stripe_paid, v_stripe_count, v_stripe_last
    FROM public.stripe_payments
    WHERE student_application_id = p_application_id
      AND payment_type = 'instalment'
      AND status IN ('succeeded', 'completed');

    SELECT COALESCE(SUM(amount), 0), COUNT(*), MAX(payment_date::TIMESTAMPTZ)
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

  v_remaining_balance := GREATEST(v_total_due_after_reductions - v_total_paid, 0);
  IF ABS(v_total_due_after_reductions - v_total_paid) <= v_tolerance AND v_total_paid > 0 THEN
    v_remaining_balance := 0;
  END IF;

  RETURN QUERY SELECT
    v_total_due_after_reductions,
    v_total_paid,
    v_remaining_balance,
    COALESCE(v_payment_count, 0),
    v_last_payment_date,
    CASE
      WHEN v_remaining_balance <= v_tolerance AND v_total_paid > 0 THEN 'fully_paid'
      WHEN v_total_due_after_reductions <= 0.01 THEN 'fully_paid'
      WHEN v_total_paid > 0 THEN 'partially_paid'
      ELSE 'unpaid'
    END;
END;
$$;

COMMENT ON FUNCTION public.get_payment_summary(UUID) IS 'Returns payment summary. When application has selected_payment_plan_id, total_due is computed from that plan (payment_plan_installments) so it matches Total Value and the payment schedule table; contract_payment_schedule is not used for total_due in that case.';
