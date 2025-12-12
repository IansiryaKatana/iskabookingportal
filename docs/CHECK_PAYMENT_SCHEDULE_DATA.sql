-- Check what's actually in the payment schedule for your contract
-- This will show us why the filter is excluding everything

SELECT 
  sequence,
  label,
  amount,
  due_date,
  -- Show the actual label values
  COALESCE(label, 'NULL') AS label_display,
  LOWER(COALESCE(label, '')) AS lower_label,
  -- Test if it matches deposit filter
  CASE 
    WHEN LOWER(COALESCE(label, '')) LIKE '%deposit%' THEN '❌ MATCHES DEPOSIT FILTER (will be excluded)'
    WHEN label IS NULL THEN '⚠️ LABEL IS NULL (will be included)'
    ELSE '✅ DOES NOT MATCH (will be included)'
  END AS filter_status
FROM public.contract_payment_schedule
WHERE contract_id = 'ae7a2609-1ce1-4b0b-ba40-70e50798d7d0'::UUID
ORDER BY sequence;

-- Also check the total count
SELECT 
  COUNT(*) AS total_rows,
  COUNT(CASE WHEN LOWER(COALESCE(label, '')) LIKE '%deposit%' THEN 1 END) AS deposit_rows,
  COUNT(CASE WHEN LOWER(COALESCE(label, '')) NOT LIKE '%deposit%' OR label IS NULL THEN 1 END) AS installment_rows,
  SUM(amount) AS total_all_amounts
FROM public.contract_payment_schedule
WHERE contract_id = 'ae7a2609-1ce1-4b0b-ba40-70e50798d7d0'::UUID;

