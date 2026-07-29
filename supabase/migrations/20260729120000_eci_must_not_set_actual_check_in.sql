-- Early check-in must not mark students as operationally checked in.
-- actual_check_in_date is reserved for real check-in; calendar already uses
-- COALESCE(actual_check_in_date, eci.early_check_in_date, contract_start).

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
  v_rate NUMERIC;
  v_nights INTEGER;
  v_total NUMERIC;
  v_existing public.early_check_ins%ROWTYPE;
  v_has_existing BOOLEAN := false;
  v_eci_id UUID;
  v_conflict_ota TEXT;
  v_conflict_app TEXT;
  v_conflict_eci TEXT;
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

  SELECT ob.external_ref INTO v_conflict_ota
  FROM public.ota_bookings ob
  WHERE ob.studio_id = v_studio_id
    AND ob.status NOT IN ('cancelled', 'no_show')
    AND ob.check_in < v_contract.contract_start::DATE
    AND ob.check_out > p_early_check_in_date
  LIMIT 1;

  IF v_conflict_ota IS NOT NULL THEN
    RAISE EXCEPTION 'Studio has an overlapping OTA booking (ref: %)', v_conflict_ota;
  END IF;

  SELECT sa.id::TEXT INTO v_conflict_app
  FROM public.student_applications sa
  INNER JOIN public.contracts c ON c.id = sa.contract_id
  LEFT JOIN public.early_check_ins eci
    ON eci.application_id = sa.id AND eci.status = 'confirmed'
  WHERE sa.assigned_studio_id = v_studio_id
    AND sa.id <> p_application_id
    AND sa.status = 'confirmed'
    AND COALESCE(sa.actual_check_in_date, eci.early_check_in_date, c.contract_start::DATE)
        < v_contract.contract_start::DATE
    AND COALESCE(sa.actual_check_out_date, c.contract_end::DATE)
        > p_early_check_in_date
  LIMIT 1;

  IF v_conflict_app IS NOT NULL THEN
    RAISE EXCEPTION 'Studio has an overlapping student booking (application %)', v_conflict_app;
  END IF;

  SELECT eci.application_id::TEXT INTO v_conflict_eci
  FROM public.early_check_ins eci
  WHERE eci.studio_id = v_studio_id
    AND eci.status = 'confirmed'
    AND eci.application_id <> p_application_id
    AND eci.early_check_in_date < v_contract.contract_start::DATE
    AND eci.early_check_out_date > p_early_check_in_date
  LIMIT 1;

  IF v_conflict_eci IS NOT NULL THEN
    RAISE EXCEPTION 'Studio has an overlapping early check-in (application %)', v_conflict_eci;
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

  -- Clear any planned ECI date previously written into actual_check_in_date
  -- when no operational check-in was recorded.
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
  'Staff-only: create/reactivate early check-in. Does not set actual_check_in_date (operational check-in only).';

-- Repair students wrongly marked in-house because ECI wrote the planned arrival
-- into actual_check_in_date without an operational check-in stamp.
UPDATE public.student_applications sa
SET
  actual_check_in_date = NULL,
  updated_at = NOW()
FROM public.early_check_ins eci
WHERE eci.application_id = sa.id
  AND eci.status = 'confirmed'
  AND sa.actual_check_in_date IS NOT NULL
  AND sa.actual_check_in_date = eci.early_check_in_date
  AND sa.checked_in_at IS NULL
  AND sa.actual_check_out_date IS NULL;

-- Also clear future planned check-in dates with no operational stamp.
UPDATE public.student_applications
SET
  actual_check_in_date = NULL,
  updated_at = NOW()
WHERE actual_check_in_date > CURRENT_DATE
  AND checked_in_at IS NULL
  AND actual_check_out_date IS NULL;
