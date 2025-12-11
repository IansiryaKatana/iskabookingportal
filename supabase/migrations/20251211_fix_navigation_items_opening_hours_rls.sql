-- Fix Navigation Items and Opening Hours RLS Policies
-- The policies were missing WITH CHECK clauses, causing 403 errors on INSERT operations
-- This migration adds the missing WITH CHECK clauses to both tables

BEGIN;

-- Fix navigation_items policy
DROP POLICY IF EXISTS "Staff can manage navigation items" ON public.navigation_items;

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

