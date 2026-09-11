-- Housekeepers / front desk / other operational subroles currently pass
-- "Staff manage profiles" (FOR ALL) because is_staff_role_only() is role='staff'.
-- That lets them PATCH other people's names (and any non-role column).
--
-- Keep SELECT of other profiles (rosters, applications, reports).
-- Own-row updates stay on "Users update own profile".
-- User Management (admin/superadmin/unscoped staff) can still update others.
-- Reservationist / operations manager may still sync student names from the
-- application wizard. Insert/delete stay on manage-users (service role) /
-- superadmin insert policy.

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

  -- User Management: staff with no operational subrole.
  IF actor_role = 'staff'
     AND actor_sub IS NULL
     AND COALESCE(target_role, '') IS DISTINCT FROM 'superadmin' THEN
    RETURN TRUE;
  END IF;

  -- Booking staff filling application personal details (student name sync).
  IF actor_role = 'staff'
     AND actor_sub IN ('reservationist', 'operations_manager')
     AND target_role = 'student' THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.can_update_profile_row(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_update_profile_row(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_update_profile_row(uuid, text) IS
  'Who may UPDATE another profiles row. Housekeeper/front_desk/maintenance cannot. Reservationist/ops manager may update student rows only.';

DROP POLICY IF EXISTS "Staff manage profiles" ON public.profiles;

CREATE POLICY "Staff update other profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.can_update_profile_row(id, role))
  WITH CHECK (public.can_update_profile_row(id, role));

COMMENT ON POLICY "Staff update other profiles" ON public.profiles IS
  'Other-row profile updates: superadmin/admin/unscoped staff, plus reservationist/ops manager on student rows only.';
