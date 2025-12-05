-- Fix type mismatch: application_status enum needs to be cast to TEXT
-- The error: "Returned type application_status does not match expected type text in column 15"

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
  -- Convert text dates to DATE
  v_start_date := CASE WHEN p_start_date IS NULL OR p_start_date = '' THEN NULL ELSE p_start_date::DATE END;
  v_end_date := CASE WHEN p_end_date IS NULL OR p_end_date = '' THEN NULL ELSE p_end_date::DATE END;

  -- Execute query
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
    fps.application_status::TEXT, -- CAST enum to TEXT
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

