-- Diagnose the new Rhodium Plus application
-- Find the application ID first, then run the diagnostic

-- Step 1: Find the application ID for Rhodium Plus
SELECT 
  sa.id AS application_id,
  sa.status,
  c.name AS contract_name,
  c.weekly_price_override * c.weeks AS contract_total,
  COALESCE(c.deposit_override, pp.deposit_amount, 0) AS deposit,
  (c.weekly_price_override * c.weeks) - COALESCE(c.deposit_override, pp.deposit_amount, 0) AS expected_remaining_balance
FROM student_applications sa
INNER JOIN contracts c ON c.id = sa.contract_id
LEFT JOIN payment_plans pp ON pp.id = sa.selected_payment_plan_id
WHERE c.name LIKE '%Rhodium Plus%'
  AND sa.status = 'confirmed'
ORDER BY sa.created_at DESC
LIMIT 1;

-- Step 2: Check what get_payment_summary returns (replace APPLICATION_ID)
SELECT * FROM public.get_payment_summary('APPLICATION_ID'::UUID);

-- Step 3: Check if contract_payment_schedule exists
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
  SELECT contract_id FROM student_applications WHERE id = 'APPLICATION_ID'::UUID
)
ORDER BY sequence;

-- Step 4: Check actual payments
SELECT 
  payment_type,
  amount,
  status,
  created_at
FROM stripe_payments
WHERE student_application_id = 'APPLICATION_ID'::UUID
ORDER BY created_at;

-- Step 5: Calculate what installments should be
WITH contract_calc AS (
  SELECT 
    (c.weekly_price_override * c.weeks) AS contract_total,
    COALESCE(c.deposit_override, pp.deposit_amount, 0) AS deposit,
    (c.weekly_price_override * c.weeks) - COALESCE(c.deposit_override, pp.deposit_amount, 0) AS remaining_balance
  FROM student_applications sa
  INNER JOIN contracts c ON c.id = sa.contract_id
  LEFT JOIN payment_plans pp ON pp.id = sa.selected_payment_plan_id
  WHERE sa.id = 'APPLICATION_ID'::UUID
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
    WHERE id = 'APPLICATION_ID'::UUID
  )
    AND LOWER(COALESCE(ppi.label, '')) NOT LIKE '%deposit%'
  ORDER BY ppi.sequence
),
adjusted_calc AS (
  SELECT 
    ic.sequence,
    ic.label,
    ic.calculated_amount AS raw_amount,
    CASE 
      WHEN ic.rn = ic.total_count THEN 
        (SELECT remaining_balance FROM contract_calc) - 
        (SELECT COALESCE(SUM(calculated_amount), 0) FROM installment_calc WHERE rn < ic.total_count)
      ELSE ic.calculated_amount
    END AS adjusted_amount
  FROM installment_calc ic
)
SELECT 
  'Expected Values' AS check_type,
  (SELECT contract_total FROM contract_calc) AS contract_total,
  (SELECT deposit FROM contract_calc) AS deposit,
  (SELECT remaining_balance FROM contract_calc) AS expected_total_due,
  (SELECT SUM(adjusted_amount) FROM adjusted_calc) AS sum_of_installments,
  ABS((SELECT remaining_balance FROM contract_calc) - (SELECT SUM(adjusted_amount) FROM adjusted_calc)) AS difference;

