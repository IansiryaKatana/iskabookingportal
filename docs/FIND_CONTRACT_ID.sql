-- Easy ways to find your Contract ID

-- METHOD 1: Search by contract name (easiest)
-- Replace 'platinum' with any part of your contract name
SELECT 
  id AS contract_id,
  name AS contract_name,
  slug,
  academic_year_id
FROM contracts
WHERE name ILIKE '%platinum%'  -- Change this to match your contract
   OR slug ILIKE '%platinum%'  -- Or search by slug
ORDER BY name;

-- METHOD 2: Find by application ID (if you have the application ID from the payment page)
-- Replace 'YOUR_APPLICATION_ID' with the application ID
SELECT 
  sa.id AS application_id,
  sa.contract_id,
  c.name AS contract_name,
  c.slug,
  p.first_name || ' ' || p.last_name AS student_name
FROM student_applications sa
INNER JOIN contracts c ON c.id = sa.contract_id
INNER JOIN profiles p ON p.id = sa.student_id
WHERE sa.id = 'YOUR_APPLICATION_ID'::UUID;  -- Replace this

-- METHOD 3: List all contracts (if you want to browse)
SELECT 
  id AS contract_id,
  name AS contract_name,
  slug,
  academic_year_id,
  created_at
FROM contracts
ORDER BY name
LIMIT 20;

-- METHOD 4: Find by student email (if you know the student)
-- Replace 'student@email.com' with the student's email
SELECT 
  sa.id AS application_id,
  sa.contract_id,
  c.name AS contract_name,
  c.slug,
  p.email AS student_email
FROM student_applications sa
INNER JOIN contracts c ON c.id = sa.contract_id
INNER JOIN profiles p ON p.id = sa.student_id
WHERE p.email = 'student@email.com';  -- Replace this

