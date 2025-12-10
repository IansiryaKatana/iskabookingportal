-- URGENT FIX: Restore the ORIGINAL working is_staff() function
-- This is the exact version from 20250311_is_staff_fix.sql that was working
-- Run this in Supabase Dashboard > SQL Editor

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

-- Test the function (should return true if you're staff, false otherwise)
SELECT public.is_staff() AS is_staff_check;

