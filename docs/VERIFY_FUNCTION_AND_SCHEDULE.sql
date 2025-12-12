-- Verify function was updated and check schedule
-- Replace 'YOUR_APPLICATION_ID' with your new Gold application ID

-- Step 1: Verify the function has the last-installment adjustment
SELECT 
  CASE 
    WHEN prosrc LIKE '%sum_previous%' AND prosrc LIKE '%remaining_balance - sum_prev%' 
    THEN '✅ Function HAS last-installment adjustment'
    ELSE '❌ Function DOES NOT have last-installment adjustment'
  END AS function_status
FROM pg_proc 
WHERE proname = 'get_payment_summary';

-- Step 2: Check if contract_payment_schedule exists for this contract
SELECT 
  sa.id AS application_id,
  sa.contract_id,
  c.name AS contract_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM contract_payment_schedule WHERE contract_id = sa.contract_id) 
    THEN '✅ Schedule EXISTS'
    ELSE '❌ No Schedule'
  END AS schedule_status
FROM student_applications sa
INNER JOIN contracts c ON c.id = sa.contract_id
WHERE sa.id = 'YOUR_APPLICATION_ID'::UUID;  -- REPLACE THIS

-- Step 3: If schedule exists, show what's in it
SELECT 
  sequence,
  label,
  amount,
  CASE 
    WHEN LOWER(COALESCE(label, '')) LIKE '%deposit%' THEN '❌ DEPOSIT'
    ELSE '✅ INSTALLMENT'
  END AS type
FROM contract_payment_schedule
WHERE contract_id = (
  SELECT contract_id FROM student_applications WHERE id = 'YOUR_APPLICATION_ID'::UUID
)
ORDER BY sequence;

-- Step 4: Check what the function calculates
SELECT * FROM public.get_payment_summary('YOUR_APPLICATION_ID'::UUID);

-- Step 5: Check contract calculation
SELECT 
  c.weekly_price_override * c.weeks AS contract_total,
  c.deposit_override AS deposit,
  (c.weekly_price_override * c.weeks) - COALESCE(c.deposit_override, 0) AS remaining_balance
FROM student_applications sa
INNER JOIN contracts c ON c.id = sa.contract_id
WHERE sa.id = 'YOUR_APPLICATION_ID'::UUID;

-- Step 6: Manual calculation of what installments should sum to
-- (This should match the sum of actual payments)
SELECT 
  'Expected Installment Total' AS description,
  (c.weekly_price_override * c.weeks) - COALESCE(c.deposit_override, 0) AS expected_total
FROM student_applications sa
INNER JOIN contracts c ON c.id = sa.contract_id
WHERE sa.id = 'YOUR_APPLICATION_ID'::UUID;

