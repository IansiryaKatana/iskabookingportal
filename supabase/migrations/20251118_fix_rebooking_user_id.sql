-- Fix rebooking function to use student_id instead of user_id
-- The student_applications table uses student_id, not user_id

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
  WHERE sa.student_id = p_user_id  -- Fixed: was user_id, should be student_id
    AND sa.status = 'confirmed'
  ORDER BY sa.created_at DESC
  LIMIT 1;

  -- Check if there's already a rebooking for this contract
  IF EXISTS (
    SELECT 1
    FROM public.student_applications
    WHERE student_id = p_user_id  -- Fixed: was user_id, should be student_id
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

    -- If new contract is for a future year, allow rebooking
    IF v_new_year_start > v_current_year_start THEN
      RETURN QUERY SELECT 
        true,
        v_previous_app,
        v_contract_name,
        v_academic_year,
        format('You can rebook for %s. Your previous application from %s will be used to pre-fill this form.'::TEXT, 
          (SELECT name FROM public.academic_years WHERE id = v_new_contract_year_id),
          v_academic_year);
      RETURN;
    END IF;

    -- If same year or past year, check if there's a gap
    -- Allow rebooking if there's at least one academic year gap
    IF v_new_year_start > v_current_year_start + INTERVAL '1 year' THEN
      RETURN QUERY SELECT 
        true,
        v_previous_app,
        v_contract_name,
        v_academic_year,
        format('You can rebook after a gap. Your previous application from %s will be used to pre-fill this form.'::TEXT, 
          v_academic_year);
      RETURN;
    END IF;
  END;

  -- Default: cannot rebook (same year or other restriction)
  RETURN QUERY SELECT 
    false,
    v_previous_app,
    v_contract_name,
    v_academic_year,
    format('You already have a confirmed application for %s. Rebooking is only available for future academic years or after a gap.'::TEXT, 
      v_academic_year);
END;
$$;

