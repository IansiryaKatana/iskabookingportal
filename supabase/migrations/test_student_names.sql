-- Test query to verify student names are being retrieved correctly
-- Replace with actual partner_id and application_id from your data

-- Test 1: Check what's in profiles
SELECT 
  p.id as profile_id,
  p.first_name,
  p.last_name,
  sa.id as application_id
FROM profiles p
JOIN student_applications sa ON sa.student_id = p.id
JOIN partner_referrals pr ON pr.application_id = sa.id
WHERE pr.partner_id = 'cf6ff776-fcf9-4113-abf9-a817dc660f76'::uuid;

-- Test 2: Check what's in application steps
SELECT 
  sa.id as application_id,
  sas.step_number,
  sas.payload->>'first_name' as first_name_from_steps,
  sas.payload->>'last_name' as last_name_from_steps
FROM student_applications sa
JOIN partner_referrals pr ON pr.application_id = sa.id
LEFT JOIN student_application_steps sas ON sa.id = sas.application_id AND sas.step_number = 1
WHERE pr.partner_id = 'cf6ff776-fcf9-4113-abf9-a817dc660f76'::uuid;

-- Test 3: Test the function directly
SELECT 
  application_id,
  student_first_name,
  student_last_name,
  contract_name
FROM get_partner_referral_payment_summary('cf6ff776-fcf9-4113-abf9-a817dc660f76'::uuid);

