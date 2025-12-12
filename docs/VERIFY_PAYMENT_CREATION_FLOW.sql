-- Verify what amounts should have been created for this application
-- Application ID: ce0cde7e-bd47-4523-9b19-5a4019b65465

-- Step 1: Check if contract_payment_schedule exists (if it does, frontend uses it instead of calculating)
SELECT 
  'Schedule Check' AS check_type,
  CASE 
    WHEN EXISTS (SELECT 1 FROM contract_payment_schedule WHERE contract_id = sa.contract_id) 
    THEN '⚠️ Schedule EXISTS - Frontend will use schedule amounts (NOT calculated)'
    ELSE '✅ No Schedule - Frontend will calculate with adjustment'
  END AS result
FROM student_applications sa
WHERE sa.id = 'ce0cde7e-bd47-4523-9b19-5a4019b65465'::UUID;

-- Step 2: If schedule exists, show what amounts are in it
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
  SELECT contract_id FROM student_applications WHERE id = 'ce0cde7e-bd47-4523-9b19-5a4019b65465'::UUID
)
ORDER BY sequence;

-- Step 3: Calculate what the amounts SHOULD be (with last-installment adjustment)
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

-- Step 4: Compare with actual payments created
SELECT 
  'Actual Payments' AS source,
  sp.payment_type,
  sp.amount,
  sp.status,
  sp.created_at
FROM stripe_payments sp
WHERE sp.student_application_id = 'ce0cde7e-bd47-4523-9b19-5a4019b65465'::UUID
ORDER BY sp.created_at;

