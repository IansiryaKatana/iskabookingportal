-- Backfill contract_payment_schedule for applications that have a contract and selected payment plan
-- but no schedule rows (e.g. bulk-imported applications). Without these rows, the Upcoming Payments
-- report shows nothing for those applications.

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
    COALESCE(c.weekly_price_override, sgp.weekly_price, 0)
  INTO v_contract_start, v_weeks, v_weekly_price
  FROM public.contracts c
  LEFT JOIN public.studio_grade_prices sgp
    ON sgp.academic_year_id = c.academic_year_id
    AND sgp.studio_grade_id = c.studio_grade_id
    AND sgp.is_active = true
  WHERE c.id = p_contract_id;

  IF v_contract_start IS NULL OR v_weeks IS NULL OR v_weeks <= 0 THEN
    RETURN 0;
  END IF;

  v_contract_total := COALESCE(v_weekly_price, 0) * COALESCE(v_weeks, 0);
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

COMMENT ON FUNCTION public.backfill_contract_payment_schedule_for_contract(UUID, UUID) IS 'Inserts contract_payment_schedule rows for a contract from its payment plan installments (excl. deposit). No-op if schedule already exists. Returns number of rows inserted.';

-- One-time backfill: all contracts that have at least one confirmed/awaiting application with a payment plan but no schedule
DO $$
DECLARE
  v_rec RECORD;
  v_inserted INT;
  v_total INT := 0;
BEGIN
  FOR v_rec IN
    SELECT DISTINCT c.id AS contract_id, sa.selected_payment_plan_id AS payment_plan_id
    FROM public.contracts c
    INNER JOIN public.student_applications sa ON sa.contract_id = c.id
    WHERE sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature')
      AND sa.selected_payment_plan_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.contract_payment_schedule s WHERE s.contract_id = c.id)
  LOOP
    v_inserted := public.backfill_contract_payment_schedule_for_contract(v_rec.contract_id, v_rec.payment_plan_id);
    v_total := v_total + v_inserted;
  END LOOP;
  RAISE NOTICE 'Backfill contract_payment_schedule: % rows inserted across contracts.', v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_contract_payment_schedule_for_contract(UUID, UUID) TO authenticated;
