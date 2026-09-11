-- Stop students (and staff) from changing their own role via the Data API.
-- "Users update own profile" previously allowed:
--   USING/WITH CHECK (auth.uid() = id OR is_staff())
-- with no restriction on the role column. Postgres RLS is OR'd, so that
-- policy let a normal signup PATCH profiles.role = 'superadmin'.

CREATE OR REPLACE FUNCTION public.enforce_profile_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.staff_subrole IS NOT DISTINCT FROM OLD.staff_subrole THEN
    RETURN NEW;
  END IF;

  -- Never allow changing your own access, even if already privileged.
  IF auth.uid() IS NOT DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'You cannot change your own role or staff access'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_superadmin() THEN
    RETURN NEW;
  END IF;

  -- Admins may change non-superadmin users, but cannot grant or edit superadmin.
  IF public.is_admin()
     AND COALESCE(OLD.role, '') IS DISTINCT FROM 'superadmin'
     AND COALESCE(NEW.role, '') IS DISTINCT FROM 'superadmin' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'You are not allowed to change user roles'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_role_changes ON public.profiles;
CREATE TRIGGER enforce_profile_role_changes
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_role_changes();

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

-- Own-row updates only (name, etc.). Role changes are enforced by the trigger.
-- Staff updating *other* users continues to use "Staff manage profiles".
CREATE POLICY "Users update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

COMMENT ON POLICY "Users update own profile" ON public.profiles IS
  'Users may update their own profile row only. Role and staff_subrole changes are blocked by enforce_profile_role_changes().';

COMMENT ON FUNCTION public.enforce_profile_role_changes() IS
  'Blocks self-escalation. Only superadmin (or admin for non-superadmin users) may change another user''s role.';
