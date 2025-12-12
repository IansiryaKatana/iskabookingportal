-- Find Payment Plan ID from Application ID

-- METHOD 1: Get payment plan ID directly from application (EASIEST)
-- Replace 'YOUR_APPLICATION_ID' with your actual application ID
SELECT 
  sa.id AS application_id,
  sa.selected_payment_plan_id AS payment_plan_id,
  pp.name AS payment_plan_name,
  pp.deposit_amount,
  c.name AS contract_name,
  p.first_name || ' ' || p.last_name AS student_name
FROM student_applications sa
LEFT JOIN payment_plans pp ON pp.id = sa.selected_payment_plan_id
LEFT JOIN contracts c ON c.id = sa.contract_id
LEFT JOIN profiles p ON p.id = sa.student_id
WHERE sa.id = 'YOUR_APPLICATION_ID'::UUID;  -- REPLACE THIS

-- METHOD 2: If you know the contract, find all applications with their payment plans
-- Replace 'YOUR_CONTRACT_ID' with your contract ID
SELECT 
  sa.id AS application_id,
  sa.selected_payment_plan_id AS payment_plan_id,
  pp.name AS payment_plan_name,
  p.first_name || ' ' || p.last_name AS student_name
FROM student_applications sa
LEFT JOIN payment_plans pp ON pp.id = sa.selected_payment_plan_id
LEFT JOIN profiles p ON p.id = sa.student_id
WHERE sa.contract_id = 'YOUR_CONTRACT_ID'::UUID;  -- REPLACE THIS

-- METHOD 3: List all payment plans (if you want to browse)
SELECT 
  id AS payment_plan_id,
  name AS payment_plan_name,
  deposit_amount,
  academic_year_id,
  is_active
FROM payment_plans
ORDER BY name
LIMIT 20;

