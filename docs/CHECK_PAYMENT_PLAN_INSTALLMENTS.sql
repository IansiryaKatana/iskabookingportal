-- Check what's in payment_plan_installments for your application
-- This will show us if the deposit is being excluded correctly

-- Step 1: Get the payment plan ID for your application
-- Replace 'YOUR_APPLICATION_ID' with your actual application ID
SELECT 
  sa.id AS application_id,
  sa.selected_payment_plan_id,
  pp.name AS payment_plan_name
FROM student_applications sa
LEFT JOIN payment_plans pp ON pp.id = sa.selected_payment_plan_id
WHERE sa.id = 'YOUR_APPLICATION_ID'::UUID;  -- REPLACE THIS

-- Step 2: Check all installments in the payment plan (including deposit)
-- Replace 'YOUR_PAYMENT_PLAN_ID' with the payment_plan_id from Step 1
SELECT 
  sequence,
  label,
  amount_type,
  amount_value,
  due_date_offset_days,
  -- Test the filter
  LOWER(COALESCE(label, '')) AS lower_label,
  CASE 
    WHEN LOWER(COALESCE(label, '')) LIKE '%deposit%' THEN '❌ DEPOSIT (should be excluded)'
    ELSE '✅ INSTALLMENT (should be included)'
  END AS filter_result
FROM payment_plan_installments
WHERE payment_plan_id = 'YOUR_PAYMENT_PLAN_ID'::UUID  -- REPLACE THIS
ORDER BY sequence;

-- Step 3: Calculate what the sum SHOULD be (excluding deposit)
-- Replace 'YOUR_PAYMENT_PLAN_ID' with the payment_plan_id from Step 1
-- Also replace the contract_total and deposit values
SELECT 
  'Sum of installments (excluding deposit)' AS description,
  SUM(
    CASE 
      WHEN amount_type = 'percentage' THEN (9126.00 * amount_value / 100)  -- Replace 9126.00 with: contract_total - deposit
      WHEN amount_type = 'fixed' THEN amount_value
      ELSE 0
    END
  ) AS calculated_total
FROM payment_plan_installments
WHERE payment_plan_id = 'YOUR_PAYMENT_PLAN_ID'::UUID  -- REPLACE THIS
  AND LOWER(COALESCE(label, '')) NOT LIKE '%deposit%';

-- Step 4: Check what the function is actually calculating
-- Replace 'YOUR_APPLICATION_ID' with your actual application ID
SELECT * FROM public.get_payment_summary('YOUR_APPLICATION_ID'::UUID);

-- Step 5: Manual calculation to verify
-- Get contract details
SELECT 
  c.weekly_price_override * c.weeks AS contract_total,
  c.deposit_override AS deposit,
  (c.weekly_price_override * c.weeks) - COALESCE(c.deposit_override, 0) AS remaining_balance
FROM student_applications sa
INNER JOIN contracts c ON c.id = sa.contract_id
WHERE sa.id = 'YOUR_APPLICATION_ID'::UUID;  -- REPLACE THIS

