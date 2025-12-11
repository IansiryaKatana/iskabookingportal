-- Check-in/Check-out System
-- Tracks actual student check-in and check-out dates separately from contract dates

-- ============================================================================
-- PART 1: ADD FIELDS TO student_applications
-- ============================================================================

ALTER TABLE public.student_applications
  ADD COLUMN IF NOT EXISTS actual_check_in_date DATE,
  ADD COLUMN IF NOT EXISTS actual_check_out_date DATE,
  ADD COLUMN IF NOT EXISTS check_in_notes TEXT,
  ADD COLUMN IF NOT EXISTS check_out_notes TEXT,
  ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_out_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_student_applications_check_in_date 
  ON public.student_applications(actual_check_in_date) 
  WHERE actual_check_in_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_applications_check_out_date 
  ON public.student_applications(actual_check_out_date) 
  WHERE actual_check_out_date IS NOT NULL;

-- ============================================================================
-- PART 2: UPDATE booking_calendar_data VIEW
-- ============================================================================

DROP VIEW IF EXISTS public.booking_calendar_data CASCADE;

CREATE VIEW public.booking_calendar_data AS
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
    p.first_name || ' ' || p.last_name,
    (SELECT 
       TRIM(
         COALESCE(step1.payload->>'first_name', '') || ' ' || 
         COALESCE(step1.payload->>'last_name', '')
       )
     FROM public.student_application_steps step1
     WHERE step1.application_id = sa.id AND step1.step_number = 1
     LIMIT 1),
    'Unknown'
  ) AS student_name,
  NULL::TEXT AS student_email,
  c.id AS contract_id,
  c.name AS contract_name,
  c.contract_start,
  c.contract_end,
  -- Use actual check-in/check-out dates if available, otherwise use contract dates
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
  AND sa.status = 'confirmed'
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
WHERE s.is_active = true
ORDER BY s.studio_grade_id, s.studio_number;

GRANT SELECT ON public.booking_calendar_data TO authenticated;

-- ============================================================================
-- PART 3: UPDATE get_booking_calendar_data FUNCTION
-- ============================================================================

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
    bcd.studio_id,
    bcd.studio_number,
    bcd.studio_grade_id,
    bcd.studio_grade_name,
    bcd.allocation,
    bcd.studio_status,
    bcd.application_id,
    bcd.application_status,
    bcd.student_id,
    bcd.student_name,
    COALESCE(u.email, '')::TEXT AS student_email,
    bcd.contract_id,
    bcd.contract_name,
    bcd.contract_start,
    bcd.contract_end,
    bcd.effective_check_in_date,
    bcd.effective_check_out_date,
    bcd.actual_check_in_date,
    bcd.actual_check_out_date,
    bcd.check_in_notes,
    bcd.check_out_notes,
    bcd.checked_in_by,
    bcd.checked_out_by,
    bcd.checked_in_at,
    bcd.checked_out_at,
    bcd.academic_year_id,
    bcd.academic_year_name,
    bcd.application_created_at,
    bcd.submitted_at,
    bcd.cancelled_at
  FROM public.booking_calendar_data bcd
  LEFT JOIN auth.users u ON u.id = bcd.student_id
  WHERE 
    (p_allocation IS NULL OR p_allocation = '' OR bcd.allocation = p_allocation)
    AND (p_studio_grade_id IS NULL OR bcd.studio_grade_id = p_studio_grade_id)
    AND (
      p_academic_year_id IS NULL 
      OR bcd.academic_year_id = p_academic_year_id 
      OR bcd.application_id IS NULL
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_booking_calendar_data(TEXT, UUID, UUID) TO authenticated;

COMMENT ON VIEW public.booking_calendar_data IS 
'Booking calendar data - Shows all studios with their bookings (confirmed applications) including contract dates and actual check-in/check-out dates';

COMMENT ON FUNCTION public.get_booking_calendar_data IS 
'Get booking calendar data with student email from auth.users, including check-in/check-out dates';

