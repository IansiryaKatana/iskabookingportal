-- Check why new application still has discrepancy
-- Replace 'YOUR_APPLICATION_ID' with the new Gold application ID

-- Step 1: Check if contract_payment_schedule exists for this contract
SELECT 
  sa.id AS application_id,
  sa.contract_id,
  c.name AS contract_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM contract_payment_schedule WHERE contract_id = sa.contract_id) 
    THEN '✅ Schedule EXISTS (might include deposit)'
    ELSE '❌ No Schedule (uses payment_plan_installments)'
  END AS schedule_status
FROM student_applications sa
INNER JOIN contracts c ON c.id = sa.contract_id
WHERE sa.id = 'YOUR_APPLICATION_ID'::UUID;  -- REPLACE THIS

-- Step 2: If schedule exists, check what's in it
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

-- Step 3: Check what the function is calculating
SELECT * FROM public.get_payment_summary('YOUR_APPLICATION_ID'::UUID);

-- Step 4: Check contract details
SELECT 
  c.weekly_price_override * c.weeks AS contract_total,
  c.deposit_override AS deposit,
  (c.weekly_price_override * c.weeks) - COALESCE(c.deposit_override, 0) AS remaining_balance
FROM student_applications sa
INNER JOIN contracts c ON c.id = sa.contract_id
WHERE sa.id = 'YOUR_APPLICATION_ID'::UUID;

-- Step 5: Check actual payments
SELECT 
  payment_type,
  amount,
  status,
  created_at
FROM stripe_payments
WHERE student_application_id = 'YOUR_APPLICATION_ID'::UUID
ORDER BY created_at;

