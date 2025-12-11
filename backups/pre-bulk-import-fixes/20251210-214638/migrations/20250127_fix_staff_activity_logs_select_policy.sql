-- Fix Staff Activity Logs SELECT Policy
-- Ensure staff and superadmin can read all activity logs

-- Drop existing read policy if it exists
DROP POLICY IF EXISTS "Staff read activity logs" ON public.staff_activity_logs;

-- Create a more explicit SELECT policy that works for both staff and superadmin
CREATE POLICY "Staff read activity logs" ON public.staff_activity_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('staff', 'superadmin')
    )
  );

