-- Diagnostic Query: Check contract_payment_schedule data
-- Run this to see what's actually in the schedule for your contract

-- Replace 'YOUR_CONTRACT_ID' with the actual contract ID
-- You can find it by running: SELECT id, name FROM contracts WHERE slug LIKE '%platinum%';

-- Step 1: Check what's in the payment schedule
SELECT 
  id,
  sequence,
  label,
  amount,
  due_date,
  CASE 
    WHEN LOWER(COALESCE(label, '')) LIKE '%deposit%' THEN 'DEPOSIT (should be excluded)'
    ELSE 'INSTALLMENT (should be included)'
  END AS payment_type
FROM public.contract_payment_schedule
WHERE contract_id = 'YOUR_CONTRACT_ID'::UUID  -- REPLACE THIS
ORDER BY sequence;

-- Step 2: Check the sum WITH deposit (current incorrect behavior)
SELECT 
  'Total WITH deposit (WRONG)' AS description,
  SUM(amount) AS total_amount
FROM public.contract_payment_schedule
WHERE contract_id = 'YOUR_CONTRACT_ID'::UUID;  -- REPLACE THIS

-- Step 3: Check the sum WITHOUT deposit (what it should be)
SELECT 
  'Total WITHOUT deposit (CORRECT)' AS description,
  SUM(amount) AS total_amount
FROM public.contract_payment_schedule
WHERE contract_id = 'YOUR_CONTRACT_ID'::UUID  -- REPLACE THIS
  AND LOWER(COALESCE(label, '')) NOT LIKE '%deposit%';

-- Step 4: Test the function directly
-- Replace 'YOUR_APPLICATION_ID' with the actual application ID
SELECT * FROM public.get_payment_summary('YOUR_APPLICATION_ID'::UUID);

-- Step 5: Check if the function definition has the fix
SELECT 
  CASE 
    WHEN prosrc LIKE '%NOT LIKE ''%deposit%''%' THEN '✅ Function HAS the deposit exclusion fix'
    ELSE '❌ Function DOES NOT have the deposit exclusion fix'
  END AS function_status,
  prosrc
FROM pg_proc 
WHERE proname = 'get_payment_summary'
LIMIT 1;

