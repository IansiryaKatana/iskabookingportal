-- Second fix for get_installment_breakdown:
-- Use the correct alias (instalment_id_text) from the payments CTE instead of a non-existent mp.instalment_id column.

CREATE OR REPLACE FUNCTION public.get_installment_breakdown(p_application_id UUID)
RETURNS TABLE (
  installment_id UUID,
  sequence INTEGER,
  label TEXT,
  due_date DATE,
  amount_due NUMERIC,
  amount_paid NUMERIC,
  remaining_amount NUMERIC,
  payment_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_id UUID;
  v_payment_plan_id UUID;
  v_contract_weekly_price NUMERIC;
  v_contract_weeks INTEGER;
  v_contract_extra_days SMALLINT := 0;
  v_effective_weeks NUMERIC := 0;
  v_installment_base NUMERIC := 0;
  v_tolerance NUMERIC := 1.00;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.student_applications WHERE id = p_application_id) THEN
    RAISE EXCEPTION 'Application % not found', p_application_id
      USING ERRCODE = 'P0001';
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

  v_effective_weeks := COALESCE(v_contract_weeks, 0)
    + (LEAST(6, GREATEST(0, COALESCE(v_contract_extra_days, 0)))::NUMERIC / 7.0);
  v_installment_base := COALESCE(v_contract_weekly_price, 0) * v_effective_weeks;

  IF v_payment_plan_id IS NOT NULL AND v_installment_base > 0 THEN
    RETURN QUERY
    WITH plan_rows AS (
      SELECT
        ppi.sequence,
        ppi.label,
        ppi.due_date,
        ppi.due_date_offset_days,
        ppi.amount_type,
        ppi.amount_value,
        ROW_NUMBER() OVER (ORDER BY ppi.sequence) AS rn,
        COUNT(*) OVER () AS total_rows
      FROM public.payment_plan_installments ppi
      WHERE ppi.payment_plan_id = v_payment_plan_id
        AND LOWER(COALESCE(ppi.label, '')) NOT LIKE '%deposit%'
    ),
    plan_calc AS (
      SELECT
        pr.sequence,
        pr.label,
        pr.due_date,
        pr.due_date_offset_days,
        pr.rn,
        pr.total_rows,
        CASE
          WHEN pr.amount_type = 'percentage' THEN (v_installment_base * COALESCE(pr.amount_value, 0) / 100)
          WHEN pr.amount_type = 'fixed' THEN COALESCE(pr.amount_value, 0)
          ELSE 0
        END AS calculated_amount
      FROM plan_rows pr
    ),
    plan_adjusted AS (
      SELECT
        pc.sequence,
        pc.label,
        pc.due_date,
        pc.due_date_offset_days,
        CASE
          WHEN pc.rn = pc.total_rows THEN
            GREATEST(v_installment_base - COALESCE((
              SELECT SUM(calculated_amount) FROM plan_calc WHERE rn < pc.rn
            ), 0), 0)
          ELSE
            COALESCE(pc.calculated_amount, 0)
        END AS amount_due
      FROM plan_calc pc
    ),
    schedule_rows AS (
      SELECT
        cps.id,
        cps.sequence,
        cps.label
      FROM public.contract_payment_schedule cps
      WHERE cps.contract_id = v_contract_id
      ORDER BY cps.sequence
    ),
    non_deposit_schedule AS (
      SELECT *
      FROM schedule_rows s
      WHERE LOWER(COALESCE(s.label, '')) NOT LIKE '%deposit%'
    ),
    first_n_schedule AS (
      SELECT *
      FROM non_deposit_schedule
      ORDER BY sequence
      LIMIT (SELECT COUNT(*) FROM plan_adjusted)
    ),
    joined AS (
      SELECT
        s.id AS installment_id,
        s.sequence,
        COALESCE(s.label, pa.label, CONCAT('Instalment ', s.sequence)) AS label,
        CASE
          WHEN pa.due_date IS NOT NULL THEN pa.due_date
          WHEN pa.due_date_offset_days IS NOT NULL THEN
            (SELECT c.contract_start::date
             FROM public.contracts c
             WHERE c.id = v_contract_id)
            + (pa.due_date_offset_days::INT)
          ELSE
            (SELECT c.contract_start::date
             FROM public.contracts c
             WHERE c.id = v_contract_id)
        END AS due_date,
        pa.amount_due
      FROM first_n_schedule s
      JOIN plan_adjusted pa
        ON pa.sequence = s.sequence
      ORDER BY s.sequence
    ),
    payments AS (
      SELECT
        COALESCE(sp.metadata->>'instalment_id', mp.instalment_id_text) AS instalment_id_text,
        SUM(sp.amount) AS stripe_amount,
        SUM(mp.amount) AS manual_amount
      FROM (
        SELECT metadata, amount
        FROM public.stripe_payments
        WHERE student_application_id = p_application_id
          AND payment_type = 'instalment'
          AND status IN ('succeeded', 'completed')
      ) sp
      FULL OUTER JOIN (
        SELECT instalment_id::text AS instalment_id_text, amount
        FROM public.manual_payments
        WHERE application_id = p_application_id
          AND payment_type = 'instalment'
          AND instalment_id IS NOT NULL
      ) mp ON (sp.metadata->>'instalment_id') = mp.instalment_id_text
      GROUP BY COALESCE(sp.metadata->>'instalment_id', mp.instalment_id_text)
    )
    SELECT
      j.installment_id,
      j.sequence,
      j.label,
      j.due_date,
      ROUND(j.amount_due, 2) AS amount_due,
      ROUND(COALESCE(p.stripe_amount, 0) + COALESCE(p.manual_amount, 0), 2) AS amount_paid,
      GREATEST(ROUND(j.amount_due, 2) - ROUND(COALESCE(p.stripe_amount, 0) + COALESCE(p.manual_amount, 0), 2), 0) AS remaining_amount,
      CASE
        WHEN ROUND(COALESCE(p.stripe_amount, 0) + COALESCE(p.manual_amount, 0), 2) <= 0.009 THEN 'unpaid'
        WHEN ROUND(COALESCE(p.stripe_amount, 0) + COALESCE(p.manual_amount, 0), 2) >= ROUND(j.amount_due, 2) - v_tolerance THEN 'paid'
        ELSE 'partial'
      END AS payment_status
    FROM joined j
    LEFT JOIN payments p
      ON p.instalment_id_text = j.installment_id::text
    ORDER BY j.sequence;

  ELSE
    RETURN QUERY
    WITH schedule_rows AS (
      SELECT
        cps.id,
        cps.sequence,
        cps.label,
        cps.due_date,
        cps.amount
      FROM public.contract_payment_schedule cps
      WHERE cps.contract_id = v_contract_id
        AND LOWER(COALESCE(cps.label, '')) NOT LIKE '%deposit%'
      ORDER BY cps.sequence
    ),
    payments AS (
      SELECT
        COALESCE(sp.metadata->>'instalment_id', mp.instalment_id_text) AS instalment_id_text,
        SUM(sp.amount) AS stripe_amount,
        SUM(mp.amount) AS manual_amount
      FROM (
        SELECT metadata, amount
        FROM public.stripe_payments
        WHERE student_application_id = p_application_id
          AND payment_type = 'instalment'
          AND status IN ('succeeded', 'completed')
      ) sp
      FULL OUTER JOIN (
        SELECT instalment_id::text AS instalment_id_text, amount
        FROM public.manual_payments
        WHERE application_id = p_application_id
          AND payment_type = 'instalment'
          AND instalment_id IS NOT NULL
      ) mp ON (sp.metadata->>'instalment_id') = mp.instalment_id_text
      GROUP BY COALESCE(sp.metadata->>'instalment_id', mp.instalment_id_text)
    )
    SELECT
      s.id AS installment_id,
      s.sequence,
      COALESCE(s.label, CONCAT('Instalment ', s.sequence)) AS label,
      s.due_date::date,
      ROUND(COALESCE(s.amount, 0), 2) AS amount_due,
      ROUND(COALESCE(p.stripe_amount, 0) + COALESCE(p.manual_amount, 0), 2) AS amount_paid,
      GREATEST(ROUND(COALESCE(s.amount, 0), 2) - ROUND(COALESCE(p.stripe_amount, 0) + COALESCE(p.manual_amount, 0), 2), 0) AS remaining_amount,
      CASE
        WHEN ROUND(COALESCE(p.stripe_amount, 0) + COALESCE(p.manual_amount, 0), 2) <= 0.009 THEN 'unpaid'
        WHEN ROUND(COALESCE(p.stripe_amount, 0) + COALESCE(p.manual_amount, 0), 2) >= ROUND(COALESCE(s.amount, 0), 2) - v_tolerance THEN 'paid'
        ELSE 'partial'
      END AS payment_status
    FROM schedule_rows s
    LEFT JOIN payments p
      ON p.instalment_id_text = s.id::text
    ORDER BY s.sequence;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_installment_breakdown(UUID) TO authenticated;

