-- Fix get_fully_paid_students: cast application_status enum to text for RETURNS TABLE match.

CREATE OR REPLACE FUNCTION public.get_fully_paid_students(
  p_contract_id uuid DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_start_date text DEFAULT NULL,
  p_end_date text DEFAULT NULL
)
RETURNS TABLE (
  application_id uuid,
  student_id uuid,
  first_name text,
  last_name text,
  email text,
  contract_id uuid,
  contract_name text,
  academic_year_id uuid,
  academic_year_name text,
  total_due numeric,
  total_paid numeric,
  remaining_balance numeric,
  payment_status text,
  last_payment_date timestamptz,
  application_status text,
  application_created_at timestamptz,
  studio_number text,
  studio_grade_name text,
  payment_plan text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_start_date date;
  v_end_date date;
BEGIN
  v_start_date := CASE WHEN p_start_date IS NULL OR p_start_date = '' THEN NULL ELSE p_start_date::date END;
  v_end_date := CASE WHEN p_end_date IS NULL OR p_end_date = '' THEN NULL ELSE p_end_date::date END;

  RETURN QUERY
  SELECT
    fps.application_id,
    fps.student_id,
    fps.first_name,
    fps.last_name,
    COALESCE(u.email, '')::text AS email,
    fps.contract_id,
    fps.contract_name,
    fps.academic_year_id,
    fps.academic_year_name,
    fps.total_due,
    fps.total_paid,
    fps.remaining_balance,
    fps.payment_status,
    fps.last_payment_date,
    fps.application_status::text,
    fps.application_created_at,
    fps.studio_number,
    fps.studio_grade_name,
    fps.payment_plan
  FROM public.fully_paid_students fps
  LEFT JOIN auth.users u ON fps.student_id = u.id
  WHERE (p_contract_id IS NULL OR fps.contract_id = p_contract_id)
    AND (p_academic_year_id IS NULL OR fps.academic_year_id = p_academic_year_id)
    AND (v_start_date IS NULL OR fps.last_payment_date IS NULL OR date(fps.last_payment_date) >= v_start_date)
    AND (v_end_date IS NULL OR fps.last_payment_date IS NULL OR date(fps.last_payment_date) <= v_end_date)
  ORDER BY fps.last_payment_date DESC NULLS LAST, fps.application_created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_fully_paid_students(uuid, uuid, text, text) TO authenticated;
