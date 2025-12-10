-- DIAGNOSTIC AND FIX: Check if profiles update policy is interfering
-- Run this ENTIRE script in Supabase Dashboard > SQL Editor

-- Step 1: Check current is_staff() function definition
SELECT 
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'is_staff';

-- Step 2: Test is_staff() function (should return true/false, not error)
SELECT 
  public.is_staff() AS is_staff_result,
  auth.uid() AS current_user_id;

-- Step 3: Check ALL policies on student_applications
SELECT 
  policyname,
  cmd,
  qual AS using_clause,
  with_check AS with_check_clause
FROM pg_policies
WHERE tablename = 'student_applications'
ORDER BY policyname, cmd;

-- Step 4: Check profiles policies (especially the update one)
SELECT 
  policyname,
  cmd,
  qual AS using_clause,
  with_check AS with_check_clause
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname, cmd;

-- Step 5: TEMPORARILY drop the profiles update policy to test
-- (We'll recreate it after fixing is_staff())
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

-- Step 6: Restore is_staff() to ORIGINAL working version
-- Using DROP and CREATE to ensure clean slate
DROP FUNCTION IF EXISTS public.is_staff() CASCADE;

CREATE FUNCTION public.is_staff()
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

-- Step 7: Grant permissions
GRANT EXECUTE ON FUNCTION public.is_staff() TO anon, authenticated, service_role;

-- Step 8: Test is_staff() again
SELECT 
  public.is_staff() AS is_staff_after_fix,
  'Function restored' AS status;

-- Step 9: Recreate student_applications INSERT policy (clean slate)
DROP POLICY IF EXISTS "Students insert applications" ON public.student_applications;

CREATE POLICY "Students insert applications"
  ON public.student_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Step 10: Recreate profiles update policy with the fix
-- This allows users to update their own profile OR staff to update any profile
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE 
  USING (
    auth.uid() = id
    OR public.is_staff()
  )
  WITH CHECK (
    auth.uid() = id
    OR public.is_staff()
  );

-- Step 11: Verify policies are correct
SELECT 
  'student_applications policies:' AS check_type,
  policyname,
  cmd,
  CASE WHEN with_check IS NOT NULL THEN with_check ELSE 'N/A' END AS with_check
FROM pg_policies
WHERE tablename = 'student_applications' 
  AND policyname = 'Students insert applications'

UNION ALL

SELECT 
  'profiles policies:' AS check_type,
  policyname,
  cmd,
  CASE WHEN with_check IS NOT NULL THEN with_check ELSE 'N/A' END AS with_check
FROM pg_policies
WHERE tablename = 'profiles' 
  AND policyname = 'Users update own profile';

-- Step 12: Final status
SELECT 'Fix complete! Try creating an application now.' AS final_status;

