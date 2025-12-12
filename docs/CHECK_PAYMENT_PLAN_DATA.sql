-- Check payment plan installments and function output
-- Application ID: ce0cde7e-bd47-4523-9b19-5a4019b65465

-- Step 1: Check what get_payment_summary returns
SELECT * FROM public.get_payment_summary('ce0cde7e-bd47-4523-9b19-5a4019b65465'::UUID);

-- Step 2: Get the payment plan ID
SELECT 
  sa.id AS application_id,
  sa.selected_payment_plan_id AS payment_plan_id,
  pp.name AS payment_plan_name
FROM student_applications sa
LEFT JOIN payment_plans pp ON pp.id = sa.selected_payment_plan_id
WHERE sa.id = 'ce0cde7e-bd47-4523-9b19-5a4019b65465'::UUID;

-- Step 3: Check what's in payment_plan_installments
-- (Replace payment_plan_id from Step 2)
SELECT 
  sequence,
  label,
  amount_type,
  amount_value,
  CASE 
    WHEN LOWER(COALESCE(label, '')) LIKE '%deposit%' THEN '❌ DEPOSIT'
    ELSE '✅ INSTALLMENT'
  END AS type
FROM payment_plan_installments
WHERE payment_plan_id = 'REPLACE_WITH_PAYMENT_PLAN_ID_FROM_STEP_2'::UUID
ORDER BY sequence;

-- Step 4: Calculate what the installments should sum to
-- (Replace payment_plan_id and contract_id from Steps 2 and 1)
WITH contract_calc AS (
  SELECT 
    (c.weekly_price_override * c.weeks) AS contract_total,
    COALESCE(c.deposit_override, pp.deposit_amount, 0) AS deposit,
    (c.weekly_price_override * c.weeks) - COALESCE(c.deposit_override, pp.deposit_amount, 0) AS remaining_balance
  FROM student_applications sa
  INNER JOIN contracts c ON c.id = sa.contract_id
  LEFT JOIN payment_plans pp ON pp.id = sa.selected_payment_plan_id
  WHERE sa.id = 'ce0cde7e-bd47-4523-9b19-5a4019b65465'::UUID
),
installment_calc AS (
  SELECT 
    sequence,
    label,
    amount_type,
    amount_value,
    CASE 
      WHEN amount_type = 'percentage' THEN (cc.remaining_balance * amount_value / 100)
      WHEN amount_type = 'fixed' THEN amount_value
      ELSE 0
    END AS calculated_amount
  FROM payment_plan_installments ppi
  CROSS JOIN contract_calc cc
  WHERE payment_plan_id = 'REPLACE_WITH_PAYMENT_PLAN_ID_FROM_STEP_2'::UUID
    AND LOWER(COALESCE(label, '')) NOT LIKE '%deposit%'
  ORDER BY sequence
)
SELECT 
  'Manual Calculation' AS description,
  (SELECT remaining_balance FROM contract_calc) AS remaining_balance,
  (SELECT SUM(calculated_amount) FROM installment_calc) AS sum_of_installments,
  (SELECT calculated_amount FROM installment_calc ORDER BY sequence DESC LIMIT 1) AS last_installment_amount,
  (SELECT SUM(calculated_amount) FROM installment_calc WHERE sequence < (SELECT MAX(sequence) FROM installment_calc)) AS sum_of_previous,
  (SELECT remaining_balance FROM contract_calc) - (SELECT SUM(calculated_amount) FROM installment_calc WHERE sequence < (SELECT MAX(sequence) FROM installment_calc)) AS adjusted_last_installment,
  (SELECT SUM(calculated_amount) FROM installment_calc WHERE sequence < (SELECT MAX(sequence) FROM installment_calc)) + 
  ((SELECT remaining_balance FROM contract_calc) - (SELECT SUM(calculated_amount) FROM installment_calc WHERE sequence < (SELECT MAX(sequence) FROM installment_calc))) AS final_total_due;

