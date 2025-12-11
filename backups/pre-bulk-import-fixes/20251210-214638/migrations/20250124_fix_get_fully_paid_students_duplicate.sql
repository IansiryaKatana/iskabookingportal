-- Fix duplicate get_fully_paid_students function
-- Drop all existing versions and recreate with the correct signature

-- Drop the function with all possible signatures to ensure clean slate
DROP FUNCTION IF EXISTS public.get_fully_paid_students(UUID, UUID, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_fully_paid_students() CASCADE;
DROP FUNCTION IF EXISTS public.get_fully_paid_students(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_fully_paid_students(UUID, UUID) CASCADE;

-- Recreate the function with debug logging (from the latest migration)
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
  v_confirmed_count INTEGER;
  v_view_count INTEGER;
  v_result_count INTEGER;
BEGIN
  -- Log function entry
  BEGIN
    INSERT INTO public.debug_logs (function_name, application_id, message, data)
    VALUES ('get_fully_paid_students', NULL, 'Function called', jsonb_build_object(
      'p_contract_id', p_contract_id,
      'p_academic_year_id', p_academic_year_id,
      'p_start_date', p_start_date,
      'p_end_date', p_end_date
    ));
  EXCEPTION WHEN OTHERS THEN
    -- Ignore errors in logging (table might not exist yet)
    NULL;
  END;

  -- Convert text dates to DATE
  v_start_date := CASE WHEN p_start_date IS NULL OR p_start_date = '' THEN NULL ELSE p_start_date::DATE END;
  v_end_date := CASE WHEN p_end_date IS NULL OR p_end_date = '' THEN NULL ELSE p_end_date::DATE END;

  -- Count confirmed applications
  BEGIN
    SELECT COUNT(*) INTO v_confirmed_count
    FROM public.student_applications
    WHERE status = 'confirmed';
    
    BEGIN
      INSERT INTO public.debug_logs (function_name, application_id, message, data)
      VALUES ('get_fully_paid_students', NULL, 'Confirmed applications count', jsonb_build_object('count', v_confirmed_count));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  EXCEPTION WHEN OTHERS THEN
    v_confirmed_count := 0;
  END;

  -- Count rows in view before filtering
  BEGIN
    SELECT COUNT(*) INTO v_view_count
    FROM public.fully_paid_students;
    
    BEGIN
      INSERT INTO public.debug_logs (function_name, application_id, message, data)
      VALUES ('get_fully_paid_students', NULL, 'Rows in fully_paid_students view', jsonb_build_object('count', v_view_count));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  EXCEPTION WHEN OTHERS THEN
    v_view_count := 0;
  END;

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

  -- Count results
  GET DIAGNOSTICS v_result_count = ROW_COUNT;
  
  BEGIN
    INSERT INTO public.debug_logs (function_name, application_id, message, data)
    VALUES ('get_fully_paid_students', NULL, 'Query completed', jsonb_build_object('result_count', v_result_count));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_fully_paid_students(UUID, UUID, TEXT, TEXT) TO authenticated;

-- Verify only one version exists
DO $$
DECLARE
  func_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO func_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'get_fully_paid_students';
  
  IF func_count > 1 THEN
    RAISE WARNING 'Multiple versions of get_fully_paid_students still exist: %', func_count;
  END IF;
END;
$$;

