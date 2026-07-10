-- Fast bulk-invitations list: one query instead of N edge-function chunk calls
CREATE OR REPLACE FUNCTION public.list_bulk_invitation_applications(
  p_contract_id uuid DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  student_id uuid,
  status text,
  created_at timestamptz,
  contract_id uuid,
  contract_name text,
  academic_year_id uuid,
  academic_year_name text,
  student_email text,
  student_name text,
  account_status text,
  invitation_sent_at timestamptz,
  invitation_expires_at timestamptz,
  must_change_password boolean,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Forbidden: staff access required';
  END IF;

  RETURN QUERY
  SELECT
    sa.id,
    sa.student_id,
    sa.status::text,
    sa.created_at,
    sa.contract_id,
    c.name AS contract_name,
    c.academic_year_id,
    ay.name AS academic_year_name,
    COALESCE(
      NULLIF(TRIM(s2.payload->>'email'), ''),
      u.email,
      p.email,
      ''
    ) AS student_email,
    NULLIF(
      TRIM(
        CONCAT_WS(
          ' ',
          COALESCE(NULLIF(TRIM(s2.payload->>'first_name'), ''), p.first_name),
          COALESCE(NULLIF(TRIM(s2.payload->>'last_name'), ''), p.last_name)
        )
      ),
      ''
    ) AS student_name,
    CASE
      WHEN COALESCE(u.raw_user_meta_data->>'account_status', '') IN (
        'pending_activation', 'invited', 'activated', 'active'
      ) THEN u.raw_user_meta_data->>'account_status'
      WHEN u.last_sign_in_at IS NOT NULL THEN 'activated'
      ELSE 'pending_activation'
    END AS account_status,
    NULLIF(u.raw_user_meta_data->>'invitation_sent_at', '')::timestamptz AS invitation_sent_at,
    NULLIF(u.raw_user_meta_data->>'invitation_expires_at', '')::timestamptz AS invitation_expires_at,
    COALESCE((u.raw_app_meta_data->>'must_change_password')::boolean, false) AS must_change_password,
    u.last_sign_in_at
  FROM public.student_applications sa
  LEFT JOIN public.contracts c ON c.id = sa.contract_id
  LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
  LEFT JOIN public.profiles p ON p.id = sa.student_id
  LEFT JOIN auth.users u ON u.id = sa.student_id
  LEFT JOIN LATERAL (
    SELECT steps.payload
    FROM public.student_application_steps steps
    WHERE steps.application_id = sa.id
      AND steps.step_number = 2
    ORDER BY steps.updated_at DESC NULLS LAST
    LIMIT 1
  ) s2 ON true
  WHERE (p_contract_id IS NULL OR sa.contract_id = p_contract_id)
    AND (p_academic_year_id IS NULL OR c.academic_year_id = p_academic_year_id)
  ORDER BY sa.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_bulk_invitation_applications(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_bulk_invitation_applications(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_bulk_invitation_applications(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.list_bulk_invitation_applications(uuid, uuid) IS
  'Staff-only: list applications with invitation/account metadata for Bulk Invitations page.';
