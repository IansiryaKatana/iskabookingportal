-- Debug: Find out why the function is still including the deposit
-- Run these queries one by one to diagnose the issue

-- STEP 1: Find your contract and application IDs
-- Replace 'platinum' with part of your contract name
SELECT 
  c.id AS contract_id,
  c.name AS contract_name,
  c.slug,
  sa.id AS application_id,
  sa.student_id
FROM contracts c
LEFT JOIN student_applications sa ON sa.contract_id = c.id
WHERE c.name ILIKE '%platinum%'  -- REPLACE THIS with your contract name
  OR c.slug ILIKE '%platinum%'  -- OR slug
LIMIT 5;

-- STEP 2: Check what's in the payment schedule for your contract
-- Replace 'YOUR_CONTRACT_ID' with the contract_id from Step 1
SELECT 
  sequence,
  label,
  amount,
  due_date,
  -- Test the filter condition
  LOWER(COALESCE(label, '')) AS lower_label,
  CASE 
    WHEN LOWER(COALESCE(label, '')) LIKE '%deposit%' THEN 'EXCLUDED (deposit)'
    ELSE 'INCLUDED (installment)'
  END AS filter_result
FROM public.contract_payment_schedule
WHERE contract_id = 'YOUR_CONTRACT_ID'::UUID  -- REPLACE THIS
ORDER BY sequence;

-- STEP 3: Test the sum WITH deposit (what function might be doing)
SELECT 
  'Sum WITH deposit (WRONG)' AS test,
  SUM(amount) AS total
FROM public.contract_payment_schedule
WHERE contract_id = 'YOUR_CONTRACT_ID'::UUID;  -- REPLACE THIS

-- STEP 4: Test the sum WITHOUT deposit (what function SHOULD be doing)
SELECT 
  'Sum WITHOUT deposit (CORRECT)' AS test,
  SUM(amount) AS total
FROM public.contract_payment_schedule
WHERE contract_id = 'YOUR_CONTRACT_ID'::UUID  -- REPLACE THIS
  AND LOWER(COALESCE(label, '')) NOT LIKE '%deposit%';

-- STEP 5: Check if the function is using the schedule or calculating differently
-- Replace 'YOUR_APPLICATION_ID' with application_id from Step 1
SELECT * FROM public.get_payment_summary('YOUR_APPLICATION_ID'::UUID);

-- STEP 6: Check contract total and deposit amounts
-- Replace 'YOUR_CONTRACT_ID' with contract_id from Step 1
SELECT 
  c.id,
  c.name,
  c.weekly_price_override,
  c.weeks,
  c.weekly_price_override * c.weeks AS contract_total,
  c.deposit_override AS deposit_amount,
  (c.weekly_price_override * c.weeks) - COALESCE(c.deposit_override, 0) AS expected_installment_total
FROM contracts c
WHERE c.id = 'YOUR_CONTRACT_ID'::UUID;  -- REPLACE THIS

-- STEP 7: See the actual function source code to debug
SELECT prosrc 
FROM pg_proc 
WHERE proname = 'get_payment_summary';

