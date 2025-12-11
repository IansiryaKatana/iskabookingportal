-- Diagnostic queries to check what's actually in the database
-- Run these queries to see what's happening with payments

-- Query 1: Check all payments for a specific application
-- Replace 'YOUR_APPLICATION_ID' with an actual application ID
/*
SELECT 
  'stripe_payments' as source,
  sp.id,
  sp.student_application_id,
  sp.payment_type,
  sp.status,
  sp.amount,
  sp.metadata,
  sp.metadata->>'type' as metadata_type,
  sp.metadata->>'instalment_id' as instalment_id,
  sp.created_at
FROM public.stripe_payments sp
WHERE sp.student_application_id = 'YOUR_APPLICATION_ID'
ORDER BY sp.created_at DESC;
*/

-- Query 2: Check unified_payment_history view
-- Replace 'YOUR_APPLICATION_ID' with an actual application ID
/*
SELECT 
  payment_source,
  payment_id,
  student_application_id,
  amount_paid,
  payment_status,
  installment_number,
  payment_metadata,
  payment_metadata->>'type' as payment_type_from_metadata,
  payment_date
FROM public.unified_payment_history
WHERE student_application_id = 'YOUR_APPLICATION_ID'
ORDER BY payment_date DESC;
*/

-- Query 3: Check what get_payment_summary returns
-- Replace 'YOUR_APPLICATION_ID' with an actual application ID
/*
SELECT * FROM public.get_payment_summary('YOUR_APPLICATION_ID');
*/

-- Query 4: Check contract payment schedule
-- Replace 'YOUR_APPLICATION_ID' with an actual application ID
/*
SELECT 
  cps.id,
  cps.contract_id,
  cps.sequence,
  cps.label,
  cps.amount,
  cps.due_date
FROM public.contract_payment_schedule cps
INNER JOIN public.student_applications sa ON sa.contract_id = cps.contract_id
WHERE sa.id = 'YOUR_APPLICATION_ID'
ORDER BY cps.sequence;
*/

-- Query 5: Count payments by type for an application
-- Replace 'YOUR_APPLICATION_ID' with an actual application ID
/*
SELECT 
  payment_metadata->>'type' as payment_type,
  COUNT(*) as count,
  SUM(amount_paid) as total_amount,
  STRING_AGG(payment_id::text, ', ') as payment_ids
FROM public.unified_payment_history
WHERE student_application_id = 'YOUR_APPLICATION_ID'
  AND payment_status IN ('succeeded', 'completed')
GROUP BY payment_metadata->>'type';
*/

-- Query 6: Check if payments have installment_number
-- Replace 'YOUR_APPLICATION_ID' with an actual application ID
/*
SELECT 
  payment_id,
  payment_source,
  amount_paid,
  payment_metadata->>'type' as type,
  installment_number,
  payment_metadata->>'instalment_id' as instalment_id_from_metadata,
  CASE 
    WHEN payment_metadata->>'type' = 'instalment' THEN 'YES - type is instalment'
    WHEN installment_number IS NOT NULL THEN 'YES - has installment_number'
    WHEN payment_metadata->>'type' = 'deposit' THEN 'NO - is deposit'
    ELSE 'UNKNOWN'
  END as is_installment_payment
FROM public.unified_payment_history
WHERE student_application_id = 'YOUR_APPLICATION_ID'
  AND payment_status IN ('succeeded', 'completed')
ORDER BY payment_date DESC;
*/

-- Query 7: Get all applications with payment issues
SELECT 
  sa.id as application_id,
  sa.status as application_status,
  c.name as contract_name,
  (SELECT COUNT(*) FROM public.contract_payment_schedule cps WHERE cps.contract_id = sa.contract_id) as schedule_items,
  (SELECT COUNT(*) FROM public.stripe_payments sp WHERE sp.student_application_id = sa.id AND sp.payment_type = 'instalment' AND sp.status IN ('succeeded', 'completed')) as instalment_payments_in_db,
  (SELECT COUNT(*) FROM public.unified_payment_history uph 
   WHERE uph.student_application_id = sa.id 
   AND uph.payment_status IN ('succeeded', 'completed')
   AND (uph.payment_metadata->>'type' = 'instalment' OR uph.installment_number IS NOT NULL)
   AND COALESCE(uph.payment_metadata->>'type', '') != 'deposit') as instalment_payments_in_view,
  (SELECT SUM(amount) FROM public.contract_payment_schedule cps WHERE cps.contract_id = sa.contract_id) as total_due,
  (SELECT SUM(amount_paid) FROM public.unified_payment_history uph 
   WHERE uph.student_application_id = sa.id 
   AND uph.payment_status IN ('succeeded', 'completed')
   AND (uph.payment_metadata->>'type' = 'instalment' OR uph.installment_number IS NOT NULL)
   AND COALESCE(uph.payment_metadata->>'type', '') != 'deposit') as total_paid,
  (SELECT * FROM public.get_payment_summary(sa.id)) as payment_summary
FROM public.student_applications sa
INNER JOIN public.contracts c ON sa.contract_id = c.id
WHERE sa.status = 'confirmed'
ORDER BY sa.created_at DESC
LIMIT 10;

