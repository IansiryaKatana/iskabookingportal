-- QUICK FIX: Recreate partners RLS policies
-- Run this in Supabase Dashboard > SQL Editor

-- Step 1: Verify is_staff() is working
SELECT 
  public.is_staff() AS is_staff_check,
  auth.uid() AS current_user_id;

-- Step 2: Check current partners policies
SELECT 
  policyname,
  cmd,
  qual AS using_clause,
  with_check AS with_check_clause
FROM pg_policies
WHERE tablename = 'partners'
ORDER BY policyname, cmd;

-- Step 3: Drop and recreate partners policies
DROP POLICY IF EXISTS "Staff can view all partners" ON public.partners;
DROP POLICY IF EXISTS "Staff can manage partners" ON public.partners;
DROP POLICY IF EXISTS "Partners can view own partner record" ON public.partners;

-- Step 4: Recreate staff policies
CREATE POLICY "Staff can view all partners" ON public.partners
  FOR SELECT USING (public.is_staff());

CREATE POLICY "Staff can manage partners" ON public.partners
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 5: Recreate partner view policy (if get_partner_id function exists)
CREATE POLICY "Partners can view own partner record" ON public.partners
  FOR SELECT USING (
    id = public.get_partner_id()
  );

-- Step 6: Verify policies were created
SELECT 
  policyname,
  cmd,
  CASE WHEN with_check IS NOT NULL THEN with_check ELSE 'N/A' END AS with_check
FROM pg_policies
WHERE tablename = 'partners'
ORDER BY policyname, cmd;

-- Step 7: Test message
SELECT 'Partners RLS policies fixed! Try creating a partner now.' AS status;

