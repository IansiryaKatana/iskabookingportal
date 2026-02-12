-- Show all application statuses on the booking calendar (not only confirmed).
-- Studios with assigned applications will show the booking regardless of status
-- (confirmed, awaiting_deposit, awaiting_signature, cancelled, etc.).

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
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
WHERE s.is_active = true
ORDER BY s.studio_grade_id, s.studio_number;

GRANT SELECT ON public.booking_calendar_data TO authenticated;

COMMENT ON VIEW public.booking_calendar_data IS 
'Booking calendar data - Shows all studios with their bookings (all application statuses) including contract dates and actual check-in/check-out dates';
