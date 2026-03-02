-- Applications list for manual payment link (staff): id, student name, email, contract slug.
-- SECURITY DEFINER so staff always get results; used for Link payment dialog and record form.

CREATE OR REPLACE FUNCTION public.get_applications_for_payment_link()
RETURNS TABLE(
  id UUID,
  student_name TEXT,
  student_email TEXT,
  contract_slug TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
  ORDER BY sa.updated_at DESC NULLS LAST
  LIMIT 300;
END;
$$;

COMMENT ON FUNCTION public.get_applications_for_payment_link() IS
  'Returns applications (id, student_name, student_email, contract_slug) for manual payment link dropdown; status in confirmed, awaiting_signature, awaiting_deposit.';

GRANT EXECUTE ON FUNCTION public.get_applications_for_payment_link() TO authenticated;
