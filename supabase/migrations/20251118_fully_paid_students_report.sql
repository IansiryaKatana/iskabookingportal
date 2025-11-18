-- Fully Paid Students Report
-- View and function to identify students who have fully paid their contracts

-- View for fully paid students
CREATE OR REPLACE VIEW public.fully_paid_students AS
SELECT DISTINCT
  sa.id AS application_id,
  sa.user_id AS student_id,
  p.first_name,
  p.last_name,
  p.email,
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
INNER JOIN public.profiles p ON sa.user_id = p.id
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

-- Function to get fully paid students with filters
CREATE OR REPLACE FUNCTION public.get_fully_paid_students(
  p_contract_id UUID DEFAULT NULL,
  p_academic_year_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
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
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.fully_paid_students
  WHERE (p_contract_id IS NULL OR contract_id = p_contract_id)
    AND (p_academic_year_id IS NULL OR academic_year_id = p_academic_year_id)
    AND (p_start_date IS NULL OR last_payment_date >= p_start_date)
    AND (p_end_date IS NULL OR last_payment_date <= p_end_date)
  ORDER BY last_payment_date DESC, application_created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_fully_paid_students(UUID, UUID, DATE, DATE) TO authenticated;

