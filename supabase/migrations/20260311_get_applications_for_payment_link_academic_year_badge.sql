-- Extend get_applications_for_payment_link() with academic_year_name
-- so staff can distinguish between applications from different academic years
-- when linking manual payments.
--
-- Returns:
--   id                  UUID
--   student_name        TEXT
--   student_email       TEXT
--   contract_slug       TEXT
--   academic_year_name  TEXT

CREATE OR REPLACE FUNCTION public.get_applications_for_payment_link()
RETURNS TABLE(
  id UUID,
  student_name TEXT,
  student_email TEXT,
  contract_slug TEXT,
  academic_year_name TEXT
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
    COALESCE(c.slug, '')::TEXT AS contract_slug,
    COALESCE(ay.name, '')::TEXT AS academic_year_name
  FROM public.student_applications sa
  LEFT JOIN public.profiles p ON sa.student_id = p.id
  LEFT JOIN auth.users au ON sa.student_id = au.id
  LEFT JOIN public.contracts c ON sa.contract_id = c.id
  LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
  LEFT JOIN public.student_application_steps sas1
    ON sa.id = sas1.application_id AND sas1.step_number = 1
  WHERE sa.status IN ('confirmed', 'awaiting_signature', 'awaiting_deposit')
  ORDER BY sa.updated_at DESC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.get_applications_for_payment_link() IS
  'Returns applications (id, student_name, student_email, contract_slug, academic_year_name) for manual payment link dropdown; status in confirmed, awaiting_signature, awaiting_deposit. No row limit.';

GRANT EXECUTE ON FUNCTION public.get_applications_for_payment_link() TO authenticated;

