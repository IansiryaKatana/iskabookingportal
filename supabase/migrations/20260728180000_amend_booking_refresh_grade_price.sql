-- When amending a booking to a different studio grade, refresh weekly_price_override
-- from the new grade's catalog price instead of copying the old grade's rate.

CREATE OR REPLACE FUNCTION public.amend_student_application_booking(
  p_application_id UUID,
  p_contract_start DATE,
  p_weeks INTEGER,
  p_extra_days SMALLINT DEFAULT 0,
  p_studio_grade_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_reset_signing BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_app public.student_applications%ROWTYPE;
  v_old_contract public.contracts%ROWTYPE;
  v_new_grade_id UUID;
  v_old_grade_id UUID;
  v_extra_days SMALLINT;
  v_contract_end DATE;
  v_new_contract_id UUID;
  v_plan_link RECORD;
  v_first_plan_id UUID;
  v_assigned_grade_id UUID;
  v_year_start DATE;
  v_year_end DATE;
  v_new_slug TEXT;
  v_new_name TEXT;
  v_grade_name TEXT;
  v_year_name TEXT;
  v_weekly_override NUMERIC(12,4);
  v_deposit_override NUMERIC(12,4);
  v_backfill_count INTEGER;
  v_new_status public.application_status;
  v_superseded_count INTEGER := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can amend application bookings';
  END IF;

  IF p_application_id IS NULL THEN
    RAISE EXCEPTION 'Application id is required';
  END IF;

  IF p_contract_start IS NULL THEN
    RAISE EXCEPTION 'Contract start date is required';
  END IF;

  IF p_weeks IS NULL OR p_weeks < 1 THEN
    RAISE EXCEPTION 'Weeks must be at least 1';
  END IF;

  v_extra_days := LEAST(6, GREATEST(0, COALESCE(p_extra_days, 0)))::SMALLINT;
  v_contract_end := (p_contract_start + (p_weeks * 7 + v_extra_days))::DATE;

  SELECT * INTO v_app
  FROM public.student_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF v_app.status NOT IN (
    'draft',
    'awaiting_deposit',
    'awaiting_signature',
    'awaiting_verification'
  ) THEN
    RAISE EXCEPTION 'Cannot amend booking: application status is % (only draft / pre-confirmation statuses allowed)', v_app.status;
  END IF;

  IF public.application_has_instalment_payments(p_application_id) THEN
    RAISE EXCEPTION 'Cannot amend booking: instalment payments have already been recorded for this application';
  END IF;

  SELECT * INTO v_old_contract
  FROM public.contracts
  WHERE id = v_app.contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Current contract not found';
  END IF;

  v_old_grade_id := COALESCE(v_old_contract.studio_grade_id, v_app.studio_grade_id);
  v_new_grade_id := COALESCE(p_studio_grade_id, v_app.studio_grade_id, v_old_contract.studio_grade_id);

  SELECT ay.start_date, ay.end_date, ay.name
  INTO v_year_start, v_year_end, v_year_name
  FROM public.academic_years ay
  WHERE ay.id = v_old_contract.academic_year_id;

  IF v_year_start IS NOT NULL AND p_contract_start < v_year_start THEN
    RAISE EXCEPTION 'Check-in date must be within the contract academic year';
  END IF;

  IF v_year_end IS NOT NULL AND v_contract_end > v_year_end THEN
    RAISE EXCEPTION 'Check-out date must be within the contract academic year';
  END IF;

  SELECT sg.name INTO v_grade_name
  FROM public.studio_grades sg
  WHERE sg.id = v_new_grade_id;

  IF v_grade_name IS NULL THEN
    RAISE EXCEPTION 'Invalid studio grade';
  END IF;

  -- Default: keep existing negotiated/catalog override when grade is unchanged.
  v_weekly_override := v_old_contract.weekly_price_override;
  v_deposit_override := v_old_contract.deposit_override;

  -- Grade change: refresh weekly (and deposit when catalog has one) from the new grade.
  IF v_new_grade_id IS DISTINCT FROM v_old_grade_id THEN
    SELECT sgp.weekly_price, sgp.deposit_amount_override
    INTO v_weekly_override, v_deposit_override
    FROM public.studio_grade_prices sgp
    WHERE sgp.academic_year_id = v_old_contract.academic_year_id
      AND sgp.studio_grade_id = v_new_grade_id
      AND sgp.is_active = true
    ORDER BY sgp.updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_weekly_override IS NULL THEN
      RAISE EXCEPTION 'No active weekly price found for studio grade % in this academic year', v_grade_name;
    END IF;

    -- Keep previous deposit only when the new grade has no catalog deposit override.
    IF v_deposit_override IS NULL THEN
      v_deposit_override := v_old_contract.deposit_override;
    END IF;
  END IF;

  v_new_slug := COALESCE(v_old_contract.slug, 'contract')
    || '-amend-'
    || LEFT(p_application_id::TEXT, 8)
    || '-'
    || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT;

  IF v_new_grade_id IS DISTINCT FROM v_old_grade_id THEN
    v_new_name := v_grade_name
      || ' Studio · '
      || p_weeks::TEXT
      || ' Weeks'
      || CASE
           WHEN v_year_name IS NOT NULL THEN ' · ' || v_year_name
           ELSE ''
         END
      || ' (amended '
      || TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      || ')';
  ELSE
    v_new_name := COALESCE(v_old_contract.name, 'Contract')
      || ' (amended '
      || TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      || ')';
  END IF;

  INSERT INTO public.contracts (
    academic_year_id,
    studio_grade_id,
    payment_plan_id,
    slug,
    name,
    summary,
    contract_start,
    contract_end,
    weeks,
    extra_days,
    weekly_price_override,
    deposit_override,
    cta_label,
    display_order,
    is_active,
    source_contract_id,
    student_application_id,
    visible_on_portal,
    is_custom_duration_placeholder
  ) VALUES (
    v_old_contract.academic_year_id,
    v_new_grade_id,
    v_old_contract.payment_plan_id,
    v_new_slug,
    v_new_name,
    v_old_contract.summary,
    p_contract_start,
    v_contract_end,
    p_weeks,
    v_extra_days,
    v_weekly_override,
    v_deposit_override,
    v_old_contract.cta_label,
    COALESCE(v_old_contract.display_order, 999),
    true,
    v_old_contract.id,
    p_application_id,
    false,
    false
  )
  RETURNING id INTO v_new_contract_id;

  FOR v_plan_link IN
    SELECT cpp.payment_plan_id, cpp.display_order
    FROM public.contract_payment_plans cpp
    WHERE cpp.contract_id = v_old_contract.id
    ORDER BY cpp.display_order NULLS LAST, cpp.payment_plan_id
  LOOP
    INSERT INTO public.contract_payment_plans (contract_id, payment_plan_id, display_order)
    VALUES (v_new_contract_id, v_plan_link.payment_plan_id, v_plan_link.display_order);
  END LOOP;

  SELECT cpp.payment_plan_id
  INTO v_first_plan_id
  FROM public.contract_payment_plans cpp
  WHERE cpp.contract_id = v_new_contract_id
  ORDER BY cpp.display_order NULLS LAST, cpp.payment_plan_id
  LIMIT 1;

  IF v_first_plan_id IS NULL AND v_app.selected_payment_plan_id IS NOT NULL THEN
    v_first_plan_id := v_app.selected_payment_plan_id;
    INSERT INTO public.contract_payment_plans (contract_id, payment_plan_id, display_order)
    VALUES (v_new_contract_id, v_first_plan_id, 1);
  END IF;

  IF v_first_plan_id IS NOT NULL THEN
    v_backfill_count := public.backfill_contract_payment_schedule_for_contract(
      v_new_contract_id,
      v_first_plan_id
    );
    IF v_backfill_count = 0 AND NOT EXISTS (
      SELECT 1 FROM public.contract_payment_schedule WHERE contract_id = v_new_contract_id
    ) THEN
      RAISE EXCEPTION 'Failed to generate payment schedule for amended contract';
    END IF;
  END IF;

  IF v_app.assigned_studio_id IS NOT NULL THEN
    SELECT s.studio_grade_id INTO v_assigned_grade_id
    FROM public.studios s
    WHERE s.id = v_app.assigned_studio_id;

    IF v_assigned_grade_id IS DISTINCT FROM v_new_grade_id THEN
      UPDATE public.studios
      SET status = 'available'
      WHERE id = v_app.assigned_studio_id
        AND status IN ('reserved', 'occupied');

      UPDATE public.student_applications
      SET assigned_studio_id = NULL
      WHERE id = p_application_id;
    END IF;
  END IF;

  IF p_reset_signing THEN
    UPDATE public.docusign_envelopes
    SET
      status = 'superseded',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'superseded_at', NOW(),
        'superseded_reason', COALESCE(NULLIF(TRIM(p_reason), ''), 'booking_amended')
      ),
      updated_at = NOW()
    WHERE application_id = p_application_id
      AND lower(status) <> 'superseded';

    GET DIAGNOSTICS v_superseded_count = ROW_COUNT;
  END IF;

  v_new_status := v_app.status;
  IF p_reset_signing AND v_app.status IN ('awaiting_verification', 'awaiting_signature') THEN
    v_new_status := 'awaiting_signature';
  END IF;

  UPDATE public.student_applications
  SET
    contract_id = v_new_contract_id,
    studio_grade_id = v_new_grade_id,
    requested_contract_start = NULL,
    requested_contract_end = NULL,
    status = v_new_status,
    updated_at = NOW()
  WHERE id = p_application_id;

  RETURN jsonb_build_object(
    'success', true,
    'application_id', p_application_id,
    'previous_contract_id', v_old_contract.id,
    'new_contract_id', v_new_contract_id,
    'contract_start', p_contract_start,
    'contract_end', v_contract_end,
    'weeks', p_weeks,
    'extra_days', v_extra_days,
    'studio_grade_id', v_new_grade_id,
    'weekly_price_override', v_weekly_override,
    'reason', p_reason,
    'signing_reset', p_reset_signing,
    'envelopes_superseded', v_superseded_count,
    'application_status', v_new_status,
    'total_contract_value', public.calculate_contract_value(v_new_contract_id)
  );
END;
$$;

COMMENT ON FUNCTION public.amend_student_application_booking(UUID, DATE, INTEGER, SMALLINT, UUID, TEXT, BOOLEAN) IS
  'Staff-only: clone per-application contract with new dates/grade. Grade changes refresh weekly_price_override from studio_grade_prices. Optional p_reset_signing marks agreements superseded and returns to awaiting_signature.';

REVOKE ALL ON FUNCTION public.amend_student_application_booking(UUID, DATE, INTEGER, SMALLINT, UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.amend_student_application_booking(UUID, DATE, INTEGER, SMALLINT, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.amend_student_application_booking(UUID, DATE, INTEGER, SMALLINT, UUID, TEXT, BOOLEAN) TO service_role;
