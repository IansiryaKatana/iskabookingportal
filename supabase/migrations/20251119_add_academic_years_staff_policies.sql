-- Add RLS policies for staff to manage academic years
-- This allows staff to create, update, and delete academic years

BEGIN;

-- Drop existing read-only policy if it exists (we'll recreate it)
DROP POLICY IF EXISTS "Public read academic years" ON public.academic_years;

-- Allow public read access
CREATE POLICY "Public read academic years" ON public.academic_years
  FOR SELECT USING (true);

-- Allow staff to manage academic years (insert, update, delete)
CREATE POLICY "Staff manage academic years" ON public.academic_years
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

COMMIT;

