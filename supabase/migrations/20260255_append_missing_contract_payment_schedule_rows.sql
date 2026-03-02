-- Append missing contract_payment_schedule rows for contracts that have FEWER schedule rows
-- than the selected plan's instalments (e.g. 6 vs 10). This fixes "All installments are already paid"
-- in Record Manual Payment when 4 instalments are still unpaid.
-- Run this for existing applications where the page shows 10 instalments but the dialog sees only 6.

CREATE OR REPLACE FUNCTION public.append_missing_contract_payment_schedule_rows(
  p_contract_id UUID,
  p_payment_plan_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_start DATE;
  v_weekly_price NUMERIC := 0;
  v_weeks INT := 0;
  v_installment_base NUMERIC;
  v_inserted INT := 0;
  v_existing_sequences INT[];
BEGIN
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

  v_installment_base := COALESCE(v_weekly_price, 0) * COALESCE(v_weeks, 0);

  SELECT ARRAY_AGG(sequence ORDER BY sequence)
  INTO v_existing_sequences
  FROM public.contract_payment_schedule
  WHERE contract_id = p_contract_id;

  v_existing_sequences := COALESCE(v_existing_sequences, ARRAY[]::INT[]);

  INSERT INTO public.contract_payment_schedule (contract_id, sequence, label, due_date, amount)
  WITH plan_inst AS (
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
      AND NOT (ppi.sequence = ANY(v_existing_sequences))
  ),
  raw AS (
    SELECT
      plan_inst.sequence,
      plan_inst.label,
      CASE
        WHEN plan_inst.ppi_due_date IS NOT NULL THEN plan_inst.ppi_due_date::DATE
        WHEN plan_inst.due_date_offset_days IS NOT NULL THEN v_contract_start::DATE + (plan_inst.due_date_offset_days || ' days')::INTERVAL
        ELSE v_contract_start::DATE
      END AS due_date,
      ROUND(
        CASE
          WHEN plan_inst.amount_type = 'percentage' THEN (v_installment_base * plan_inst.amount_value / 100)
          WHEN plan_inst.amount_type = 'fixed' THEN plan_inst.amount_value
          ELSE 0
        END,
        2
      ) AS raw_amount,
      plan_inst.rn,
      plan_inst.total
    FROM plan_inst
  ),
  adjusted AS (
    SELECT raw.sequence, raw.label, raw.due_date, raw.raw_amount AS amount
    FROM raw
  )
  SELECT p_contract_id, adjusted.sequence, adjusted.label, adjusted.due_date, adjusted.amount
  FROM adjusted;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.append_missing_contract_payment_schedule_rows(UUID, UUID) IS 'Inserts contract_payment_schedule rows for sequences that do not yet exist for this contract, from the given payment plan. Use when schedule has fewer rows than plan instalments (e.g. 6 vs 10).';

-- One-time: for each contract that has applications with a selected plan and has fewer schedule rows than plan instalments, append missing rows
DO $$
DECLARE
  v_rec RECORD;
  v_plan_count INT;
  v_schedule_count INT;
  v_appended INT;
  v_total INT := 0;
BEGIN
  FOR v_rec IN
    SELECT DISTINCT ON (c.id, sa.selected_payment_plan_id)
      c.id AS contract_id,
      sa.selected_payment_plan_id AS payment_plan_id
    FROM public.contracts c
    INNER JOIN public.student_applications sa ON sa.contract_id = c.id
    WHERE sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature')
      AND sa.selected_payment_plan_id IS NOT NULL
    ORDER BY c.id, sa.selected_payment_plan_id
  LOOP
    SELECT COUNT(*) INTO v_plan_count
    FROM public.payment_plan_installments ppi
    WHERE ppi.payment_plan_id = v_rec.payment_plan_id
      AND LOWER(COALESCE(ppi.label, '')) NOT LIKE '%deposit%';

    SELECT COUNT(*) INTO v_schedule_count
    FROM public.contract_payment_schedule s
    WHERE s.contract_id = v_rec.contract_id;

    IF v_plan_count > v_schedule_count THEN
      v_appended := public.append_missing_contract_payment_schedule_rows(v_rec.contract_id, v_rec.payment_plan_id);
      v_total := v_total + v_appended;
      RAISE NOTICE 'Contract %: appended % schedule rows (plan has %, had %).', v_rec.contract_id, v_appended, v_plan_count, v_schedule_count;
    END IF;
  END LOOP;
  RAISE NOTICE 'Append missing contract_payment_schedule rows: % total rows inserted.', v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.append_missing_contract_payment_schedule_rows(UUID, UUID) TO authenticated;
