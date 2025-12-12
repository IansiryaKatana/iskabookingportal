-- Check why the existing Rhodium Plus application still shows wrong values
-- This will help us understand if contract_payment_schedule is interfering

-- Step 1: Find the application
SELECT 
  sa.id AS application_id,
  sa.contract_id,
  c.name AS contract_name,
  sa.selected_payment_plan_id
FROM student_applications sa
INNER JOIN contracts c ON c.id = sa.contract_id
WHERE c.name LIKE '%Rhodium Plus%'
  AND sa.status = 'confirmed'
ORDER BY sa.created_at DESC
LIMIT 1;

-- Step 2: Check if contract_payment_schedule exists
SELECT 
  'Schedule Check' AS check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM contract_payment_schedule 
      WHERE contract_id = (
        SELECT contract_id FROM student_applications sa
        INNER JOIN contracts c ON c.id = sa.contract_id
        WHERE c.name LIKE '%Rhodium Plus%' AND sa.status = 'confirmed'
        ORDER BY sa.created_at DESC LIMIT 1
      )
    ) THEN '⚠️ Schedule EXISTS - Frontend will use schedule amounts (bypasses calculation)'
    ELSE '✅ No Schedule - Frontend will calculate with fix'
  END AS result;

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
  SELECT contract_id FROM student_applications sa
  INNER JOIN contracts c ON c.id = sa.contract_id
  WHERE c.name LIKE '%Rhodium Plus%' AND sa.status = 'confirmed'
  ORDER BY sa.created_at DESC LIMIT 1
)
ORDER BY sequence;

-- Step 4: Check contract deposit override
SELECT 
  c.deposit_override AS contract_deposit_override,
  pp.deposit_amount AS payment_plan_deposit,
  sgp.deposit_amount_override AS grade_deposit_override,
  COALESCE(c.deposit_override, pp.deposit_amount, sgp.deposit_amount_override, 0) AS expected_deposit
FROM student_applications sa
INNER JOIN contracts c ON c.id = sa.contract_id
LEFT JOIN payment_plans pp ON pp.id = sa.selected_payment_plan_id
LEFT JOIN studio_grade_prices sgp ON sgp.academic_year_id = c.academic_year_id
  AND sgp.studio_grade_id = c.studio_grade_id
  AND sgp.is_active = true
WHERE c.name LIKE '%Rhodium Plus%'
  AND sa.status = 'confirmed'
ORDER BY sa.created_at DESC
LIMIT 1;

