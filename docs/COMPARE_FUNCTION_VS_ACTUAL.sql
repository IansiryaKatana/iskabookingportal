-- Compare what the function returns vs actual payments
-- Application ID: ce0cde7e-bd47-4523-9b19-5a4019b65465

-- Step 1: What does get_payment_summary return?
SELECT 
  'Function Output' AS source,
  total_due,
  total_paid,
  remaining_balance,
  payment_count
FROM public.get_payment_summary('ce0cde7e-bd47-4523-9b19-5a4019b65465'::UUID);

-- Step 2: What are the actual payments?
SELECT 
  'Actual Payments' AS source,
  SUM(amount) AS total_paid,
  COUNT(*) AS payment_count
FROM stripe_payments
WHERE student_application_id = 'ce0cde7e-bd47-4523-9b19-5a4019b65465'::UUID
  AND payment_type = 'instalment'
  AND status = 'succeeded';

-- Step 3: What should total_due be? (Sum of installments from payment_plan_installments)
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
    ppi.sequence,
    ppi.label,
    ppi.amount_type,
    ppi.amount_value,
    CASE 
      WHEN ppi.amount_type = 'percentage' THEN (cc.remaining_balance * ppi.amount_value / 100)
      WHEN ppi.amount_type = 'fixed' THEN ppi.amount_value
      ELSE 0
    END AS calculated_amount
  FROM payment_plan_installments ppi
  CROSS JOIN contract_calc cc
  WHERE ppi.payment_plan_id = (
    SELECT selected_payment_plan_id 
    FROM student_applications 
    WHERE id = 'ce0cde7e-bd47-4523-9b19-5a4019b65465'::UUID
  )
    AND LOWER(COALESCE(ppi.label, '')) NOT LIKE '%deposit%'
  ORDER BY ppi.sequence
)
SELECT 
  'Expected Calculation' AS source,
  cc.remaining_balance AS raw_remaining_balance,
  (SELECT SUM(calculated_amount) FROM installment_calc) AS sum_of_all_installments,
  (SELECT SUM(calculated_amount) FROM installment_calc WHERE sequence < (SELECT MAX(sequence) FROM installment_calc)) AS sum_of_previous,
  (SELECT calculated_amount FROM installment_calc ORDER BY sequence DESC LIMIT 1) AS last_installment_raw,
  cc.remaining_balance - (SELECT SUM(calculated_amount) FROM installment_calc WHERE sequence < (SELECT MAX(sequence) FROM installment_calc)) AS last_installment_adjusted,
  (SELECT SUM(calculated_amount) FROM installment_calc WHERE sequence < (SELECT MAX(sequence) FROM installment_calc)) + 
  (cc.remaining_balance - (SELECT SUM(calculated_amount) FROM installment_calc WHERE sequence < (SELECT MAX(sequence) FROM installment_calc))) AS final_total_due_with_adjustment
FROM contract_calc cc;

-- Step 4: Show individual installment calculations
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
    ppi.sequence,
    ppi.label,
    ppi.amount_type,
    ppi.amount_value,
    CASE 
      WHEN ppi.amount_type = 'percentage' THEN (cc.remaining_balance * ppi.amount_value / 100)
      WHEN ppi.amount_type = 'fixed' THEN ppi.amount_value
      ELSE 0
    END AS calculated_amount,
    ROW_NUMBER() OVER (ORDER BY ppi.sequence) AS rn,
    COUNT(*) OVER () AS total_count
  FROM payment_plan_installments ppi
  CROSS JOIN contract_calc cc
  WHERE ppi.payment_plan_id = (
    SELECT selected_payment_plan_id 
    FROM student_applications 
    WHERE id = 'ce0cde7e-bd47-4523-9b19-5a4019b65465'::UUID
  )
    AND LOWER(COALESCE(ppi.label, '')) NOT LIKE '%deposit%'
  ORDER BY ppi.sequence
)
SELECT 
  ic.sequence,
  ic.label,
  ic.amount_type,
  ic.amount_value,
  ic.calculated_amount AS raw_amount,
  CASE 
    WHEN ic.rn = ic.total_count THEN 
      (SELECT remaining_balance FROM contract_calc) - 
      (SELECT SUM(calculated_amount) FROM installment_calc WHERE rn < ic.total_count)
    ELSE ic.calculated_amount
  END AS adjusted_amount,
  CASE 
    WHEN ic.rn = ic.total_count THEN '✅ Last (adjusted)'
    ELSE 'Regular'
  END AS adjustment_status
FROM installment_calc ic
ORDER BY ic.sequence;

