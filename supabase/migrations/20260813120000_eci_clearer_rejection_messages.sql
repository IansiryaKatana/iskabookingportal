-- Clearer early check-in rejection reasons for staff UI toasts.

CREATE OR REPLACE FUNCTION public.admin_create_early_check_in(
  p_application_id uuid,
  p_early_check_in_date date,
  p_notes text DEFAULT NULL,
  p_nightly_rate_override numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_app public.student_applications%ROWTYPE;
  v_contract public.contracts%ROWTYPE;
  v_studio_id UUID;
  v_studio_number TEXT;
  v_rate NUMERIC;
  v_nights INTEGER;
  v_total NUMERIC;
  v_existing public.early_check_ins%ROWTYPE;
  v_has_existing BOOLEAN := false;
  v_eci_id UUID;
  v_conflict_ota_ref TEXT;
  v_conflict_ota_in DATE;
  v_conflict_ota_out DATE;
  v_conflict_ota_guest TEXT;
  v_conflict_app_id UUID;
  v_conflict_app_name TEXT;
  v_conflict_app_from DATE;
  v_conflict_app_to DATE;
  v_conflict_eci_app UUID;
  v_conflict_eci_name TEXT;
  v_conflict_eci_from DATE;
  v_conflict_eci_to DATE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can create early check-in';
  END IF;

  IF p_application_id IS NULL OR p_early_check_in_date IS NULL THEN
    RAISE EXCEPTION 'Application id and early check-in date are required';
  END IF;

  SELECT * INTO v_app
  FROM public.student_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF v_app.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Early check-in is only allowed for confirmed applications (current status: %)', v_app.status;
  END IF;

  IF v_app.assigned_studio_id IS NULL THEN
    RAISE EXCEPTION 'Application has no assigned studio';
  END IF;

  v_studio_id := v_app.assigned_studio_id;

  SELECT s.studio_number INTO v_studio_number
  FROM public.studios s
  WHERE s.id = v_studio_id;

  v_studio_number := COALESCE(NULLIF(TRIM(v_studio_number), ''), 'this studio');

  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = v_app.contract_id;

  IF NOT FOUND OR v_contract.contract_start IS NULL THEN
    RAISE EXCEPTION 'Contract start date is required for early check-in';
  END IF;

  IF p_early_check_in_date >= v_contract.contract_start::DATE THEN
    RAISE EXCEPTION 'Early check-in date must be before contract start (%)', v_contract.contract_start::DATE;
  END IF;

  SELECT * INTO v_existing
  FROM public.early_check_ins
  WHERE application_id = p_application_id;

  v_has_existing := FOUND;

  IF v_has_existing AND v_existing.status = 'confirmed' THEN
    RAISE EXCEPTION 'This application already has an early check-in';
  END IF;

  v_nights := (v_contract.contract_start::DATE - p_early_check_in_date);
  IF v_nights < 1 THEN
    RAISE EXCEPTION 'Early check-in must include at least one night';
  END IF;

  IF p_nightly_rate_override IS NOT NULL THEN
    IF p_nightly_rate_override < 0 THEN
      RAISE EXCEPTION 'Nightly rate cannot be negative';
    END IF;
    v_rate := ROUND(p_nightly_rate_override, 4);
  ELSE
    v_rate := public.get_early_check_in_nightly_rate(p_application_id);
  END IF;

  IF v_rate <= 0 THEN
    RAISE EXCEPTION 'Could not resolve nightly rate from studio grade weekly price. Set a weekly price or provide an override.';
  END IF;

  v_total := ROUND(v_rate * v_nights, 2);

  SELECT ob.external_ref, ob.check_in::DATE, ob.check_out::DATE, NULLIF(TRIM(ob.guest_name), '')
  INTO v_conflict_ota_ref, v_conflict_ota_in, v_conflict_ota_out, v_conflict_ota_guest
  FROM public.ota_bookings ob
  WHERE ob.studio_id = v_studio_id
    AND ob.status NOT IN ('cancelled', 'no_show')
    AND ob.check_in < v_contract.contract_start::DATE
    AND ob.check_out > p_early_check_in_date
  LIMIT 1;

  IF v_conflict_ota_ref IS NOT NULL OR v_conflict_ota_in IS NOT NULL THEN
    RAISE EXCEPTION
      'Studio % has an overlapping OTA booking% (% to %). Choose an early check-in on or after %, or move/cancel that OTA booking.',
      v_studio_number,
      CASE
        WHEN v_conflict_ota_guest IS NOT NULL AND COALESCE(v_conflict_ota_ref, '') <> ''
          THEN ' for ' || v_conflict_ota_guest || ' (ref ' || v_conflict_ota_ref || ')'
        WHEN v_conflict_ota_guest IS NOT NULL THEN ' for ' || v_conflict_ota_guest
        WHEN COALESCE(v_conflict_ota_ref, '') <> '' THEN ' (ref ' || v_conflict_ota_ref || ')'
        ELSE ''
      END,
      COALESCE(v_conflict_ota_in::TEXT, 'unknown'),
      COALESCE(v_conflict_ota_out::TEXT, 'unknown'),
      COALESCE(v_conflict_ota_out::TEXT, 'the OTA checkout date');
  END IF;

  SELECT
    sa.id,
    NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''),
    COALESCE(sa.actual_check_in_date, eci.early_check_in_date, c.contract_start::DATE),
    COALESCE(sa.actual_check_out_date, c.contract_end::DATE)
  INTO v_conflict_app_id, v_conflict_app_name, v_conflict_app_from, v_conflict_app_to
  FROM public.student_applications sa
  INNER JOIN public.contracts c ON c.id = sa.contract_id
  LEFT JOIN public.early_check_ins eci
    ON eci.application_id = sa.id AND eci.status = 'confirmed'
  LEFT JOIN public.profiles p ON p.id = sa.student_id
  WHERE sa.assigned_studio_id = v_studio_id
    AND sa.id <> p_application_id
    AND sa.status = 'confirmed'
    AND COALESCE(sa.actual_check_in_date, eci.early_check_in_date, c.contract_start::DATE)
        < v_contract.contract_start::DATE
    AND COALESCE(sa.actual_check_out_date, c.contract_end::DATE)
        > p_early_check_in_date
  LIMIT 1;

  IF v_conflict_app_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Studio % is occupied by % until %. Choose an early check-in on or after %, or record their check-out if they left earlier.',
      v_studio_number,
      COALESCE(v_conflict_app_name, 'another confirmed student'),
      v_conflict_app_to::TEXT,
      v_conflict_app_to::TEXT;
  END IF;

  SELECT
    eci.application_id,
    NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''),
    eci.early_check_in_date,
    eci.early_check_out_date
  INTO v_conflict_eci_app, v_conflict_eci_name, v_conflict_eci_from, v_conflict_eci_to
  FROM public.early_check_ins eci
  LEFT JOIN public.student_applications sa ON sa.id = eci.application_id
  LEFT JOIN public.profiles p ON p.id = sa.student_id
  WHERE eci.studio_id = v_studio_id
    AND eci.status = 'confirmed'
    AND eci.application_id <> p_application_id
    AND eci.early_check_in_date < v_contract.contract_start::DATE
    AND eci.early_check_out_date > p_early_check_in_date
  LIMIT 1;

  IF v_conflict_eci_app IS NOT NULL THEN
    RAISE EXCEPTION
      'Studio % already has early check-in for % (% to %). Choose a date on or after %, or cancel that early check-in first.',
      v_studio_number,
      COALESCE(v_conflict_eci_name, 'another student'),
      v_conflict_eci_from::TEXT,
      v_conflict_eci_to::TEXT,
      v_conflict_eci_to::TEXT;
  END IF;

  IF v_has_existing AND v_existing.status = 'cancelled' THEN
    UPDATE public.early_check_ins
    SET
      studio_id = v_studio_id,
      early_check_in_date = p_early_check_in_date,
      early_check_out_date = v_contract.contract_start::DATE,
      nights = v_nights,
      nightly_rate = v_rate,
      total_amount = v_total,
      status = 'confirmed',
      notes = NULLIF(TRIM(p_notes), ''),
      created_by = v_user_id,
      cancelled_at = NULL,
      cancelled_by = NULL,
      cancel_reason = NULL,
      updated_at = NOW()
    WHERE id = v_existing.id
    RETURNING id INTO v_eci_id;
  ELSE
    INSERT INTO public.early_check_ins (
      application_id, studio_id, early_check_in_date, early_check_out_date,
      nights, nightly_rate, total_amount, notes, created_by, status
    ) VALUES (
      p_application_id, v_studio_id, p_early_check_in_date, v_contract.contract_start::DATE,
      v_nights, v_rate, v_total, NULLIF(TRIM(p_notes), ''), v_user_id, 'confirmed'
    )
    RETURNING id INTO v_eci_id;
  END IF;

  UPDATE public.student_applications
  SET
    actual_check_in_date = NULL,
    updated_at = NOW()
  WHERE id = p_application_id
    AND checked_in_at IS NULL
    AND actual_check_out_date IS NULL
    AND actual_check_in_date IS NOT NULL
    AND (
      actual_check_in_date = p_early_check_in_date
      OR (v_has_existing AND actual_check_in_date = v_existing.early_check_in_date)
      OR actual_check_in_date > CURRENT_DATE
    );

  INSERT INTO public.activity_log (entity_type, entity_id, action, message, created_by)
  VALUES (
    'student_application', p_application_id, 'early_check_in_created',
    'Early check-in from ' || p_early_check_in_date::TEXT
      || ' to ' || v_contract.contract_start::DATE::TEXT
      || ' (' || v_nights::TEXT || ' nights @ ' || v_rate::TEXT || '). Total '
      || v_total::TEXT,
    v_user_id
  );

  RETURN jsonb_build_object(
    'early_check_in_id', v_eci_id,
    'application_id', p_application_id,
    'studio_id', v_studio_id,
    'early_check_in_date', p_early_check_in_date,
    'early_check_out_date', v_contract.contract_start::DATE,
    'nights', v_nights,
    'nightly_rate', v_rate,
    'total_amount', v_total
  );
END;
$function$;

COMMENT ON FUNCTION public.admin_create_early_check_in(UUID, DATE, TEXT, NUMERIC) IS
  'Staff-only: create/reactivate early check-in. Rejection messages include studio/occupant details for the admin UI.';
