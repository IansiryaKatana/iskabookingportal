-- URGENT ROLLBACK: Restore original is_staff() function
-- Run this SQL directly in Supabase Dashboard > SQL Editor
-- This will restore the working version and fix the broken application creation

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
    -- If anything goes wrong (e.g. RLS recursion), fail closed but without crashing policy evaluation
    RETURN FALSE;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_staff() TO anon, authenticated, service_role;

-- Verify the function works
SELECT public.is_staff() AS is_staff_check;

