-- Rebooking Feature Diagnostic Queries
-- Run these queries to diagnose why rebooking is not showing

-- 1. Check Academic Years Setup
SELECT 
  id,
  name,
  start_date,
  end_date,
  is_active,
  CASE 
    WHEN start_date > CURRENT_DATE THEN 'Future'
    WHEN start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE THEN 'Current'
    ELSE 'Past'
  END as year_status
FROM academic_years
ORDER BY start_date;

-- 2. Check Active Contracts by Academic Year
SELECT 
  ay.name as academic_year,
  ay.start_date,
  COUNT(c.id) as contract_count,
  STRING_AGG(c.name, ', ') as contract_names
FROM academic_years ay
LEFT JOIN contracts c ON c.academic_year_id = ay.id AND c.is_active = true
WHERE ay.is_active = true
GROUP BY ay.id, ay.name, ay.start_date
ORDER BY ay.start_date;

-- 3. Check Confirmed Applications (replace with actual student_id)
SELECT 
  sa.id,
  sa.student_id,
  sa.status,
  sa.created_at,
  c.name as contract_name,
  c.id as contract_id,
  ay.name as academic_year,
  ay.start_date as academic_year_start
FROM student_applications sa
INNER JOIN contracts c ON sa.contract_id = c.id
INNER JOIN academic_years ay ON c.academic_year_id = ay.id
WHERE sa.status = 'confirmed'
ORDER BY sa.created_at DESC
LIMIT 10;

-- 4. Test Rebooking Function (replace with actual student_id and contract_id)
-- First, get a student_id and contract_id from queries above, then run:
-- SELECT * FROM can_student_rebook(
--   '<STUDENT_USER_ID>'::UUID,
--   '<CONTRACT_ID>'::UUID
-- );

-- 5. Check if contracts exist for future academic years
SELECT 
  c.id,
  c.name,
  c.is_active,
  ay.name as academic_year,
  ay.start_date,
  CASE 
    WHEN ay.start_date > CURRENT_DATE THEN 'Future'
    WHEN ay.start_date <= CURRENT_DATE AND ay.end_date >= CURRENT_DATE THEN 'Current'
    ELSE 'Past'
  END as year_status
FROM contracts c
INNER JOIN academic_years ay ON c.academic_year_id = ay.id
WHERE c.is_active = true
ORDER BY ay.start_date, c.name;

-- 6. Find students with confirmed applications and their academic years
SELECT 
  sa.student_id,
  COUNT(*) as confirmed_count,
  STRING_AGG(ay.name, ', ' ORDER BY ay.start_date) as academic_years,
  MAX(ay.start_date) as latest_year_start
FROM student_applications sa
INNER JOIN contracts c ON sa.contract_id = c.id
INNER JOIN academic_years ay ON c.academic_year_id = ay.id
WHERE sa.status = 'confirmed'
GROUP BY sa.student_id
ORDER BY latest_year_start DESC;

-- 7. Check for potential rebooking opportunities
-- (Students with confirmed apps for past years, contracts available for future years)
WITH confirmed_students AS (
  SELECT DISTINCT
    sa.student_id,
    MAX(ay.start_date) as latest_confirmed_year_start
  FROM student_applications sa
  INNER JOIN contracts c ON sa.contract_id = c.id
  INNER JOIN academic_years ay ON c.academic_year_id = ay.id
  WHERE sa.status = 'confirmed'
  GROUP BY sa.student_id
),
future_contracts AS (
  SELECT 
    c.id as contract_id,
    c.name as contract_name,
    ay.id as academic_year_id,
    ay.name as academic_year,
    ay.start_date
  FROM contracts c
  INNER JOIN academic_years ay ON c.academic_year_id = ay.id
  WHERE c.is_active = true
    AND ay.start_date > CURRENT_DATE
)
SELECT 
  cs.student_id,
  cs.latest_confirmed_year_start,
  fc.contract_id,
  fc.contract_name,
  fc.academic_year,
  fc.start_date as future_year_start,
  CASE 
    WHEN fc.start_date > cs.latest_confirmed_year_start THEN '✅ Can Rebook'
    ELSE '❌ Cannot Rebook (same or past year)'
  END as rebooking_status
FROM confirmed_students cs
CROSS JOIN future_contracts fc
WHERE fc.start_date > cs.latest_confirmed_year_start
ORDER BY cs.student_id, fc.start_date;

