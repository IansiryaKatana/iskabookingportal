-- Test what the function is actually seeing
-- This will help us debug why total_paid is still 0

-- Test 1: Check what unified_payment_history returns for this application
SELECT 
  'Test 1: Payments in unified_payment_history' as test_name,
  COUNT(*) as payment_count,
  SUM(amount_paid) as total_amount,
  STRING_AGG(payment_id::text, ', ') as payment_ids
FROM public.unified_payment_history
WHERE student_application_id = 'b8326825-6f22-4dcf-ac78-e5d6994bde7b'
  AND payment_status IN ('succeeded', 'completed')
  AND (
    payment_metadata->>'type' = 'instalment'
    OR installment_number IS NOT NULL
  )
  AND COALESCE(payment_metadata->>'type', '') != 'deposit';

-- Test 2: Check what stripe_payments returns directly
SELECT 
  'Test 2: Payments in stripe_payments table' as test_name,
  COUNT(*) as payment_count,
  SUM(amount) as total_amount,
  STRING_AGG(id::text, ', ') as payment_ids
FROM public.stripe_payments
WHERE student_application_id = 'b8326825-6f22-4dcf-ac78-e5d6994bde7b'
  AND payment_type = 'instalment'
  AND status IN ('succeeded', 'completed');

-- Test 3: Check the exact query the function uses
SELECT 
  'Test 3: Function query simulation' as test_name,
  payment_source,
  payment_id,
  amount_paid,
  payment_status,
  payment_metadata->>'type' as type,
  installment_number,
  CASE 
    WHEN payment_metadata->>'type' = 'instalment' THEN 'MATCH - type is instalment'
    WHEN installment_number IS NOT NULL THEN 'MATCH - has installment_number'
    WHEN payment_metadata->>'type' = 'deposit' THEN 'EXCLUDED - is deposit'
    ELSE 'NO MATCH'
  END as match_status
FROM public.unified_payment_history
WHERE student_application_id = 'b8326825-6f22-4dcf-ac78-e5d6994bde7b'
  AND payment_status IN ('succeeded', 'completed')
ORDER BY payment_date DESC;

