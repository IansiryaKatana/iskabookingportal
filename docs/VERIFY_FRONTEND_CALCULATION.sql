-- Verify what the frontend SHOULD calculate for this application
-- This matches the logic in useStudentPayments.ts

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
    -- Frontend calculation: (remainingBalance * amount_value) / 100 for percentage
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
),
adjusted_calc AS (
  SELECT 
    ic.sequence,
    ic.label,
    ic.calculated_amount AS raw_amount,
    -- Frontend adjustment: last installment = remaining_balance - sum_of_previous
    CASE 
      WHEN ic.rn = ic.total_count THEN 
        (SELECT remaining_balance FROM contract_calc) - 
        (SELECT COALESCE(SUM(calculated_amount), 0) FROM installment_calc WHERE rn < ic.total_count)
      ELSE ic.calculated_amount
    END AS adjusted_amount,
    CASE 
      WHEN ic.rn = ic.total_count THEN '✅ Last (adjusted)'
      ELSE 'Regular'
    END AS adjustment_status
  FROM installment_calc ic
)
SELECT 
  ac.sequence,
  ac.label,
  ac.raw_amount,
  ac.adjusted_amount AS frontend_amount,
  ac.adjustment_status,
  -- Compare with actual payment
  sp.amount AS actual_payment_amount,
  CASE 
    WHEN sp.amount IS NULL THEN 'Not paid yet'
    WHEN ABS(sp.amount - ac.adjusted_amount) < 0.01 THEN '✅ Matches'
    ELSE '❌ Mismatch'
  END AS comparison
FROM adjusted_calc ac
LEFT JOIN stripe_payments sp ON sp.student_application_id = 'ce0cde7e-bd47-4523-9b19-5a4019b65465'::UUID
  AND sp.payment_type = 'instalment'
  AND sp.status = 'succeeded'
  AND sp.metadata->>'instalment_id' = (
    SELECT id::TEXT 
    FROM payment_plan_installments 
    WHERE payment_plan_id = (
      SELECT selected_payment_plan_id 
      FROM student_applications 
      WHERE id = 'ce0cde7e-bd47-4523-9b19-5a4019b65465'::UUID
    )
    AND sequence = ac.sequence
    LIMIT 1
  )
ORDER BY ac.sequence;

-- Summary (standalone query)
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
),
adjusted_calc AS (
  SELECT 
    ic.sequence,
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
  'Summary' AS check_type,
  (SELECT remaining_balance FROM contract_calc) AS expected_total,
  (SELECT SUM(adjusted_amount) FROM adjusted_calc) AS calculated_total,
  (SELECT SUM(amount) FROM stripe_payments 
   WHERE student_application_id = 'ce0cde7e-bd47-4523-9b19-5a4019b65465'::UUID
   AND payment_type = 'instalment' AND status = 'succeeded') AS actual_paid,
  CASE 
    WHEN ABS(
      (SELECT remaining_balance FROM contract_calc) - 
      (SELECT SUM(adjusted_amount) FROM adjusted_calc)
    ) < 0.01 THEN '✅ Calculation correct'
    ELSE '❌ Calculation error'
  END AS calculation_status;

