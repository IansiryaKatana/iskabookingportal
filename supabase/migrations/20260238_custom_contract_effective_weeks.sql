-- Custom contracts: use effective weeks (weeks + extra_days/7) for all contract value calculations.
-- Formula: contract_total = weekly_price * (weeks + COALESCE(extra_days,0)/7).
-- Example: 36 weeks + 2 days at £155/week = 155 * (36 + 2/7) ≈ £5624.29 (not 36*155 = £5580).

-- ============================================================================
-- 1. calculate_contract_value: use effective weeks so total_contract_value is correct
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_contract_value(
  p_contract_id UUID
) RETURNS NUMERIC(12,4) AS $$
DECLARE
  v_weekly_price NUMERIC(12,4);
  v_weeks INTEGER;
  v_extra_days SMALLINT := 0;
  v_effective_weeks NUMERIC;
BEGIN
  SELECT
    COALESCE(c.weekly_price_override, sgp.weekly_price, 0),
    COALESCE(c.weeks, 0),
    COALESCE(c.extra_days, 0)
  INTO v_weekly_price, v_weeks, v_extra_days
  FROM public.contracts c
  LEFT JOIN public.studio_grade_prices sgp
    ON sgp.academic_year_id = c.academic_year_id
    AND sgp.studio_grade_id = c.studio_grade_id
    AND sgp.is_active = true
  WHERE c.id = p_contract_id;

  v_effective_weeks := COALESCE(v_weeks, 0) + (LEAST(6, GREATEST(0, COALESCE(v_extra_days, 0)))::NUMERIC / 7.0);
  RETURN COALESCE(v_weekly_price, 0) * v_effective_weeks;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.calculate_contract_value(UUID) IS 'Contract total = weekly_price * (weeks + extra_days/7). Used by trigger to set student_applications.total_contract_value.';

-- ============================================================================
-- 2. get_payment_summary: use effective weeks for contract total and installment base
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

COMMENT ON FUNCTION public.get_payment_summary(UUID) IS 'Returns payment summary; uses effective weeks (weeks + extra_days/7) for contract total. Deposit separate from contract total.';

