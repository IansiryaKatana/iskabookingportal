-- Fix contract_payment_plans RLS and grants
-- Ensure staff can properly manage contract payment plans

-- Grant necessary privileges (missing from original migration)
GRANT SELECT ON public.contract_payment_plans TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.contract_payment_plans TO authenticated;

-- Ensure the is_staff() function is working correctly
-- Recreate it with SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.is_staff()
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
      AND p.role IN ('staff', 'superadmin')
  );
EXCEPTION
  WHEN OTHERS THEN
    -- If anything goes wrong (e.g. RLS recursion), fail closed but without crashing policy evaluation
    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_staff() TO anon, authenticated, service_role;

-- Ensure RLS policies are correct
DROP POLICY IF EXISTS "Public read contract payment plans" ON public.contract_payment_plans;
CREATE POLICY "Public read contract payment plans"
  ON public.contract_payment_plans
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Staff manage contract payment plans" ON public.contract_payment_plans;
CREATE POLICY "Staff manage contract payment plans"
  ON public.contract_payment_plans
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

