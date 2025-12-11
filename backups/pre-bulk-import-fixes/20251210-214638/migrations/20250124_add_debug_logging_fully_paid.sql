-- Add debug logging to get_payment_summary and get_fully_paid_students
-- This will help identify where the query is failing or returning no results

-- First, create a debug log table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.debug_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  application_id UUID,
  message TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debug_logs_function ON public.debug_logs(function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_debug_logs_application ON public.debug_logs(application_id);

-- Grant permissions
GRANT INSERT, SELECT ON public.debug_logs TO authenticated;
GRANT INSERT, SELECT ON public.debug_logs TO service_role;

-- Update get_payment_summary with debug logging
CREATE OR REPLACE FUNCTION public.get_payment_summary(p_application_id UUID)
RETURNS TABLE (
  total_due NUMERIC,
  total_paid NUMERIC,
  remaining_balance NUMERIC,
  payment_count INTEGER,
  last_payment_date TIMESTAMPTZ,
  payment_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_due NUMERIC := 0;
  v_cashback NUMERIC := 0;
  v_total_due_after_cashback NUMERIC := 0;
  v_total_paid NUMERIC := 0;
  v_payment_count INTEGER := 0;
  v_last_payment_date TIMESTAMPTZ;
  v_contract_weekly_price NUMERIC;
  v_contract_weeks INTEGER;
  v_payment_plan_id UUID;
  v_total_contract_value NUMERIC;
BEGIN
  -- Debug: Log function entry
  INSERT INTO public.debug_logs (function_name, application_id, message, data)
  VALUES ('get_payment_summary', p_application_id, 'Function called', jsonb_build_object('application_id', p_application_id));

  -- Validate application exists
  IF NOT EXISTS (SELECT 1 FROM public.student_applications WHERE id = p_application_id) THEN
    INSERT INTO public.debug_logs (function_name, application_id, message, data)
    VALUES ('get_payment_summary', p_application_id, 'Application not found', NULL);
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::INTEGER, NULL::TIMESTAMPTZ, 'unpaid'::TEXT;
    RETURN;
  END IF;

  -- First, try to get total due from contract payment schedule
  BEGIN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_due
    FROM public.contract_payment_schedule cps
    INNER JOIN public.student_applications sa ON sa.contract_id = cps.contract_id
    WHERE sa.id = p_application_id;
    
    INSERT INTO public.debug_logs (function_name, application_id, message, data)
    VALUES ('get_payment_summary', p_application_id, 'Total due from schedule', jsonb_build_object('total_due', v_total_due));
  EXCEPTION WHEN OTHERS THEN
    v_total_due := 0;
    INSERT INTO public.debug_logs (function_name, application_id, message, data)
    VALUES ('get_payment_summary', p_application_id, 'Error getting total due from schedule', jsonb_build_object('error', SQLERRM));
  END;

  -- If no payment schedule exists, calculate from payment plan installments
  IF COALESCE(v_total_due, 0) = 0 THEN
    BEGIN
      SELECT 
        sa.selected_payment_plan_id,
        COALESCE(c.weekly_price_override, sgp.weekly_price, 0),
        COALESCE(c.weeks, 0)
      INTO 
        v_payment_plan_id,
        v_contract_weekly_price,
        v_contract_weeks
      FROM public.student_applications sa
      INNER JOIN public.contracts c ON sa.contract_id = c.id
      LEFT JOIN public.studio_grade_prices sgp 
        ON sgp.academic_year_id = c.academic_year_id 
        AND sgp.studio_grade_id = c.studio_grade_id
        AND sgp.is_active = true
      WHERE sa.id = p_application_id;

      IF v_payment_plan_id IS NOT NULL 
         AND COALESCE(v_contract_weekly_price, 0) > 0 
         AND COALESCE(v_contract_weeks, 0) > 0 THEN
        BEGIN
          v_total_contract_value := v_contract_weekly_price * v_contract_weeks;

          SELECT COALESCE(SUM(
            CASE 
              WHEN amount_type = 'percentage' THEN (v_total_contract_value * amount_value / 100)
              WHEN amount_type = 'fixed' THEN amount_value
              ELSE 0
            END
          ), 0)
          INTO v_total_due
          FROM public.payment_plan_installments
          WHERE payment_plan_id = v_payment_plan_id;
          
          INSERT INTO public.debug_logs (function_name, application_id, message, data)
          VALUES ('get_payment_summary', p_application_id, 'Total due from installments', jsonb_build_object(
            'total_due', v_total_due,
            'payment_plan_id', v_payment_plan_id,
            'contract_value', v_total_contract_value
          ));
        EXCEPTION WHEN OTHERS THEN
          v_total_due := 0;
        END;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_total_due := 0;
    END;
  END IF;
  
  v_total_due := COALESCE(v_total_due, 0);

  -- Get cashback amount
  BEGIN
    SELECT COALESCE(cashback_amount, 0)
    INTO v_cashback
    FROM public.student_applications
    WHERE id = p_application_id;
  EXCEPTION WHEN OTHERS THEN
    v_cashback := 0;
  END;

  v_total_due_after_cashback := GREATEST(COALESCE(v_total_due, 0) - COALESCE(v_cashback, 0), 0);

  -- Get total paid from unified history
  BEGIN
    SELECT 
      COALESCE(SUM(amount_paid), 0),
      COUNT(*),
      MAX(payment_date)
    INTO v_total_paid, v_payment_count, v_last_payment_date
    FROM public.unified_payment_history
    WHERE student_application_id = p_application_id
      AND payment_status IN ('succeeded', 'completed');
    
    INSERT INTO public.debug_logs (function_name, application_id, message, data)
    VALUES ('get_payment_summary', p_application_id, 'Total paid from history', jsonb_build_object(
      'total_paid', v_total_paid,
      'payment_count', v_payment_count,
      'last_payment_date', v_last_payment_date
    ));
  EXCEPTION WHEN OTHERS THEN
    v_total_paid := 0;
    v_payment_count := 0;
    v_last_payment_date := NULL;
    INSERT INTO public.debug_logs (function_name, application_id, message, data)
    VALUES ('get_payment_summary', p_application_id, 'Error getting total paid', jsonb_build_object('error', SQLERRM));
  END;

  -- Calculate payment status and log final summary
  DECLARE
    v_payment_status TEXT;
  BEGIN
    v_payment_status := CASE 
      WHEN COALESCE(v_total_paid, 0) >= v_total_due_after_cashback AND v_total_due_after_cashback > 0 THEN 'fully_paid'
      WHEN COALESCE(v_total_paid, 0) > 0 THEN 'partially_paid'
      ELSE 'unpaid'
    END;
    
    INSERT INTO public.debug_logs (function_name, application_id, message, data)
    VALUES ('get_payment_summary', p_application_id, 'Final summary', jsonb_build_object(
      'total_due', v_total_due,
      'cashback', v_cashback,
      'total_due_after_cashback', v_total_due_after_cashback,
      'total_paid', v_total_paid,
      'remaining_balance', GREATEST(v_total_due_after_cashback - COALESCE(v_total_paid, 0), 0),
      'payment_status', v_payment_status
    ));
  EXCEPTION WHEN OTHERS THEN
    -- Ignore errors in logging
    NULL;
  END;

  RETURN QUERY SELECT 
    v_total_due_after_cashback,
    COALESCE(v_total_paid, 0),
    GREATEST(v_total_due_after_cashback - COALESCE(v_total_paid, 0), 0),
    COALESCE(v_payment_count, 0),
    v_last_payment_date,
    CASE 
      WHEN COALESCE(v_total_paid, 0) >= v_total_due_after_cashback AND v_total_due_after_cashback > 0 THEN 'fully_paid'
      WHEN COALESCE(v_total_paid, 0) > 0 THEN 'partially_paid'
      ELSE 'unpaid'
    END;
END;
$$;

-- Update get_fully_paid_students with debug logging
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
  INSERT INTO public.debug_logs (function_name, application_id, message, data)
  VALUES ('get_fully_paid_students', NULL, 'Function called', jsonb_build_object(
    'p_contract_id', p_contract_id,
    'p_academic_year_id', p_academic_year_id,
    'p_start_date', p_start_date,
    'p_end_date', p_end_date
  ));

  -- Convert text dates to DATE
  v_start_date := CASE WHEN p_start_date IS NULL OR p_start_date = '' THEN NULL ELSE p_start_date::DATE END;
  v_end_date := CASE WHEN p_end_date IS NULL OR p_end_date = '' THEN NULL ELSE p_end_date::DATE END;

  -- Count confirmed applications
  SELECT COUNT(*) INTO v_confirmed_count
  FROM public.student_applications
  WHERE status = 'confirmed';
  
  INSERT INTO public.debug_logs (function_name, application_id, message, data)
  VALUES ('get_fully_paid_students', NULL, 'Confirmed applications count', jsonb_build_object('count', v_confirmed_count));

  -- Count rows in view before filtering
  SELECT COUNT(*) INTO v_view_count
  FROM public.fully_paid_students;
  
  INSERT INTO public.debug_logs (function_name, application_id, message, data)
  VALUES ('get_fully_paid_students', NULL, 'Rows in fully_paid_students view', jsonb_build_object('count', v_view_count));

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
  
  INSERT INTO public.debug_logs (function_name, application_id, message, data)
  VALUES ('get_fully_paid_students', NULL, 'Query completed', jsonb_build_object('result_count', v_result_count));
END;
$$;

-- Create a helper function to view recent debug logs
CREATE OR REPLACE FUNCTION public.get_debug_logs(
  p_function_name TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  function_name TEXT,
  application_id UUID,
  message TEXT,
  data JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dl.id,
    dl.function_name,
    dl.application_id,
    dl.message,
    dl.data,
    dl.created_at
  FROM public.debug_logs dl
  WHERE (p_function_name IS NULL OR dl.function_name = p_function_name)
  ORDER BY dl.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_debug_logs(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_fully_paid_students(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_summary(UUID) TO authenticated, anon;

