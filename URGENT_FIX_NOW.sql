-- URGENT FIX: Nuclear option - recreate all student_applications policies from scratch
-- Run this IMMEDIATELY in Supabase Dashboard > SQL Editor

-- Step 1: Drop ALL existing policies on student_applications
DROP POLICY IF EXISTS "Students insert applications" ON public.student_applications;
DROP POLICY IF EXISTS "Students manage own applications" ON public.student_applications;
DROP POLICY IF EXISTS "Students update own applications" ON public.student_applications;
DROP POLICY IF EXISTS "Staff manage applications" ON public.student_applications;

-- Step 2: Restore is_staff() to working version (in case it's still broken)
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

GRANT EXECUTE ON FUNCTION public.is_staff() TO anon, authenticated, service_role;

-- Step 3: Create SIMPLE INSERT policy (students can insert their own)
CREATE POLICY "Students insert applications"
  ON public.student_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Step 4: Create SELECT policy (students see their own, staff see all)
CREATE POLICY "Students manage own applications"
  ON public.student_applications
  FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.is_staff()
  );

-- Step 5: Create UPDATE policy (students update their own, staff update all)
CREATE POLICY "Students update own applications"
  ON public.student_applications
  FOR UPDATE
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.is_staff()
  )
  WITH CHECK (
    student_id = auth.uid()
    OR public.is_staff()
  );

-- Step 6: Create staff policy (staff can do everything)
CREATE POLICY "Staff manage applications"
  ON public.student_applications
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 7: Verify policies exist
SELECT 
  policyname,
  cmd,
  CASE WHEN with_check IS NOT NULL THEN with_check ELSE 'N/A' END AS with_check
FROM pg_policies
WHERE tablename = 'student_applications'
ORDER BY policyname, cmd;

-- Step 8: Test message
SELECT 'URGENT FIX COMPLETE! Try creating an application NOW!' AS status;

