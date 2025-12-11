-- Check if the fix worked
-- Run this AFTER running the fix_null_total_due migration

SELECT 
  sa.id as application_id,
  c.name as contract_name,
  -- Check if payment schedule exists
  (SELECT COUNT(*) FROM public.contract_payment_schedule cps WHERE cps.contract_id = sa.contract_id) as schedule_items_count,
  -- Get contract details
  c.weekly_price_override as contract_weekly_price,
  c.weeks as contract_weeks,
  (c.weekly_price_override * c.weeks) as calculated_contract_value,
  -- Get payment plan
  sa.selected_payment_plan_id,
  -- Get payment summary
  (SELECT total_due FROM public.get_payment_summary(sa.id)) as total_due,
  (SELECT total_paid FROM public.get_payment_summary(sa.id)) as total_paid,
  (SELECT remaining_balance FROM public.get_payment_summary(sa.id)) as remaining_balance,
  (SELECT payment_status FROM public.get_payment_summary(sa.id)) as payment_status
FROM public.student_applications sa
INNER JOIN public.contracts c ON sa.contract_id = c.id
WHERE sa.id = 'b8326825-6f22-4dcf-ac78-e5d6994bde7b';

