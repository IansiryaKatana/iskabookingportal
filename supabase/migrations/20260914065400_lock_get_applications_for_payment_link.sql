-- 14 Sep 2026: curl dumped 688 student names/emails via
-- get_applications_for_payment_link (no auth check, anon execute).
-- Staff Manual Payment Entry still works after MFA.

CREATE OR REPLACE FUNCTION public.get_applications_for_payment_link()
RETURNS TABLE(
  id uuid,
  student_name text,
  student_email text,
  contract_slug text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.require_staff_mfa('get_applications_for_payment_link');

  RETURN QUERY
  SELECT
    sa.id,
    COALESCE(
      NULLIF(TRIM(p.first_name || ' ' || p.last_name), ''),
      NULLIF(TRIM(COALESCE(sas1.payload->>'first_name', '') || ' ' || COALESCE(sas1.payload->>'last_name', '')), ''),
      'Unknown'
    )::TEXT AS student_name,
    COALESCE(au.email, '')::TEXT AS student_email,
    COALESCE(c.slug, '')::TEXT AS contract_slug
  FROM public.student_applications sa
  LEFT JOIN public.profiles p ON sa.student_id = p.id
  LEFT JOIN auth.users au ON sa.student_id = au.id
  LEFT JOIN public.contracts c ON sa.contract_id = c.id
  LEFT JOIN public.student_application_steps sas1
    ON sa.id = sas1.application_id AND sas1.step_number = 1
  WHERE sa.status IN ('confirmed', 'awaiting_signature', 'awaiting_deposit')
  ORDER BY sa.updated_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_applications_for_payment_link()
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_applications_for_payment_link()
  TO authenticated, service_role;
