-- Diagnose why remaining balance shows £99.00 when all payments are marked as paid
-- This will help identify if deposit is being counted in total_due

-- Step 1: Get the application ID (replace with your application ID)
-- SELECT id, contract_id, selected_payment_plan_id 
-- FROM student_applications 
-- WHERE id = 'YOUR_APPLICATION_ID'::UUID;

-- Step 2: Check what's in contract_payment_schedule
SELECT 
  sequence,
  label,
  amount,
  CASE 
    WHEN LOWER(COALESCE(label, '')) LIKE '%deposit%' THEN '❌ DEPOSIT (should be excluded)'
    ELSE '✅ INSTALLMENT'
  END AS type
FROM contract_payment_schedule
WHERE contract_id = (
  SELECT contract_id FROM student_applications 
  WHERE id = 'YOUR_APPLICATION_ID'::UUID
)
ORDER BY sequence;

-- Step 3: Check what get_payment_summary returns
SELECT * FROM get_payment_summary('YOUR_APPLICATION_ID'::UUID);

-- Step 4: Check actual payments
SELECT 
  payment_metadata->>'type' AS payment_type,
  installment_number,
  amount_paid,
  payment_status,
  payment_date
FROM unified_payment_history
WHERE student_application_id = 'YOUR_APPLICATION_ID'::UUID
ORDER BY payment_date;

-- Step 5: Manual calculation
WITH contract_calc AS (
  SELECT 
    c.weekly_price_override,
    c.weeks,
    c.deposit_override,
    COALESCE(c.weekly_price_override, sgp.weekly_price, 0) AS weekly_price,
    COALESCE(c.deposit_override, pp.deposit_amount, sgp.deposit_amount_override, 0) AS deposit
  FROM student_applications sa
  INNER JOIN contracts c ON c.id = sa.contract_id
  LEFT JOIN payment_plans pp ON pp.id = sa.selected_payment_plan_id
  LEFT JOIN studio_grade_prices sgp ON sgp.academic_year_id = c.academic_year_id
    AND sgp.studio_grade_id = c.studio_grade_id
    AND sgp.is_active = true
  WHERE sa.id = 'YOUR_APPLICATION_ID'::UUID
),
schedule_check AS (
  SELECT 
    SUM(CASE WHEN LOWER(COALESCE(label, '')) NOT LIKE '%deposit%' THEN amount ELSE 0 END) AS installments_total,
    SUM(amount) AS total_including_deposit,
    COUNT(CASE WHEN LOWER(COALESCE(label, '')) LIKE '%deposit%' THEN 1 END) AS deposit_count
  FROM contract_payment_schedule
  WHERE contract_id = (SELECT contract_id FROM student_applications WHERE id = 'YOUR_APPLICATION_ID'::UUID)
),
payments_check AS (
  SELECT 
    SUM(CASE WHEN COALESCE(payment_metadata->>'type', '') != 'deposit' THEN amount_paid ELSE 0 END) AS installments_paid,
    SUM(amount_paid) AS total_paid_including_deposit
  FROM unified_payment_history
  WHERE student_application_id = 'YOUR_APPLICATION_ID'::UUID
    AND payment_status IN ('succeeded', 'completed')
)
SELECT 
  cc.weekly_price * cc.weeks AS contract_total,
  cc.deposit AS deposit_amount,
  (cc.weekly_price * cc.weeks) - cc.deposit AS expected_remaining_balance,
  sc.installments_total AS installments_in_schedule,
  sc.total_including_deposit AS total_in_schedule_including_deposit,
  sc.deposit_count,
  pc.installments_paid AS installments_actually_paid,
  pc.total_paid_including_deposit AS total_paid_including_deposit,
  sc.installments_total - pc.installments_paid AS difference,
  (SELECT remaining_balance FROM get_payment_summary('YOUR_APPLICATION_ID'::UUID)) AS function_remaining_balance
FROM contract_calc cc
CROSS JOIN schedule_check sc
CROSS JOIN payments_check pc;

