-- Fix profiles RLS policies to allow staff to update any profile
-- while still allowing users to update their own profile
--
-- Problem: The "Users update own profile" policy was too restrictive,
-- preventing staff from updating other users' profiles even though
-- "Staff manage profiles" should allow it.
--
-- Solution: Update the policy to allow staff to bypass the restriction

-- Drop the conflicting policy
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

-- Recreate with staff bypass
-- This allows:
-- 1. Users to update their own profile (auth.uid() = id)
-- 2. Staff/superadmin to update any profile (public.is_staff())
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

COMMENT ON POLICY "Users update own profile" ON public.profiles IS
  'Allows users to update their own profile OR staff/superadmin to update any profile';

