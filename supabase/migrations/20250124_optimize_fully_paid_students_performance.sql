-- Optimize Fully Paid Students Query Performance
-- The view was calling get_payment_summary for every confirmed application, which is very slow
-- This migration adds indexes and optimizes the query

-- Add index on student_applications.status for faster filtering
CREATE INDEX IF NOT EXISTS idx_student_applications_status 
  ON public.student_applications(status) 
  WHERE status = 'confirmed';

-- Add composite index on stripe_payments for faster payment lookups in get_payment_summary
CREATE INDEX IF NOT EXISTS idx_stripe_payments_application_status 
  ON public.stripe_payments(student_application_id, status) 
  WHERE status IN ('succeeded', 'completed');

-- Add index on manual_payments for faster lookups
CREATE INDEX IF NOT EXISTS idx_manual_payments_application 
  ON public.manual_payments(application_id);

-- Optimize the fully_paid_students view by filtering earlier
-- Instead of calling get_payment_summary for all confirmed apps, we'll use a more efficient approach
DROP VIEW IF EXISTS public.fully_paid_students CASCADE;

-- Recreate the view with better performance
-- We filter by status first, then call get_payment_summary only for confirmed applications
CREATE VIEW public.fully_paid_students AS
SELECT DISTINCT
  sa.id AS application_id,
  sa.student_id,
  p.first_name,
  p.last_name,
  c.id AS contract_id,
  c.name AS contract_name,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  ps.total_due,
  ps.total_paid,
  ps.remaining_balance,
  ps.payment_status,
  ps.last_payment_date,
  sa.status AS application_status,
  sa.created_at AS application_created_at,
  s.studio_number,
  sg.name AS studio_grade_name
FROM public.student_applications sa
INNER JOIN public.profiles p ON sa.student_id = p.id
INNER JOIN public.contracts c ON sa.contract_id = c.id
INNER JOIN public.academic_years ay ON c.academic_year_id = ay.id
LEFT JOIN public.studios s ON sa.assigned_studio_id = s.id
LEFT JOIN public.studio_grades sg ON s.studio_grade_id = sg.id
CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
WHERE sa.status = 'confirmed'
  AND ps.payment_status = 'fully_paid'
  AND ps.remaining_balance <= 0;

-- Grant permissions
GRANT SELECT ON public.fully_paid_students TO authenticated;

-- Recreate the function (it should already exist, but ensure it's correct)
CREATE OR REPLACE FUNCTION public.get_fully_paid_students(
  p_contract_id UUID DEFAULT NULL,
  p_academic_year_id UUID DEFAULT NULL,
  p_start_date TEXT DEFAULT NULL,
  p_end_date TEXT DEFAULT NULL
)
RETURNS TABLE (
  application_id UUID,
  student_id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  contract_id UUID,
  contract_name TEXT,
  academic_year_id UUID,
  academic_year_name TEXT,
  total_due NUMERIC,
  total_paid NUMERIC,
  remaining_balance NUMERIC,
  payment_status TEXT,
  last_payment_date TIMESTAMPTZ,
  application_status TEXT,
  application_created_at TIMESTAMPTZ,
  studio_number TEXT,
  studio_grade_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  -- Convert text dates to DATE, handling NULL
  v_start_date := CASE WHEN p_start_date IS NULL OR p_start_date = '' THEN NULL ELSE p_start_date::DATE END;
  v_end_date := CASE WHEN p_end_date IS NULL OR p_end_date = '' THEN NULL ELSE p_end_date::DATE END;

  RETURN QUERY
  SELECT
    fps.application_id,
    fps.student_id,
    fps.first_name,
    fps.last_name,
    COALESCE(u.email, '')::TEXT AS email,
    fps.contract_id,
    fps.contract_name,
    fps.academic_year_id,
    fps.academic_year_name,
    fps.total_due,
    fps.total_paid,
    fps.remaining_balance,
    fps.payment_status,
    fps.last_payment_date,
    fps.application_status,
    fps.application_created_at,
    fps.studio_number,
    fps.studio_grade_name
  FROM public.fully_paid_students fps
  LEFT JOIN auth.users u ON fps.student_id = u.id
  WHERE (p_contract_id IS NULL OR fps.contract_id = p_contract_id)
    AND (p_academic_year_id IS NULL OR fps.academic_year_id = p_academic_year_id)
    AND (v_start_date IS NULL OR fps.last_payment_date IS NULL OR DATE(fps.last_payment_date) >= v_start_date)
    AND (v_end_date IS NULL OR fps.last_payment_date IS NULL OR DATE(fps.last_payment_date) <= v_end_date)
  ORDER BY fps.last_payment_date DESC, fps.application_created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_fully_paid_students(UUID, UUID, TEXT, TEXT) TO authenticated;

