-- Analyze the installment calculation for the Rhodium Plus application
-- This will show us exactly what's happening

-- Step 1: Find the application
SELECT 
  sa.id AS application_id,
  sa.contract_id,
  c.name AS contract_name,
  c.weekly_price_override * c.weeks AS contract_total,
  COALESCE(c.deposit_override, pp.deposit_amount, 0) AS deposit,
  (c.weekly_price_override * c.weeks) - COALESCE(c.deposit_override, pp.deposit_amount, 0) AS expected_remaining_balance,
  sa.selected_payment_plan_id
FROM student_applications sa
INNER JOIN contracts c ON c.id = sa.contract_id
LEFT JOIN payment_plans pp ON pp.id = sa.selected_payment_plan_id
WHERE c.name LIKE '%Rhodium Plus%'
  AND sa.status = 'confirmed'
ORDER BY sa.created_at DESC
LIMIT 1;

-- Step 2: Check payment plan installments
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
WHERE payment_plan_id = (
  SELECT selected_payment_plan_id 
  FROM student_applications sa
  INNER JOIN contracts c ON c.id = sa.contract_id
  WHERE c.name LIKE '%Rhodium Plus%'
    AND sa.status = 'confirmed'
  ORDER BY sa.created_at DESC
  LIMIT 1
)
ORDER BY sequence;

-- Step 3: Calculate what installments SHOULD be (with last-installment adjustment)
WITH contract_calc AS (
  SELECT 
    (c.weekly_price_override * c.weeks) AS contract_total,
    COALESCE(c.deposit_override, pp.deposit_amount, 0) AS deposit,
    (c.weekly_price_override * c.weeks) - COALESCE(c.deposit_override, pp.deposit_amount, 0) AS remaining_balance
  FROM student_applications sa
  INNER JOIN contracts c ON c.id = sa.contract_id
  LEFT JOIN payment_plans pp ON pp.id = sa.selected_payment_plan_id
  WHERE c.name LIKE '%Rhodium Plus%'
    AND sa.status = 'confirmed'
  ORDER BY sa.created_at DESC
  LIMIT 1
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
    FROM student_applications sa
    INNER JOIN contracts c ON c.id = sa.contract_id
    WHERE c.name LIKE '%Rhodium Plus%'
      AND sa.status = 'confirmed'
    ORDER BY sa.created_at DESC
    LIMIT 1
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
  ac.sequence,
  ac.label,
  ac.raw_amount,
  ac.adjusted_amount AS expected_amount,
  CASE 
    WHEN ac.rn = (SELECT MAX(rn) FROM adjusted_calc) THEN '✅ Last (adjusted)'
    ELSE 'Regular'
  END AS adjustment_status
FROM adjusted_calc ac
ORDER BY ac.sequence;

-- Step 4: Check what get_payment_summary returns
SELECT * FROM public.get_payment_summary((
  SELECT sa.id
  FROM student_applications sa
  INNER JOIN contracts c ON c.id = sa.contract_id
  WHERE c.name LIKE '%Rhodium Plus%'
    AND sa.status = 'confirmed'
  ORDER BY sa.created_at DESC
  LIMIT 1
)::UUID);

