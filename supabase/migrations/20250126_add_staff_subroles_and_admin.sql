-- Add Staff Sub-roles and Admin Role Support
-- This migration adds staff_subrole column for UI organization and supports admin role
-- ZERO RISK: Does not modify is_staff() or any RLS policies
-- All existing functionality remains unchanged

BEGIN;

-- Step 1: Add staff_subrole column to profiles table
-- This is nullable and only used for UI/organization purposes
-- Backend RLS still uses role = 'staff' for all staff members
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS staff_subrole TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN public.profiles.staff_subrole IS 
  'Staff sub-role for UI organization (operations_manager, reservationist, accountant, front_desk). 
   Only used for display/filtering. Backend permissions still use role = ''staff''.';

-- Step 2: Add index for faster filtering by sub-role
CREATE INDEX IF NOT EXISTS idx_profiles_staff_subrole 
ON public.profiles(staff_subrole) 
WHERE staff_subrole IS NOT NULL;

-- Step 3: Create helper function to get staff sub-role (UI only, not used in RLS)
CREATE OR REPLACE FUNCTION public.get_staff_subrole(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT staff_subrole
  FROM public.profiles
  WHERE id = p_user_id
    AND role = 'staff';
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_staff_subrole(UUID) TO anon, authenticated, service_role;

-- Step 4: Create helper function to check if user is admin (UI only, not used in RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- Step 5: Create helper function to check if user is superadmin (UI only, not used in RLS)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'superadmin'
  );
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO anon, authenticated, service_role;

COMMIT;

-- Verification: Ensure is_staff() function is unchanged (should still check 'staff' and 'superadmin')
-- DO NOT MODIFY is_staff() - it's critical for 130+ RLS policies

