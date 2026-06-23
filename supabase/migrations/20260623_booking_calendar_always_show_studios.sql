-- Booking calendar: always return every active studio row.
-- Academic year filter applies to attached bookings only (not studio visibility).
-- Preserves assigned_studio_id history for checked_out applications (see admin_release_studio_occupancy).

DROP FUNCTION IF EXISTS public.get_booking_calendar_data(TEXT, UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.get_booking_calendar_data(
  p_allocation TEXT DEFAULT NULL,
  p_studio_grade_id UUID DEFAULT NULL,
  p_academic_year_id UUID DEFAULT NULL
)
RETURNS TABLE (
  studio_id UUID,
  studio_number TEXT,
  studio_grade_id UUID,
  studio_grade_name TEXT,
  allocation TEXT,
  studio_status TEXT,
  application_id UUID,
  application_status TEXT,
  student_id UUID,
  student_name TEXT,
  student_email TEXT,
  contract_id UUID,
  contract_name TEXT,
  contract_start DATE,
  contract_end DATE,
  effective_check_in_date DATE,
  effective_check_out_date DATE,
  actual_check_in_date DATE,
  actual_check_out_date DATE,
  check_in_notes TEXT,
  check_out_notes TEXT,
  checked_in_by UUID,
  checked_out_by UUID,
  checked_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  academic_year_id UUID,
  academic_year_name TEXT,
  application_created_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS studio_id,
    s.studio_number,
    s.studio_grade_id,
    sg.name AS studio_grade_name,
    s.allocation,
    s.status::TEXT AS studio_status,
    sa.id AS application_id,
    sa.status::TEXT AS application_status,
    sa.student_id,
    COALESCE(
      pr.first_name || ' ' || pr.last_name,
      (
        SELECT TRIM(
          COALESCE(step1.payload->>'first_name', '') || ' ' ||
          COALESCE(step1.payload->>'last_name', '')
        )
        FROM public.student_application_steps step1
        WHERE step1.application_id = sa.id AND step1.step_number = 1
        LIMIT 1
      ),
      'Unknown'
    ) AS student_name,
    COALESCE(u.email, '')::TEXT AS student_email,
    c.id AS contract_id,
    c.name AS contract_name,
    c.contract_start,
    c.contract_end,
    COALESCE(sa.actual_check_in_date, c.contract_start) AS effective_check_in_date,
    COALESCE(sa.actual_check_out_date, c.contract_end) AS effective_check_out_date,
    sa.actual_check_in_date,
    sa.actual_check_out_date,
    sa.check_in_notes,
    sa.check_out_notes,
    sa.checked_in_by,
    sa.checked_out_by,
    sa.checked_in_at,
    sa.checked_out_at,
    c.academic_year_id,
    ay.name AS academic_year_name,
    sa.created_at AS application_created_at,
    sa.submitted_at,
    sa.cancelled_at
  FROM public.studios s
  INNER JOIN public.studio_grades sg ON sg.id = s.studio_grade_id
  LEFT JOIN public.student_applications sa ON sa.assigned_studio_id = s.id
    AND (
      p_academic_year_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.contracts c_filter
        WHERE c_filter.id = sa.contract_id
          AND c_filter.academic_year_id = p_academic_year_id
      )
    )
  LEFT JOIN public.profiles pr ON pr.id = sa.student_id
  LEFT JOIN public.contracts c ON c.id = sa.contract_id
  LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
  LEFT JOIN auth.users u ON u.id = sa.student_id
  WHERE s.is_active = true
    AND (p_allocation IS NULL OR p_allocation = '' OR s.allocation = p_allocation)
    AND (p_studio_grade_id IS NULL OR s.studio_grade_id = p_studio_grade_id)
  ORDER BY sg.name, s.studio_number, sa.created_at NULLS FIRST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_booking_calendar_data(TEXT, UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.get_booking_calendar_data IS
'Booking calendar data: every active studio is always returned. Multiple rows per studio when several applications are assigned. Academic year filter limits which bookings are attached, not which studios appear.';
