-- Update 2026/2027 master "4 Instalments" due dates to the agreed calendar:
--   1) 22 Aug 2026
--   2) 1 Dec 2026
--   3) 1 Mar 2027
--   4) 1 Jun 2027
--
-- Scope:
--   - 26/27 master plan only (payment_plans.student_application_id IS NULL)
--   - Existing bookings on that master plan inherit these dates automatically
--     via selected_payment_plan_id (schedule is plan-driven)
--   - Student-specific customised plans are left unchanged
--
-- Offsets are recalculated for the standard 2026-09-05 contract start so
-- offset-based code paths stay consistent with absolute due_date.

DO $$
DECLARE
  v_plan_id UUID := 'aaf8ae81-fa08-48e5-883a-c3e0dbc892f5';
  v_year_id UUID := 'd47b0f65-93eb-4e06-b0ea-1c80de40dd09'; -- 2026/2027
  v_updated INTEGER := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.payment_plans pp
    WHERE pp.id = v_plan_id
      AND pp.academic_year_id = v_year_id
      AND pp.name = '4 Instalments'
      AND pp.student_application_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Expected 26/27 master "4 Instalments" plan % not found', v_plan_id;
  END IF;

  UPDATE public.payment_plan_installments AS ppi
  SET
    due_date = v.new_due_date,
    due_date_offset_days = v.new_offset,
    updated_at = NOW()
  FROM (
    VALUES
      (2, DATE '2026-08-22', -14),  -- Instalment 1
      (3, DATE '2026-12-01', 87),   -- Instalment 2
      (4, DATE '2027-03-01', 177),  -- Instalment 3
      (5, DATE '2027-06-01', 269)   -- Instalment 4
  ) AS v(sequence, new_due_date, new_offset)
  WHERE ppi.payment_plan_id = v_plan_id
    AND ppi.sequence = v.sequence
    AND LOWER(COALESCE(ppi.label, '')) NOT LIKE '%deposit%';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 4 THEN
    RAISE EXCEPTION 'Expected to update 4 instalment rows, updated %', v_updated;
  END IF;
END $$;
