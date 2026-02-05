-- Deposit is separate from contract total: installments are calculated from full contract amount,
-- not (contract total - deposit). Deposit is paid separately and not deducted from rent.

-- ============================================================================
-- 1. get_application_total_with_discount: sum only installment rows (exclude deposit)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_application_total_with_discount(p_application_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_total_due NUMERIC;
  v_cashback NUMERIC;
  v_discount NUMERIC;
BEGIN
  SELECT COALESCE(SUM(cps.amount), 0)
  INTO v_total_due
  FROM public.contract_payment_schedule cps
  INNER JOIN public.student_applications sa ON sa.contract_id = cps.contract_id
  WHERE sa.id = p_application_id
    AND LOWER(COALESCE(cps.label, '')) NOT LIKE '%deposit%';

  SELECT COALESCE(cashback_amount, 0), COALESCE(discount_amount, 0)
  INTO v_cashback, v_discount
  FROM public.student_applications
  WHERE id = p_application_id;

  RETURN GREATEST(COALESCE(v_total_due, 0) - COALESCE(v_cashback, 0) - COALESCE(v_discount, 0), 0);
END;
$$;

-- ============================================================================
-- 2. get_payment_summary: use contract total for installment base (do not subtract deposit)
-- ============================================================================
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
  v_installment_base NUMERIC := 0;  -- amount installments must cover (full contract, no minus deposit)
  v_total_due NUMERIC := 0;
  v_cashback NUMERIC := 0;
  v_discount NUMERIC := 0;
  v_total_due_after_reductions NUMERIC := 0;
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
    SELECT
      COALESCE(c.weekly_price_override, sgp.weekly_price, 0),
      COALESCE(c.weeks, 0)
    INTO v_contract_weekly_price, v_contract_weeks
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
  -- Deposit is separate: installments cover full contract total (no minus deposit)
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

  IF v_schedule_exists THEN
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

  IF NOT v_schedule_exists AND v_payment_plan_id IS NOT NULL AND v_installment_base > 0 THEN
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

COMMENT ON FUNCTION public.get_payment_summary(UUID) IS 'Returns payment summary; deposit is separate from contract total - installments are calculated from full contract amount.';

-- ============================================================================
-- 3. deposit_installment_breakdown: expected_installments = total_due (no minus deposit_paid)
-- ============================================================================
DROP VIEW IF EXISTS public.deposit_installment_breakdown CASCADE;
CREATE VIEW public.deposit_installment_breakdown AS
SELECT
  sa.id AS application_id,
  sa.student_id,
  p.first_name || ' ' || p.last_name AS student_name,
  c.name AS contract_name,
  sg.name AS studio_grade,
  sa.total_contract_value,
  COALESCE((
    SELECT SUM(amount_paid)
    FROM public.unified_payment_history
    WHERE student_application_id = sa.id
      AND payment_metadata->>'type' = 'deposit'
      AND payment_status = 'succeeded'
  ), 0) AS deposit_paid,
  COALESCE(pp.deposit_amount, 0) AS expected_deposit,
  COALESCE((
    SELECT SUM(amount_paid)
    FROM public.unified_payment_history
    WHERE student_application_id = sa.id
      AND payment_metadata->>'type' != 'deposit'
      AND payment_status = 'succeeded'
  ), 0) AS installments_paid,
  COALESCE(ps.total_due, 0) AS expected_installments,
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
COMMENT ON VIEW public.deposit_installment_breakdown IS 'Deposit vs Installment Breakdown; total_due is installment-only (deposit separate from contract).';
