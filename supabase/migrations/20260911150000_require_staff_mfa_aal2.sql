-- Password-only JWTs (aal1) cannot use superadmin RPCs, update other profiles,
-- or read/write student applications as staff. Curl with a stolen password
-- still authenticates, but the token is aal1 until TOTP is verified.

CREATE OR REPLACE FUNCTION public.jwt_is_aal2()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((SELECT auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;

REVOKE ALL ON FUNCTION public.jwt_is_aal2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jwt_is_aal2() TO authenticated, service_role;

COMMENT ON FUNCTION public.jwt_is_aal2() IS
  'True when the current JWT authenticator assurance level is aal2 (password + TOTP).';

CREATE OR REPLACE FUNCTION public.require_superadmin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Forbidden: Superadmin access required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.jwt_is_aal2() THEN
    RAISE EXCEPTION 'Forbidden: Superadmin MFA (authenticator) is required'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.require_superadmin() IS
  'Raises unless the current user is superadmin with an aal2 (MFA) JWT.';

CREATE OR REPLACE FUNCTION public.can_update_profile_row(target_id uuid, target_role text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_uid uuid;
  actor_role text;
  actor_sub text;
BEGIN
  current_uid := auth.uid();
  IF current_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Own-row updates are owned by "Users update own profile".
  IF current_uid IS NOT DISTINCT FROM target_id THEN
    RETURN FALSE;
  END IF;

  IF NOT public.jwt_is_aal2() THEN
    RETURN FALSE;
  END IF;

  SELECT p.role, p.staff_subrole
  INTO actor_role, actor_sub
  FROM public.profiles p
  WHERE p.id = current_uid;

  IF actor_role IS NULL THEN
    RETURN FALSE;
  END IF;

  IF actor_role = 'superadmin' THEN
    RETURN TRUE;
  END IF;

  IF actor_role = 'admin'
     AND COALESCE(target_role, '') IS DISTINCT FROM 'superadmin' THEN
    RETURN TRUE;
  END IF;

  IF actor_role = 'staff'
     AND actor_sub IS NULL
     AND COALESCE(target_role, '') IS DISTINCT FROM 'superadmin' THEN
    RETURN TRUE;
  END IF;

  IF actor_role = 'staff'
     AND actor_sub IN ('reservationist', 'operations_manager')
     AND target_role = 'student' THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.can_update_profile_row(uuid, text) IS
  'Who may UPDATE another profiles row. Requires aal2. Housekeeper/front_desk/maintenance cannot.';

DROP POLICY IF EXISTS "Staff data access requires MFA" ON public.student_applications;

CREATE POLICY "Staff data access requires MFA"
  ON public.student_applications
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    NOT public.is_staff()
    OR public.jwt_is_aal2()
  )
  WITH CHECK (
    NOT public.is_staff()
    OR public.jwt_is_aal2()
  );

COMMENT ON POLICY "Staff data access requires MFA" ON public.student_applications IS
  'Staff/admin/superadmin JWTs must be aal2 to read or write applications. Students are unaffected.';
