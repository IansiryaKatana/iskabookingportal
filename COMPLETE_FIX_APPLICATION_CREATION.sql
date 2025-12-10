-- COMPLETE FIX: Restore is_staff() and verify RLS policies
-- Run this ENTIRE script in Supabase Dashboard > SQL Editor

-- Step 1: Restore the ORIGINAL working is_staff() function
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_uid uuid;
BEGIN
  current_uid := auth.uid();

  IF current_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = current_uid
      AND p.role IN ('staff', 'superadmin')
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

-- Step 2: Grant permissions
GRANT EXECUTE ON FUNCTION public.is_staff() TO anon, authenticated, service_role;

-- Step 3: Verify the function works (should return true/false, not error)
SELECT public.is_staff() AS is_staff_check;

-- Step 4: Check current RLS policies on student_applications
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'student_applications'
ORDER BY policyname;

-- Step 5: Ensure the INSERT policy is correct
-- Drop and recreate to ensure it's not corrupted
DROP POLICY IF EXISTS "Students insert applications" ON public.student_applications;

CREATE POLICY "Students insert applications"
  ON public.student_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Step 6: Verify the policy was created
SELECT 
  policyname,
  cmd,
  with_check
FROM pg_policies
WHERE tablename = 'student_applications' 
  AND policyname = 'Students insert applications';

-- Step 7: Test message
SELECT 'Fix complete! Try creating an application now.' AS status;

