-- Verify the function was actually updated in the database
-- This checks if the function contains the last-installment adjustment logic

-- Step 1: Check if function exists and has the fix
SELECT 
  proname AS function_name,
  CASE 
    WHEN prosrc LIKE '%sum_previous%' 
     AND prosrc LIKE '%remaining_balance - sum_prev%'
     AND prosrc LIKE '%installment_calc%'
    THEN '✅ Function HAS last-installment adjustment'
    ELSE '❌ Function DOES NOT have last-installment adjustment'
  END AS function_status,
  CASE 
    WHEN prosrc LIKE '%NOT LIKE ''%deposit%''%' 
    THEN '✅ Function filters deposits'
    ELSE '❌ Function does NOT filter deposits'
  END AS deposit_filter_status
FROM pg_proc 
WHERE proname = 'get_payment_summary'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Step 2: Get actual function output for the application
SELECT * FROM public.get_payment_summary('ce0cde7e-bd47-4523-9b19-5a4019b65465'::UUID);

-- Step 3: Check contract and payment plan details
SELECT 
  sa.id AS application_id,
  c.name AS contract_name,
  c.weekly_price_override * c.weeks AS contract_total,
  COALESCE(c.deposit_override, pp.deposit_amount, 0) AS deposit,
  (c.weekly_price_override * c.weeks) - COALESCE(c.deposit_override, pp.deposit_amount, 0) AS remaining_balance,
  sa.selected_payment_plan_id,
  pp.name AS payment_plan_name
FROM student_applications sa
INNER JOIN contracts c ON c.id = sa.contract_id
LEFT JOIN payment_plans pp ON pp.id = sa.selected_payment_plan_id
WHERE sa.id = 'ce0cde7e-bd47-4523-9b19-5a4019b65465'::UUID;

-- Step 4: Check what's in payment_plan_installments
-- (This will show if there's a deposit entry that's not being filtered)
SELECT 
  sequence,
  label,
  amount_type,
  amount_value,
  CASE 
    WHEN LOWER(COALESCE(label, '')) LIKE '%deposit%' THEN '❌ DEPOSIT (should be filtered)'
    ELSE '✅ INSTALLMENT'
  END AS type
FROM payment_plan_installments
WHERE payment_plan_id = (
  SELECT selected_payment_plan_id 
  FROM student_applications 
  WHERE id = 'ce0cde7e-bd47-4523-9b19-5a4019b65465'::UUID
)
ORDER BY sequence;

