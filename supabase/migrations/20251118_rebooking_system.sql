-- Rebooking System
-- Allows students to rebook for upcoming academic years or after gaps

-- Add rebooking fields to student_applications
ALTER TABLE public.student_applications
ADD COLUMN IF NOT EXISTS is_rebooking BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS previous_application_id UUID REFERENCES public.student_applications(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS rebooking_reason TEXT,
ADD COLUMN IF NOT EXISTS rebooking_approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rebooking_approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for rebooking queries
CREATE INDEX IF NOT EXISTS idx_applications_rebooking 
ON public.student_applications(is_rebooking, previous_application_id) 
WHERE is_rebooking = true;

CREATE INDEX IF NOT EXISTS idx_applications_previous_app 
ON public.student_applications(previous_application_id) 
WHERE previous_application_id IS NOT NULL;

-- Function to check if student can rebook
CREATE OR REPLACE FUNCTION public.can_student_rebook(
  p_user_id UUID,
  p_contract_id UUID
)
RETURNS TABLE (
  can_rebook BOOLEAN,
  previous_application_id UUID,
  previous_contract_name TEXT,
  previous_academic_year TEXT,
  message TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_previous_app UUID;
  v_contract_name TEXT;
  v_academic_year TEXT;
  v_message TEXT;
BEGIN
  -- Find most recent confirmed application for this student
  SELECT 
    sa.id,
    c.name,
    ay.name
  INTO v_previous_app, v_contract_name, v_academic_year
  FROM public.student_applications sa
  INNER JOIN public.contracts c ON sa.contract_id = c.id
  INNER JOIN public.academic_years ay ON c.academic_year_id = ay.id
  WHERE sa.user_id = p_user_id
    AND sa.status = 'confirmed'
  ORDER BY sa.created_at DESC
  LIMIT 1;

  -- Check if there's already a rebooking for this contract
  IF EXISTS (
    SELECT 1
    FROM public.student_applications
    WHERE user_id = p_user_id
      AND contract_id = p_contract_id
      AND is_rebooking = true
      AND status IN ('draft', 'awaiting_deposit', 'awaiting_signature', 'awaiting_verification', 'confirmed')
  ) THEN
    RETURN QUERY SELECT 
      false,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      'You already have a rebooking application for this contract'::TEXT;
    RETURN;
  END IF;

  -- If no previous application, they can still apply (first time)
  IF v_previous_app IS NULL THEN
    RETURN QUERY SELECT 
      true,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      'First-time application'::TEXT;
    RETURN;
  END IF;

  -- Check if the contract is for a future academic year
  DECLARE
    v_current_contract_year_id UUID;
    v_new_contract_year_id UUID;
    v_current_year_start DATE;
    v_new_year_start DATE;
  BEGIN
    SELECT academic_year_id INTO v_current_contract_year_id
    FROM public.contracts
    WHERE id = (
      SELECT contract_id
      FROM public.student_applications
      WHERE id = v_previous_app
    );

    SELECT academic_year_id INTO v_new_contract_year_id
    FROM public.contracts
    WHERE id = p_contract_id;

    -- Get academic year start dates
    SELECT start_date INTO v_current_year_start
    FROM public.academic_years
    WHERE id = v_current_contract_year_id;

    SELECT start_date INTO v_new_year_start
    FROM public.academic_years
    WHERE id = v_new_contract_year_id;

    -- Allow rebooking if new year is after current year
    IF v_new_year_start > v_current_year_start THEN
      RETURN QUERY SELECT 
        true,
        v_previous_app,
        v_contract_name,
        v_academic_year,
        'Rebooking for upcoming academic year'::TEXT;
      RETURN;
    END IF;
  END;

  -- Allow rebooking even if same year (gap year scenario)
  RETURN QUERY SELECT 
    true,
    v_previous_app,
    v_contract_name,
    v_academic_year,
    'Rebooking after gap'::TEXT;
END;
$$;

-- Function to pre-fill application data from previous application
CREATE OR REPLACE FUNCTION public.get_rebooking_data(
  p_previous_application_id UUID
)
RETURNS TABLE (
  step1_data JSONB,
  step2_data JSONB,
  step3_data JSONB,
  step4_data JSONB,
  step5_data JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT payload FROM public.student_application_steps WHERE application_id = p_previous_application_id AND step_number = 1 LIMIT 1),
    (SELECT payload FROM public.student_application_steps WHERE application_id = p_previous_application_id AND step_number = 2 LIMIT 1),
    (SELECT payload FROM public.student_application_steps WHERE application_id = p_previous_application_id AND step_number = 3 LIMIT 1),
    (SELECT payload FROM public.student_application_steps WHERE application_id = p_previous_application_id AND step_number = 4 LIMIT 1),
    (SELECT payload FROM public.student_application_steps WHERE application_id = p_previous_application_id AND step_number = 5 LIMIT 1);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.can_student_rebook(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rebooking_data(UUID) TO authenticated;

-- Add comment
COMMENT ON COLUMN public.student_applications.is_rebooking IS 'Indicates if this is a rebooking application';
COMMENT ON COLUMN public.student_applications.previous_application_id IS 'Links to the previous application if this is a rebooking';
COMMENT ON COLUMN public.student_applications.rebooking_reason IS 'Reason for rebooking (e.g., "Returning after gap year")';
COMMENT ON COLUMN public.student_applications.rebooking_approved_at IS 'Timestamp when rebooking was approved by finance';
COMMENT ON COLUMN public.student_applications.rebooking_approved_by IS 'User ID of staff member who approved rebooking';

