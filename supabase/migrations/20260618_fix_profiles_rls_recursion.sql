-- SECURITY DEFINER helpers avoid RLS recursion when policies check profile roles.
CREATE OR REPLACE FUNCTION public.is_staff_role_only()
RETURNS boolean
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
      AND p.role = 'staff'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_staff_role_only() TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR public.is_superadmin()
    OR (public.is_admin() AND role <> 'superadmin')
    OR public.is_staff_role_only()
  );

DROP POLICY IF EXISTS "Staff manage profiles" ON public.profiles;
CREATE POLICY "Staff manage profiles" ON public.profiles
  FOR ALL
  TO authenticated
  USING (
    public.is_superadmin()
    OR (public.is_admin() AND role <> 'superadmin')
    OR public.is_staff_role_only()
  )
  WITH CHECK (
    public.is_superadmin()
    OR (public.is_admin() AND role <> 'superadmin')
    OR public.is_staff_role_only()
  );
