-- Fix Staff Activity Logs RLS Policy
-- The insert policy might have issues with RLS recursion or the is_staff() function
-- This migration ensures staff can insert activity logs properly

-- Drop existing insert policy if it exists
DROP POLICY IF EXISTS "Staff insert activity logs" ON public.staff_activity_logs;

-- Create a more explicit insert policy
-- The issue might be RLS recursion with is_staff(), so we make it more explicit
CREATE POLICY "Staff insert activity logs" ON public.staff_activity_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    staff_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('staff', 'superadmin')
    )
  );

-- Alternative: Create a function that bypasses RLS for inserts
-- This ensures activity logging always works for staff
CREATE OR REPLACE FUNCTION public.log_staff_activity(
  p_action TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  -- Verify user is staff
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can log activities';
  END IF;

  -- Insert the log
  INSERT INTO public.staff_activity_logs (
    staff_id,
    action,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    p_payload
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.log_staff_activity TO authenticated;

