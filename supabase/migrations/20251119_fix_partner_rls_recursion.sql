-- Fix RLS recursion issue with is_partner() and get_partner_id() functions
-- These functions query profiles table, which has RLS policies that call them,
-- creating infinite recursion. Use SECURITY DEFINER to bypass RLS.

-- Fix is_partner() to bypass RLS
CREATE OR REPLACE FUNCTION public.is_partner()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_uid UUID;
BEGIN
  current_uid := auth.uid();

  IF current_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = current_uid
      AND p.role = 'partner'
  );
EXCEPTION
  WHEN OTHERS THEN
    -- If anything goes wrong (e.g. RLS recursion), fail closed but without crashing policy evaluation
    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_partner() TO anon, authenticated, service_role;

-- Fix get_partner_id() to bypass RLS
CREATE OR REPLACE FUNCTION public.get_partner_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_uid UUID;
  v_partner_id UUID;
BEGIN
  current_uid := auth.uid();

  IF current_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT partner_id INTO v_partner_id
  FROM public.profiles
  WHERE id = current_uid
    AND role = 'partner';

  RETURN v_partner_id;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_partner_id() TO anon, authenticated, service_role;

-- Fix the "Partners can view own profile" policy
-- Now that is_partner() uses SECURITY DEFINER, it's safe to use in policies
-- The function will bypass RLS when checking the profiles table
DROP POLICY IF EXISTS "Partners can view own profile" ON public.profiles;
CREATE POLICY "Partners can view own profile" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.is_partner()
  );

