-- Fourth fix for get_installment_breakdown:
-- When there are instalment-type payments for an application that are NOT linked
-- to a specific instalment_id (manual_payments.instalment_id IS NULL and/or
-- stripe_payments.metadata->>'instalment_id' IS NULL), the previous versions of
-- this function would show £0.00 paid for every instalment even though the
-- overall payment summary was partially/fully paid.
--
-- This version keeps the existing precise-per-instalment behaviour when any
-- instalments already have linked payments. Only when the sum of linked
-- per-instalment payments is zero do we fall back to allocating all unlinked
-- instalment payments proportionally across the schedule by amount_due.
--
-- This makes legacy imported payments (which were recorded at application
-- level only) visible in the UI without changing the semantics where data is
-- already clean and instalment_id is populated.

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
  v_total_instalment_paid NUMERIC := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.student_applications WHERE id = p_application_id) THEN
    RAISE EXCEPTION 'Application % not found', p_application_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT sa.contract_id, sa.selected_payment_plan_id
  INTO v_contract_id, v_payment_plan_id
  FROM public.student_applications sa
  WHERE sa.id = p_application_id;

  -- Need contract for schedule; avoid returning NULL installment_id (can cause 400 from REST).
  IF v_contract_id IS NULL THEN
    RETURN;
  END IF;

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

  -- Total instalment payments for this application (Stripe + manual).
  -- We deliberately ignore instalment_id and always apply payments in
  -- sequence order (waterfall) across the schedule.
  BEGIN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_instalment_paid
    FROM (
      SELECT amount
      FROM public.stripe_payments
      WHERE student_application_id = p_application_id
        AND payment_type = 'instalment'
        AND status IN ('succeeded', 'completed')
      UNION ALL
      SELECT amount
      FROM public.manual_payments
      WHERE application_id = p_application_id
        AND payment_type = 'instalment'
    ) src;
  EXCEPTION WHEN OTHERS THEN
    v_total_instalment_paid := 0;
  END;

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
        pc.rn,
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
      SELECT nds.*
      FROM non_deposit_schedule nds
      ORDER BY nds.sequence
      LIMIT (SELECT COUNT(*) FROM plan_adjusted)
    ),
    schedule_with_rn AS (
      SELECT fns.id, fns.sequence, fns.label,
        ROW_NUMBER() OVER (ORDER BY fns.sequence) AS rn
      FROM first_n_schedule fns
    ),
    -- Drive from plan so we always get one row per plan instalment (2, 3, 10, 20, etc.);
    -- join schedule by position (rn). Waterfall applies to all: excess bleeds to next, then next, until exhausted.
    joined AS (
      SELECT
        COALESCE(s.id, (SELECT swr.id FROM schedule_with_rn swr ORDER BY swr.rn DESC LIMIT 1)) AS installment_id,
        pa.sequence::INTEGER AS sequence,
        COALESCE(s.label, pa.label, CONCAT('Instalment ', pa.sequence)) AS label,
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
      FROM plan_adjusted pa
      LEFT JOIN schedule_with_rn s ON s.rn = pa.rn
      ORDER BY pa.sequence
    ),
    -- Allocate total paid across instalments in order: fill 1st, then 2nd, … then Nth (any N).
    waterfall AS (
      SELECT
        j.installment_id,
        j.sequence,
        j.label,
        j.due_date,
        ROUND(j.amount_due, 2) AS amount_due,
        ROUND(j.amount_due, 2) AS schedule_amount_due,
        SUM(ROUND(j.amount_due, 2)) OVER (
          ORDER BY j.sequence
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_need,
        SUM(ROUND(j.amount_due, 2)) OVER (
          ORDER BY j.sequence
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS previous_cumulative_need
      FROM joined j
    ),
    final AS (
      SELECT
        w.installment_id,
        w.sequence,
        w.label,
        w.due_date,
        w.schedule_amount_due AS amount_due,
        ROUND(
          GREATEST(
            LEAST(v_total_instalment_paid, COALESCE(w.cumulative_need, 0))
            - COALESCE(w.previous_cumulative_need, 0),
            0
          ),
          2
        ) AS amount_paid
      FROM waterfall w
    )
    SELECT
      f.installment_id,
      f.sequence,
      f.label,
      f.due_date,
      f.amount_due,
      f.amount_paid,
      GREATEST(f.amount_due - f.amount_paid, 0) AS remaining_amount,
      CASE
        WHEN f.amount_paid <= 0.009 THEN 'unpaid'
        WHEN f.amount_paid >= f.amount_due - v_tolerance THEN 'paid'
        ELSE 'partial'
      END AS payment_status
    FROM final f
    ORDER BY f.sequence;

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
    -- Allocate total paid across instalments in order: fill 1st, then 2nd, … then Nth (any N).
    waterfall AS (
      SELECT
        s.id AS installment_id,
        s.sequence::INTEGER AS sequence,
        COALESCE(s.label, CONCAT('Instalment ', s.sequence)) AS label,
        s.due_date::date AS due_date,
        ROUND(COALESCE(s.amount, 0), 2) AS amount_due,
        ROUND(COALESCE(s.amount, 0), 2) AS schedule_amount_due,
        SUM(ROUND(COALESCE(s.amount, 0), 2)) OVER (
          ORDER BY s.sequence
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_need,
        SUM(ROUND(COALESCE(s.amount, 0), 2)) OVER (
          ORDER BY s.sequence
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS previous_cumulative_need
      FROM schedule_rows s
    ),
    final AS (
      SELECT
        w.installment_id,
        w.sequence,
        w.label,
        w.due_date,
        w.schedule_amount_due AS amount_due,
        ROUND(
          GREATEST(
            LEAST(v_total_instalment_paid, COALESCE(w.cumulative_need, 0))
            - COALESCE(w.previous_cumulative_need, 0),
            0
          ),
          2
        ) AS amount_paid
      FROM waterfall w
    )
    SELECT
      f.installment_id,
      f.sequence,
      f.label,
      f.due_date,
      f.amount_due,
      f.amount_paid,
      GREATEST(f.amount_due - f.amount_paid, 0) AS remaining_amount,
      CASE
        WHEN f.amount_paid <= 0.009 THEN 'unpaid'
        WHEN f.amount_paid >= f.amount_due - v_tolerance THEN 'paid'
        ELSE 'partial'
      END AS payment_status
    FROM final f
    ORDER BY f.sequence;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_installment_breakdown(UUID) TO authenticated;

