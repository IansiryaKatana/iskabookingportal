-- 11 Sep 2026: curl used the anon key to call SECURITY DEFINER studio RPCs.
-- reassign_studio_allocation actually flipped PUH-2080 OTA → Student.
-- reserve_studio_atomic returned HTTP 200 with success:false (no hold).
-- Students may still reserve their own application after login.
-- Staff reassignment requires MFA.

-- ---------------------------------------------------------------------------
-- Revert the unauthenticated allocation change
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_studio_id uuid := 'e4b86182-aa5c-45ca-bfd1-fd7e927f833e';
  v_current text;
  v_ota_count integer;
BEGIN
  SELECT allocation INTO v_current
  FROM public.studios
  WHERE id = v_studio_id
  FOR UPDATE;

  IF FOUND AND v_current IS DISTINCT FROM 'OTA' THEN
    SELECT COUNT(*) INTO v_ota_count
    FROM public.ota_bookings ob
    WHERE ob.studio_id = v_studio_id
      AND ob.status NOT IN ('cancelled', 'no_show')
      AND ob.check_out >= CURRENT_DATE;

    UPDATE public.studio_allocation_history
    SET ends_at = NOW()
    WHERE studio_id = v_studio_id
      AND ends_at IS NULL;

    UPDATE public.studios
    SET allocation = 'OTA'
    WHERE id = v_studio_id;

    INSERT INTO public.studio_allocation_history (
      studio_id,
      previous_allocation,
      new_allocation,
      starts_at,
      changed_by,
      reason,
      policy,
      impacted_ota_bookings_count,
      metadata
    ) VALUES (
      v_studio_id,
      v_current,
      'OTA',
      NOW(),
      NULL,
      'Security revert after unauthenticated curl reassignment on 11 Sep 2026',
      'keep',
      COALESCE(v_ota_count, 0),
      jsonb_build_object('source', 'security_revert')
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- reassign_studio_allocation: staff + MFA only
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.reassign_studio_allocation(uuid, text, text, text, uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.reassign_studio_allocation(uuid, text, text, text, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reassign_studio_allocation(
  p_studio_id uuid,
  p_new_allocation text,
  p_policy text DEFAULT 'keep',
  p_reason text DEFAULT NULL,
  p_target_studio_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth
AS $$
DECLARE
  v_current_allocation text;
  v_impacted_ota_bookings integer := 0;
  v_moved_ota_bookings integer := 0;
  v_target_allocation text;
  v_user_id uuid := auth.uid();
BEGIN
  IF current_user <> 'service_role' THEN
    IF v_user_id IS NULL
       OR NOT public.is_privileged_portal_user()
       OR NOT public.jwt_is_aal2() THEN
      PERFORM public.raise_security_alert(
        'blocked_privileged_action',
        jsonb_build_object(
          'rpc', 'reassign_studio_allocation',
          'reason', 'allocation_without_staff_mfa',
          'studio_id', p_studio_id
        )
      );
      RAISE EXCEPTION 'Forbidden: Staff MFA is required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_new_allocation IS DISTINCT FROM NULL
    AND p_new_allocation NOT IN ('Student', 'OTA', 'Keyworkers') THEN
    RAISE EXCEPTION 'Invalid allocation value: %', p_new_allocation;
  END IF;

  IF p_policy NOT IN ('keep', 'move') THEN
    RAISE EXCEPTION 'Invalid policy: %. Allowed: keep, move', p_policy;
  END IF;

  SELECT allocation
  INTO v_current_allocation
  FROM public.studios
  WHERE id = p_studio_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Studio not found';
  END IF;

  SELECT COUNT(*)
  INTO v_impacted_ota_bookings
  FROM public.ota_bookings ob
  WHERE ob.studio_id = p_studio_id
    AND ob.status NOT IN ('cancelled', 'no_show')
    AND ob.check_out >= CURRENT_DATE;

  IF v_current_allocation = 'OTA'
    AND COALESCE(p_new_allocation, '') <> 'OTA'
    AND v_impacted_ota_bookings > 0
    AND p_policy = 'move' THEN
    IF p_target_studio_id IS NULL THEN
      RAISE EXCEPTION 'Target OTA studio is required when policy is move';
    END IF;

    IF p_target_studio_id = p_studio_id THEN
      RAISE EXCEPTION 'Target OTA studio must be different from source studio';
    END IF;

    SELECT allocation
    INTO v_target_allocation
    FROM public.studios
    WHERE id = p_target_studio_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target OTA studio not found';
    END IF;

    IF v_target_allocation IS DISTINCT FROM 'OTA' THEN
      RAISE EXCEPTION 'Target studio must currently be allocated to OTA';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.ota_bookings src
      JOIN public.ota_bookings tgt
        ON tgt.studio_id = p_target_studio_id
       AND tgt.status NOT IN ('cancelled', 'no_show')
       AND src.status NOT IN ('cancelled', 'no_show')
       AND src.studio_id = p_studio_id
       AND src.check_out >= CURRENT_DATE
       AND src.check_in < tgt.check_out
       AND src.check_out > tgt.check_in
    ) THEN
      RAISE EXCEPTION 'Target OTA studio has overlapping active bookings';
    END IF;

    UPDATE public.ota_bookings
    SET studio_id = p_target_studio_id
    WHERE studio_id = p_studio_id
      AND status NOT IN ('cancelled', 'no_show')
      AND check_out >= CURRENT_DATE;

    GET DIAGNOSTICS v_moved_ota_bookings = ROW_COUNT;
  END IF;

  UPDATE public.studios
  SET allocation = p_new_allocation
  WHERE id = p_studio_id;

  UPDATE public.studio_allocation_history
  SET ends_at = NOW()
  WHERE studio_id = p_studio_id
    AND ends_at IS NULL;

  INSERT INTO public.studio_allocation_history (
    studio_id,
    previous_allocation,
    new_allocation,
    starts_at,
    changed_by,
    reason,
    policy,
    impacted_ota_bookings_count,
    metadata
  ) VALUES (
    p_studio_id,
    v_current_allocation,
    p_new_allocation,
    NOW(),
    v_user_id,
    p_reason,
    p_policy,
    v_impacted_ota_bookings,
    jsonb_build_object(
      'moved_ota_bookings', v_moved_ota_bookings,
      'target_studio_id', p_target_studio_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'studio_id', p_studio_id,
    'previous_allocation', v_current_allocation,
    'new_allocation', p_new_allocation,
    'impacted_ota_bookings', v_impacted_ota_bookings,
    'moved_ota_bookings', v_moved_ota_bookings,
    'policy', p_policy
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- preview_studio_allocation_change: same staff + MFA gate
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.preview_studio_allocation_change(uuid, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.preview_studio_allocation_change(uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.preview_studio_allocation_change(
  p_studio_id uuid,
  p_new_allocation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth
AS $$
DECLARE
  v_current_allocation text;
  v_conflict_count integer := 0;
BEGIN
  IF current_user <> 'service_role' THEN
    IF (SELECT auth.uid()) IS NULL
       OR NOT public.is_privileged_portal_user()
       OR NOT public.jwt_is_aal2() THEN
      RAISE EXCEPTION 'Forbidden: Staff MFA is required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT allocation
  INTO v_current_allocation
  FROM public.studios
  WHERE id = p_studio_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Studio not found';
  END IF;

  IF v_current_allocation = 'OTA' AND COALESCE(p_new_allocation, '') <> 'OTA' THEN
    SELECT COUNT(*)
    INTO v_conflict_count
    FROM public.ota_bookings ob
    WHERE ob.studio_id = p_studio_id
      AND ob.status NOT IN ('cancelled', 'no_show')
      AND ob.check_out >= CURRENT_DATE;
  END IF;

  RETURN jsonb_build_object(
    'studio_id', p_studio_id,
    'current_allocation', v_current_allocation,
    'new_allocation', p_new_allocation,
    'future_ota_bookings', v_conflict_count
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- reserve_studio_atomic: logged-in student for their own application, or staff MFA
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.reserve_studio_atomic(uuid, uuid, uuid, integer)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.reserve_studio_atomic(uuid, uuid, uuid, integer)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reserve_studio_atomic(
  p_studio_id uuid,
  p_application_id uuid,
  p_student_id uuid,
  p_reservation_duration_minutes integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth
AS $$
DECLARE
  v_expiry timestamptz;
  v_studio_status text;
  v_studio_allocation text;
  v_reservation_expires_at timestamptz;
  v_academic_year_id uuid;
  v_effective_status text;
  v_uid uuid := auth.uid();
BEGIN
  IF current_user <> 'service_role' THEN
    IF v_uid IS NULL THEN
      PERFORM public.raise_security_alert(
        'blocked_privileged_action',
        jsonb_build_object(
          'rpc', 'reserve_studio_atomic',
          'reason', 'reserve_without_login',
          'studio_id', p_studio_id
        )
      );
      RAISE EXCEPTION 'Forbidden: Sign in is required'
        USING ERRCODE = '42501';
    END IF;

    IF v_uid = p_student_id THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.student_applications sa
        WHERE sa.id = p_application_id
          AND sa.student_id = p_student_id
      ) THEN
        RAISE EXCEPTION 'Forbidden: Application does not belong to this user'
          USING ERRCODE = '42501';
      END IF;
    ELSIF NOT (
      public.is_privileged_portal_user()
      AND public.jwt_is_aal2()
    ) THEN
      PERFORM public.raise_security_alert(
        'blocked_privileged_action',
        jsonb_build_object(
          'rpc', 'reserve_studio_atomic',
          'reason', 'reserve_without_owner_or_staff_mfa',
          'studio_id', p_studio_id
        )
      );
      RAISE EXCEPTION 'Forbidden: Staff MFA is required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM public.release_expired_studio_holds();

  v_expiry := NOW() + (p_reservation_duration_minutes || ' minutes')::INTERVAL;

  SELECT status, allocation, reservation_expires_at
  INTO v_studio_status, v_studio_allocation, v_reservation_expires_at
  FROM public.studios
  WHERE id = p_studio_id
  FOR UPDATE;

  IF v_studio_status IS NULL THEN
    RAISE EXCEPTION 'Studio not found';
  END IF;

  SELECT c.academic_year_id INTO v_academic_year_id
  FROM public.student_applications sa
  JOIN public.contracts c ON c.id = sa.contract_id
  WHERE sa.id = p_application_id;

  IF v_academic_year_id IS NOT NULL THEN
    SELECT effective_status, allocation, reservation_expires_at
    INTO v_effective_status, v_studio_allocation, v_reservation_expires_at
    FROM public.studio_status_by_academic_year
    WHERE studio_id = p_studio_id
      AND academic_year_id = v_academic_year_id;

    IF v_effective_status IS NULL THEN
      RAISE EXCEPTION 'Studio not available for this academic year';
    END IF;

    IF NOT (
      (v_effective_status = 'available' AND (v_studio_allocation IS NULL OR v_studio_allocation = 'Student'))
      OR (v_effective_status = 'reserved' AND v_reservation_expires_at IS NOT NULL AND v_reservation_expires_at < NOW())
    ) THEN
      RAISE EXCEPTION 'Studio is not available for reservation. It may be occupied, in maintenance, or already reserved by another student.';
    END IF;
  ELSE
    IF NOT (
      (v_studio_status = 'available' AND (v_studio_allocation IS NULL OR v_studio_allocation = 'Student'))
      OR (v_studio_status = 'reserved' AND v_reservation_expires_at IS NOT NULL AND v_reservation_expires_at < NOW())
    ) THEN
      RAISE EXCEPTION 'Studio is not available for reservation. It may be occupied, in maintenance, or already reserved by another student.';
    END IF;
  END IF;

  IF v_studio_status = 'reserved' AND v_reservation_expires_at IS NOT NULL AND v_reservation_expires_at < NOW() THEN
    UPDATE public.studios
    SET status = 'available', reservation_expires_at = NULL, allocation = NULL
    WHERE id = p_studio_id;
  END IF;

  UPDATE public.studios
  SET
    status = 'reserved',
    reservation_expires_at = v_expiry,
    allocation = p_student_id::TEXT
  WHERE id = p_studio_id;

  UPDATE public.student_applications
  SET
    assigned_studio_id = p_studio_id,
    reserved_studio_expires_at = v_expiry
  WHERE id = p_application_id;

  IF NOT FOUND THEN
    UPDATE public.studios
    SET status = 'available', reservation_expires_at = NULL, allocation = NULL
    WHERE id = p_studio_id;
    RAISE EXCEPTION 'Application not found. Studio reservation has been released.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'studio_id', p_studio_id,
    'expiry', v_expiry,
    'message', 'Studio reserved successfully'
  );
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE;
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'studio_id', p_studio_id
    );
END;
$$;

-- CREATE OR REPLACE preserves privileges, but re-lock after replace in case of recreate.
REVOKE ALL ON FUNCTION public.reassign_studio_allocation(uuid, text, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_studio_allocation(uuid, text, text, text, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.preview_studio_allocation_change(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_studio_allocation_change(uuid, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reserve_studio_atomic(uuid, uuid, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_studio_atomic(uuid, uuid, uuid, integer)
  TO authenticated, service_role;