-- ============================================================================
-- 3. backfill_contract_payment_schedule_for_contract: use effective weeks
-- ============================================================================
CREATE OR REPLACE FUNCTION public.backfill_contract_payment_schedule_for_contract(
  p_contract_id UUID,
  p_payment_plan_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_total NUMERIC := 0;
  v_weekly_price NUMERIC := 0;
  v_weeks INT := 0;
  v_extra_days SMALLINT := 0;
  v_effective_weeks NUMERIC := 0;
  v_contract_start DATE;
  v_installment_base NUMERIC;
  v_inserted INT := 0;
  v_row RECORD;
  v_amount NUMERIC;
  v_due_date DATE;
  v_prev_sum NUMERIC := 0;
  v_total_rows INT := 0;
  v_seq INT := 0;
  v_label TEXT;
  v_last_amount NUMERIC;
BEGIN
  IF EXISTS (SELECT 1 FROM public.contract_payment_schedule WHERE contract_id = p_contract_id) THEN
    RETURN 0;
  END IF;

  SELECT
    c.contract_start,
    COALESCE(c.weeks, 0),
    COALESCE(c.extra_days, 0),
    COALESCE(c.weekly_price_override, sgp.weekly_price, 0)
  INTO v_contract_start, v_weeks, v_extra_days, v_weekly_price
  FROM public.contracts c
  LEFT JOIN public.studio_grade_prices sgp
    ON sgp.academic_year_id = c.academic_year_id
    AND sgp.studio_grade_id = c.studio_grade_id
    AND sgp.is_active = true
  WHERE c.id = p_contract_id;

  IF v_contract_start IS NULL OR v_weeks IS NULL OR v_weeks <= 0 THEN
    RETURN 0;
  END IF;

  v_effective_weeks := v_weeks + (LEAST(6, GREATEST(0, COALESCE(v_extra_days, 0)))::NUMERIC / 7.0);
  v_contract_total := COALESCE(v_weekly_price, 0) * v_effective_weeks;
  v_installment_base := v_contract_total;

  WITH inst AS (
    SELECT
      ppi.sequence,
      ppi.amount_type,
      ppi.amount_value,
      ppi.label,
      ppi.due_date AS ppi_due_date,
      ppi.due_date_offset_days,
      ROW_NUMBER() OVER (ORDER BY ppi.sequence) AS rn,
      COUNT(*) OVER () AS total
    FROM public.payment_plan_installments ppi
    WHERE ppi.payment_plan_id = p_payment_plan_id
      AND LOWER(COALESCE(ppi.label, '')) NOT LIKE '%deposit%'
  ),
  raw AS (
    SELECT
      inst.sequence,
      inst.label,
      CASE
        WHEN inst.ppi_due_date IS NOT NULL THEN inst.ppi_due_date::DATE
        WHEN inst.due_date_offset_days IS NOT NULL THEN v_contract_start::DATE + (inst.due_date_offset_days || ' days')::INTERVAL
        ELSE v_contract_start::DATE
      END AS due_date,
      ROUND(
        CASE
          WHEN inst.amount_type = 'percentage' THEN (v_installment_base * inst.amount_value / 100)
          WHEN inst.amount_type = 'fixed' THEN inst.amount_value
          ELSE 0
        END,
        2
      ) AS raw_amount,
      inst.rn,
      inst.total
    FROM inst
  ),
  adjusted AS (
    SELECT
      raw.sequence,
      raw.label,
      raw.due_date,
      CASE
        WHEN raw.rn = raw.total THEN
          ROUND(GREATEST(v_installment_base - COALESCE(SUM(raw.raw_amount) OVER (ORDER BY raw.sequence ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0), 0), 2)
        ELSE raw.raw_amount
      END AS amount
    FROM raw
  )
  INSERT INTO public.contract_payment_schedule (contract_id, sequence, label, due_date, amount)
  SELECT p_contract_id, adjusted.sequence, adjusted.label, adjusted.due_date, adjusted.amount
  FROM adjusted;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.backfill_contract_payment_schedule_for_contract(UUID, UUID) IS 'Inserts contract_payment_schedule rows using effective weeks (weeks + extra_days/7). No-op if schedule already exists.';

-- ============================================================================
-- 4. One-off: refresh total_contract_value for all applications (trigger uses new calculate_contract_value)
-- ============================================================================
UPDATE public.student_applications
SET total_contract_value = public.calculate_contract_value(contract_id)
WHERE contract_id IS NOT NULL;

-- ============================================================================
-- 5. One-off: re-backfill payment schedules for contracts with extra_days > 0
--    (existing schedule was built with weeks-only; delete and regenerate with effective weeks)
-- ============================================================================
DO $$
DECLARE
  v_rec RECORD;
  v_plan_id UUID;
  v_deleted INT;
  v_inserted INT;
  v_total_deleted INT := 0;
  v_total_inserted INT := 0;
BEGIN
  FOR v_rec IN
    SELECT c.id AS contract_id
    FROM public.contracts c
    WHERE COALESCE(c.extra_days, 0) > 0
      AND EXISTS (SELECT 1 FROM public.contract_payment_schedule s WHERE s.contract_id = c.id)
  LOOP
    -- Get a payment_plan_id from any application using this contract
    SELECT sa.selected_payment_plan_id INTO v_plan_id
    FROM public.student_applications sa
    WHERE sa.contract_id = v_rec.contract_id AND sa.selected_payment_plan_id IS NOT NULL
    LIMIT 1;

    IF v_plan_id IS NOT NULL THEN
      DELETE FROM public.contract_payment_schedule WHERE contract_id = v_rec.contract_id;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      v_total_deleted := v_total_deleted + v_deleted;

      v_inserted := public.backfill_contract_payment_schedule_for_contract(v_rec.contract_id, v_plan_id);
      v_total_inserted := v_total_inserted + v_inserted;
    END IF;
  END LOOP;
  RAISE NOTICE 'Re-backfill for extra_days contracts: % schedule rows deleted, % rows re-inserted.', v_total_deleted, v_total_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_contract_payment_schedule_for_contract(UUID, UUID) TO authenticated;

-- ============================================================================
-- 6. Trigger on contracts: when weeks, extra_days, or weekly_price_override
--    change, refresh total_contract_value on all applications using this contract
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_application_contract_value_on_contract_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.weeks IS DISTINCT FROM NEW.weeks
    OR OLD.extra_days IS DISTINCT FROM NEW.extra_days
    OR OLD.weekly_price_override IS DISTINCT FROM NEW.weekly_price_override
  ) THEN
    UPDATE public.student_applications
    SET total_contract_value = public.calculate_contract_value(NEW.id)
    WHERE contract_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_application_contract_value_on_contract_change ON public.contracts;
CREATE TRIGGER trigger_sync_application_contract_value_on_contract_change
  AFTER UPDATE OF weeks, extra_days, weekly_price_override ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_application_contract_value_on_contract_change();
