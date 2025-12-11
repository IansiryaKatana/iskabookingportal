-- ============================================================================
-- FIX NAVIGATION ITEMS AND OPENING HOURS RLS POLICIES
-- ============================================================================
-- Run this SQL directly in Supabase Dashboard > SQL Editor
-- This fixes the 403 error when saving navigation items and opening hours
-- ============================================================================

BEGIN;

-- Fix navigation_items policy
-- Drop existing policy
DROP POLICY IF EXISTS "Staff can manage navigation items" ON public.navigation_items;

-- Recreate policy with both USING and WITH CHECK clauses
-- USING: for SELECT, UPDATE, DELETE operations
-- WITH CHECK: for INSERT and UPDATE operations
CREATE POLICY "Staff can manage navigation items" 
  ON public.navigation_items
  FOR ALL 
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Fix opening_hours policy (same issue)
DROP POLICY IF EXISTS "Staff can manage opening hours" ON public.opening_hours;

CREATE POLICY "Staff can manage opening hours" 
  ON public.opening_hours
  FOR ALL 
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Ensure grants are in place
GRANT INSERT, UPDATE, DELETE, SELECT ON public.navigation_items TO authenticated;
GRANT INSERT, UPDATE, DELETE, SELECT ON public.opening_hours TO authenticated;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Check if policies exist and are correct
SELECT 
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('navigation_items', 'opening_hours')
ORDER BY tablename, policyname;

-- Check if is_staff() function works
SELECT public.is_staff() as is_staff_result;

-- Check your current role
SELECT 
  id,
  role,
  first_name,
  last_name
FROM public.profiles
WHERE id = auth.uid();

