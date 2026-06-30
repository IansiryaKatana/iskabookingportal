-- Early student checkout: end occupancy before contract end without refunds or
-- payment schedule changes. Studio becomes available for reallocation.

CREATE OR REPLACE FUNCTION public.admin_early_checkout_student(
  p_application_id UUID,
  p_checkout_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_app public.student_applications%ROWTYPE;
  v_contract public.contracts%ROWTYPE;
  v_studio_id UUID;
  v_active_extensions INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can perform early checkout';
  END IF;

  IF p_application_id IS NULL THEN
    RAISE EXCEPTION 'Application id is required';
  END IF;

  IF p_checkout_date IS NULL THEN
    RAISE EXCEPTION 'Checkout date is required';
  END IF;

  IF p_checkout_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Checkout date cannot be in the future';
  END IF;

  SELECT * INTO v_app
  FROM public.student_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF v_app.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Early checkout is only allowed for confirmed applications (current status: %)', v_app.status;
  END IF;

  IF v_app.assigned_studio_id IS NULL THEN
    RAISE EXCEPTION 'Application has no assigned studio to release';
  END IF;

  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = v_app.contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found for application';
  END IF;

  IF v_contract.contract_end IS NOT NULL
     AND p_checkout_date > v_contract.contract_end::DATE THEN
    RAISE EXCEPTION 'Checkout date cannot be after the contract end date. Use the standard checkout flow instead.';
  END IF;

  IF v_contract.contract_start IS NOT NULL
     AND p_checkout_date < v_contract.contract_start::DATE THEN
    RAISE EXCEPTION 'Checkout date cannot be before the contract start date';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_active_extensions
  FROM public.student_applications ext
  WHERE ext.extension_of_application_id = p_application_id
    AND ext.status IN (
      'draft',
      'awaiting_deposit',
      'awaiting_signature',
      'awaiting_verification',
      'confirmed'
    );

  IF v_active_extensions > 0 THEN
    RAISE EXCEPTION 'Cannot early checkout: % active extension application(s) exist. Resolve extensions first.', v_active_extensions;
  END IF;

  v_studio_id := v_app.assigned_studio_id;

  UPDATE public.student_applications
  SET
    status = 'checked_out',
    actual_check_out_date = p_checkout_date,
    check_out_notes = NULLIF(TRIM(p_notes), ''),
    checked_out_at = NOW(),
    checked_out_by = v_user_id,
    updated_at = NOW()
  WHERE id = p_application_id;

  UPDATE public.studios
  SET
    status = 'available',
    allocation = NULL,
    reservation_expires_at = NULL,
    updated_at = NOW()
  WHERE id = v_studio_id;

  INSERT INTO public.housekeeping_status (studio_id, status)
  VALUES (v_studio_id, 'dirty')
  ON CONFLICT (studio_id)
  DO UPDATE SET
    status = 'dirty',
    updated_at = NOW();

  INSERT INTO public.activity_log (entity_type, entity_id, action, from_status, to_status, message, created_by)
  VALUES (
    'student_application',
    p_application_id,
    'early_checkout',
    'confirmed',
    'checked_out',
    'Early checkout on ' || p_checkout_date::TEXT
      || COALESCE(' — ' || NULLIF(TRIM(p_notes), ''), '')
      || '. Studio ' || v_studio_id::TEXT || ' released. No refunds issued.',
    v_user_id
  );

  RETURN jsonb_build_object(
    'application_id', p_application_id,
    'studio_id', v_studio_id,
    'checkout_date', p_checkout_date,
    'early_checkout', true
  );
END;
$$;

COMMENT ON FUNCTION public.admin_early_checkout_student(UUID, DATE, TEXT) IS
'Staff-only early checkout for confirmed students before contract end. Marks application checked_out, records actual checkout date/notes, frees studio for reallocation, marks housekeeping dirty. Does not alter payments, refunds, or instalment schedules.';

GRANT EXECUTE ON FUNCTION public.admin_early_checkout_student(UUID, DATE, TEXT) TO authenticated;

-- Improve standard end-of-stay release to record checkout metadata too.
CREATE OR REPLACE FUNCTION public.admin_release_studio_occupancy(
  p_studio_id UUID,
  p_academic_year_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_user_id UUID := auth.uid();
  v_updated_apps INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can release studio occupancy';
  END IF;

  UPDATE public.student_applications sa
  SET
    status = 'checked_out',
    actual_check_out_date = COALESCE(sa.actual_check_out_date, c.contract_end::DATE, v_today),
    checked_out_at = COALESCE(sa.checked_out_at, NOW()),
    checked_out_by = COALESCE(sa.checked_out_by, v_user_id),
    updated_at = NOW()
  FROM public.contracts c
  WHERE sa.assigned_studio_id = p_studio_id
    AND sa.status = 'confirmed'
    AND sa.contract_id = c.id
    AND c.contract_end::DATE < v_today
    AND (p_academic_year_id IS NULL OR c.academic_year_id = p_academic_year_id);

  GET DIAGNOSTICS v_updated_apps = ROW_COUNT;

  UPDATE public.studios
  SET
    status = 'available',
    allocation = NULL,
    reservation_expires_at = NULL,
    updated_at = NOW()
  WHERE id = p_studio_id;

  IF v_updated_apps > 0 THEN
    INSERT INTO public.housekeeping_status (studio_id, status)
    VALUES (p_studio_id, 'dirty')
    ON CONFLICT (studio_id)
    DO UPDATE SET
      status = 'dirty',
      updated_at = NOW();
  END IF;

  RETURN jsonb_build_object(
    'updated_applications', v_updated_apps
  );
END;
$$;

COMMENT ON FUNCTION public.admin_release_studio_occupancy(UUID, UUID) IS
'Marks ended confirmed applications for a studio as checked_out (by academic year when provided), records checkout metadata, globally frees the studio, and marks housekeeping dirty. Preserves application history.';
