-- Lock destructive application-delete RPCs the same way as export/import/bulk-import:
-- superadmin only. Do not rewrite deletion logic; wrap the existing functions.
--
-- Exception (workflow): admin Application Detail "Discard draft" calls
-- delete_student_application. Staff/admin may still delete *draft* applications
-- only. Confirmed/other statuses remain superadmin-only.

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
END;
$$;

REVOKE ALL ON FUNCTION public.require_superadmin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.require_superadmin() TO authenticated, service_role;

COMMENT ON FUNCTION public.require_superadmin() IS
  'Raises insufficient_privilege unless the current user is superadmin. Used by destructive RPCs.';

ALTER FUNCTION public.delete_all_student_applications(boolean)
  RENAME TO delete_all_student_applications_impl;

ALTER FUNCTION public.delete_applications_by_ids(uuid[], boolean)
  RENAME TO delete_applications_by_ids_impl;

ALTER FUNCTION public.delete_student_application(uuid)
  RENAME TO delete_student_application_impl;

ALTER FUNCTION public.delete_student_applications_by_academic_year(uuid, boolean)
  RENAME TO delete_student_applications_by_academic_year_legacy_impl;

ALTER FUNCTION public.delete_student_applications_by_academic_year(uuid, boolean, boolean, boolean)
  RENAME TO delete_student_applications_by_academic_year_impl;

REVOKE ALL ON FUNCTION public.delete_all_student_applications_impl(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_applications_by_ids_impl(uuid[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_student_application_impl(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_student_applications_by_academic_year_legacy_impl(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_student_applications_by_academic_year_impl(uuid, boolean, boolean, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.delete_all_student_applications_impl(boolean) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_applications_by_ids_impl(uuid[], boolean) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_student_application_impl(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_student_applications_by_academic_year_legacy_impl(uuid, boolean) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_student_applications_by_academic_year_impl(uuid, boolean, boolean, boolean) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_all_student_applications(
  p_delete_orphaned_users boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_superadmin();
  RETURN public.delete_all_student_applications_impl(p_delete_orphaned_users);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_applications_by_ids(
  p_application_ids uuid[],
  p_delete_orphaned_users boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_superadmin();
  RETURN public.delete_applications_by_ids_impl(p_application_ids, p_delete_orphaned_users);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_student_applications_by_academic_year(
  p_academic_year_id uuid,
  p_delete_orphaned_users boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_superadmin();
  RETURN public.delete_student_applications_by_academic_year_legacy_impl(
    p_academic_year_id,
    p_delete_orphaned_users
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_student_applications_by_academic_year(
  p_academic_year_id uuid,
  p_delete_applications boolean DEFAULT true,
  p_delete_custom_contracts_and_plans boolean DEFAULT false,
  p_delete_orphaned_contracts_and_plans boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_superadmin();
  RETURN public.delete_student_applications_by_academic_year_impl(
    p_academic_year_id,
    p_delete_applications,
    p_delete_custom_contracts_and_plans,
    p_delete_orphaned_contracts_and_plans
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_student_application(p_application_id uuid)
RETURNS TABLE(deleted_tables jsonb, total_deleted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_superadmin() THEN
    NULL;
  ELSIF public.is_staff() THEN
    -- Staff discard-draft workflow only. Bulk/confirmed deletes stay superadmin.
    IF NOT EXISTS (
      SELECT 1
      FROM public.student_applications
      WHERE id = p_application_id
        AND status = 'draft'
    ) THEN
      RAISE EXCEPTION 'Forbidden: Superadmin access required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Forbidden: Superadmin access required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.delete_student_application_impl(p_application_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_all_student_applications(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_applications_by_ids(uuid[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_student_application(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_student_applications_by_academic_year(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_student_applications_by_academic_year(uuid, boolean, boolean, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.delete_all_student_applications(boolean) FROM anon;
REVOKE ALL ON FUNCTION public.delete_applications_by_ids(uuid[], boolean) FROM anon;
REVOKE ALL ON FUNCTION public.delete_student_application(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_student_applications_by_academic_year(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.delete_student_applications_by_academic_year(uuid, boolean, boolean, boolean) FROM anon;

GRANT EXECUTE ON FUNCTION public.delete_all_student_applications(boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_applications_by_ids(uuid[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_student_application(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_student_applications_by_academic_year(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_student_applications_by_academic_year(uuid, boolean, boolean, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.delete_all_student_applications(boolean) IS
  'Deletes all student applications. Superadmin only.';
COMMENT ON FUNCTION public.delete_applications_by_ids(uuid[], boolean) IS
  'Deletes selected student applications. Superadmin only.';
COMMENT ON FUNCTION public.delete_student_applications_by_academic_year(uuid, boolean) IS
  'Legacy academic-year application delete. Superadmin only.';
COMMENT ON FUNCTION public.delete_student_applications_by_academic_year(uuid, boolean, boolean, boolean) IS
  'Deletes applications (and optional contracts) for an academic year. Superadmin only.';
COMMENT ON FUNCTION public.delete_student_application(uuid) IS
  'Deletes one application. Superadmin may delete any status; staff/admin may discard drafts only.';

NOTIFY pgrst, 'reload schema';
