-- Debug why payments aren't being counted
-- Run this to see what's in unified_payment_history for this application

SELECT 
  '=== ALL PAYMENTS IN unified_payment_history ===' as debug_section,
  payment_source,
  payment_id,
  amount_paid,
  payment_status,
  payment_metadata,
  payment_metadata->>'type' as metadata_type,
  installment_number,
  CASE 
    WHEN payment_metadata->>'type' = 'instalment' THEN 'YES - type is instalment'
    WHEN installment_number IS NOT NULL THEN 'YES - has installment_number'
    WHEN payment_metadata->>'type' = 'deposit' THEN 'NO - is deposit'
    ELSE 'UNKNOWN - might not be counted'
  END as will_be_counted_as_installment
FROM public.unified_payment_history
WHERE student_application_id = 'b8326825-6f22-4dcf-ac78-e5d6994bde7b'
ORDER BY payment_date DESC;

-- Check what's in stripe_payments directly
SELECT 
  '=== PAYMENTS IN stripe_payments TABLE ===' as debug_section,
  id,
  payment_type,
  status,
  amount,
  metadata,
  metadata->>'type' as metadata_type,
  metadata->>'instalment_id' as instalment_id
FROM public.stripe_payments
WHERE student_application_id = 'b8326825-6f22-4dcf-ac78-e5d6994bde7b'
ORDER BY created_at DESC;

