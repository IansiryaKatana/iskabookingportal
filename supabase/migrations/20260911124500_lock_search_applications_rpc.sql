-- search_applications_by_criteria is SECURITY DEFINER with row_security off
-- and was executable by anon. The 11 Sep 11:41 AM curl probe got HTTP 200.
-- Staff may still search after MFA; anon/password-only JWTs cannot.

REVOKE ALL ON FUNCTION public.search_applications_by_criteria(text, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.search_applications_by_criteria(text, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_applications_by_criteria(
  p_search_term text,
  p_search_type text
)
RETURNS TABLE(
  application_id uuid,
  student_name text,
  student_email text,
  studio_number text,
  studio_grade_name text,
  contract_name text,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'service_role' THEN
    IF (SELECT auth.uid()) IS NULL
       OR NOT public.is_privileged_portal_user()
       OR NOT public.jwt_is_aal2() THEN
      PERFORM public.raise_security_alert(
        'blocked_privileged_action',
        jsonb_build_object(
          'rpc', 'search_applications_by_criteria',
          'reason', 'search_without_staff_mfa'
        )
      );
      RAISE EXCEPTION 'Forbidden: Staff MFA is required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM set_config('row_security', 'off', true);

  IF p_search_type = 'student_name' THEN
    RETURN QUERY
    SELECT DISTINCT
      sa.id AS application_id,
      COALESCE(
        NULLIF(TRIM(p.first_name || ' ' || p.last_name), ''),
        NULLIF(TRIM(COALESCE(sas1.payload->>'first_name', '') || ' ' || COALESCE(sas1.payload->>'last_name', '')), ''),
        'Unknown'
      )::TEXT AS student_name,
      COALESCE(auth_user.email, '')::TEXT AS student_email,
      COALESCE(s.studio_number, '')::TEXT AS studio_number,
      COALESCE(sg.name, '')::TEXT AS studio_grade_name,
      COALESCE(c.name, '')::TEXT AS contract_name,
      sa.status::TEXT,
      sa.created_at
    FROM public.student_applications sa
    LEFT JOIN public.profiles p ON sa.student_id = p.id
    LEFT JOIN auth.users auth_user ON sa.student_id = auth_user.id
    LEFT JOIN public.studios s ON sa.assigned_studio_id = s.id
    LEFT JOIN public.studio_grades sg ON sa.studio_grade_id = sg.id
    LEFT JOIN public.contracts c ON sa.contract_id = c.id
    LEFT JOIN public.student_application_steps sas1
      ON sa.id = sas1.application_id AND sas1.step_number = 1
    WHERE
      LOWER(COALESCE(p.first_name || ' ' || p.last_name, '')) LIKE LOWER('%' || p_search_term || '%')
      OR LOWER(COALESCE(sas1.payload->>'first_name', '') || ' ' || COALESCE(sas1.payload->>'last_name', ''))
         LIKE LOWER('%' || p_search_term || '%')
    ORDER BY sa.created_at DESC;

  ELSIF p_search_type = 'studio_number' THEN
    RETURN QUERY
    SELECT DISTINCT
      sa.id AS application_id,
      COALESCE(
        NULLIF(TRIM(p.first_name || ' ' || p.last_name), ''),
        NULLIF(TRIM(COALESCE(sas1.payload->>'first_name', '') || ' ' || COALESCE(sas1.payload->>'last_name', '')), ''),
        'Unknown'
      )::TEXT AS student_name,
      COALESCE(auth_user.email, '')::TEXT AS student_email,
      COALESCE(s.studio_number, '')::TEXT AS studio_number,
      COALESCE(sg.name, '')::TEXT AS studio_grade_name,
      COALESCE(c.name, '')::TEXT AS contract_name,
      sa.status::TEXT,
      sa.created_at
    FROM public.student_applications sa
    INNER JOIN public.studios s ON sa.assigned_studio_id = s.id
    LEFT JOIN public.profiles p ON sa.student_id = p.id
    LEFT JOIN auth.users auth_user ON sa.student_id = auth_user.id
    LEFT JOIN public.studio_grades sg ON sa.studio_grade_id = sg.id
    LEFT JOIN public.contracts c ON sa.contract_id = c.id
    LEFT JOIN public.student_application_steps sas1
      ON sa.id = sas1.application_id AND sas1.step_number = 1
    WHERE LOWER(s.studio_number) LIKE LOWER('%' || p_search_term || '%')
    ORDER BY sa.created_at DESC;
  ELSE
    RAISE EXCEPTION 'Invalid search_type. Must be "student_name" or "studio_number"';
  END IF;
END;
$$;
