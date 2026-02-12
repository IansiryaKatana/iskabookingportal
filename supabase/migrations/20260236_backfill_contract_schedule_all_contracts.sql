-- Backfill contract_payment_schedule for all contracts that have linked payment plans
-- but no schedule rows (e.g. created before app started auto-creating schedule).
-- Ensures instalments show in Record Manual Payment and reports for existing data.

DO $$
DECLARE
  v_rec RECORD;
  v_inserted INT;
  v_total INT := 0;
BEGIN
  FOR v_rec IN
    SELECT DISTINCT ON (cpp.contract_id) cpp.contract_id, cpp.payment_plan_id
    FROM public.contract_payment_plans cpp
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_payment_schedule s WHERE s.contract_id = cpp.contract_id
    )
    ORDER BY cpp.contract_id, cpp.display_order
  LOOP
    v_inserted := public.backfill_contract_payment_schedule_for_contract(v_rec.contract_id, v_rec.payment_plan_id);
    v_total := v_total + v_inserted;
  END LOOP;
  RAISE NOTICE 'Backfill contract_payment_schedule (all contracts): % rows inserted.', v_total;
END;
$$;
