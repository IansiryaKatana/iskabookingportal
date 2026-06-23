-- Complete studio hold release: timer-aware availability, DB-native cleanup,
-- and integration with reserve_studio_atomic (no GitHub cron dependency).
--
-- Policy:
--   draft            → 30 min hold (set by reserve_studio_atomic from portal)
--   awaiting_deposit → 48 h hold (extended when step 4 completes)
--   awaiting_signature+ → permanent until checkout/cancel (never auto-released)

-- Helper: true when an application still actively blocks a studio.
CREATE OR REPLACE FUNCTION public.application_actively_holds_studio(
  p_status public.application_status,
  p_reserved_studio_expires_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_status IN ('awaiting_signature', 'awaiting_verification', 'confirmed') THEN TRUE
    WHEN p_status IN ('draft', 'awaiting_deposit')
      AND p_reserved_studio_expires_at IS NOT NULL
      AND p_reserved_studio_expires_at > NOW() THEN TRUE
    ELSE FALSE
  END;
$$;

COMMENT ON FUNCTION public.application_actively_holds_studio(public.application_status, TIMESTAMPTZ) IS
'Whether a student application should block studio availability. Post-deposit statuses always block; pre-deposit only while reserved_studio_expires_at is in the future.';

-- Release expired tentative holds and orphan studio rows.
CREATE OR REPLACE FUNCTION public.release_expired_studio_holds()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_app RECORD;
  v_released INTEGER := 0;
  v_studio_id UUID;
BEGIN
  FOR v_app IN
    SELECT id, assigned_studio_id
    FROM public.student_applications
    WHERE status IN ('draft', 'awaiting_deposit')
      AND assigned_studio_id IS NOT NULL
      AND (
        (reserved_studio_expires_at IS NOT NULL AND reserved_studio_expires_at < NOW())
        OR (
          reserved_studio_expires_at IS NULL
          AND status = 'draft'
          AND updated_at < NOW() - INTERVAL '30 minutes'
        )
        OR (
          reserved_studio_expires_at IS NULL
          AND status = 'awaiting_deposit'
          AND updated_at < NOW() - INTERVAL '48 hours'
        )
      )
    FOR UPDATE SKIP LOCKED
  LOOP
    v_studio_id := v_app.assigned_studio_id;

    UPDATE public.student_applications
    SET
      assigned_studio_id = NULL,
      reserved_studio_expires_at = NULL
    WHERE id = v_app.id;

    v_released := v_released + 1;

    IF v_studio_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.student_applications sa
      WHERE sa.assigned_studio_id = v_studio_id
        AND public.application_actively_holds_studio(sa.status, sa.reserved_studio_expires_at)
    ) THEN
      UPDATE public.studios
      SET
        status = 'available',
        reservation_expires_at = NULL,
        allocation = NULL
      WHERE id = v_studio_id;
    END IF;
  END LOOP;

  -- Orphan global reserved rows with no active holder.
  UPDATE public.studios s
  SET
    status = 'available',
    reservation_expires_at = NULL,
    allocation = NULL
  WHERE s.status = 'reserved'
    AND (
      (s.reservation_expires_at IS NOT NULL AND s.reservation_expires_at < NOW())
      OR NOT EXISTS (
        SELECT 1
        FROM public.student_applications sa
        WHERE sa.assigned_studio_id = s.id
          AND public.application_actively_holds_studio(sa.status, sa.reserved_studio_expires_at)
      )
    );

  RETURN jsonb_build_object(
    'released_applications', v_released,
    'ran_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.release_expired_studio_holds() IS
'Releases expired pre-deposit studio holds (draft 30m, awaiting_deposit 48h). Never touches post-deposit applications. Safe to call frequently from RPC, reservations, or pg_cron.';

GRANT EXECUTE ON FUNCTION public.release_expired_studio_holds() TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_studio_holds() TO service_role;

-- Extend hold when student completes documentation (step 4 → awaiting_deposit).
CREATE OR REPLACE FUNCTION public.extend_studio_hold_for_deposit(p_application_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_expiry TIMESTAMPTZ := NOW() + INTERVAL '48 hours';
  v_studio_id UUID;
BEGIN
  SELECT assigned_studio_id INTO v_studio_id
  FROM public.student_applications
  WHERE id = p_application_id;

  IF v_studio_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No studio assigned');
  END IF;

  UPDATE public.student_applications
  SET
    status = 'awaiting_deposit',
    reserved_studio_expires_at = v_expiry
  WHERE id = p_application_id
    AND status IN ('draft', 'awaiting_deposit');

  UPDATE public.studios
  SET
    status = 'reserved',
    reservation_expires_at = v_expiry,
    allocation = (SELECT student_id::TEXT FROM public.student_applications WHERE id = p_application_id)
  WHERE id = v_studio_id;

  RETURN jsonb_build_object('success', true, 'expiry', v_expiry);
END;
$$;

COMMENT ON FUNCTION public.extend_studio_hold_for_deposit(UUID) IS
'Extends studio hold to 48 hours when the student completes step 4 and moves to awaiting_deposit.';

GRANT EXECUTE ON FUNCTION public.extend_studio_hold_for_deposit(UUID) TO authenticated;

-- View: tentative holds only block when timer is still active.
DROP VIEW IF EXISTS public.studio_status_by_academic_year CASCADE;

CREATE VIEW public.studio_status_by_academic_year AS
SELECT
  s.id AS studio_id,
  s.studio_number,
  s.studio_grade_id,
  s.floor,
  s.allocation,
  s.is_active,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.studio_maintenance_by_academic_year m
      WHERE m.studio_id = s.id AND m.academic_year_id = ay.id
    ) THEN 'maintenance'
    WHEN s.status = 'maintenance' THEN 'maintenance'
    WHEN s.allocation IN ('OTA', 'Keyworkers') THEN s.status
    WHEN EXISTS (
      SELECT 1
      FROM public.student_applications sa
      INNER JOIN public.contracts c ON sa.contract_id = c.id
      WHERE sa.assigned_studio_id = s.id
        AND c.academic_year_id = ay.id
        AND sa.status IN ('awaiting_signature', 'awaiting_verification', 'confirmed')
    ) THEN 'occupied'
    WHEN EXISTS (
      SELECT 1
      FROM public.student_applications sa
      INNER JOIN public.contracts c ON sa.contract_id = c.id
      WHERE sa.assigned_studio_id = s.id
        AND c.academic_year_id = ay.id
        AND sa.status IN ('draft', 'awaiting_deposit')
        AND sa.reserved_studio_expires_at IS NOT NULL
        AND sa.reserved_studio_expires_at > NOW()
    ) THEN 'reserved'
    WHEN s.status = 'reserved'
      AND s.reservation_expires_at IS NOT NULL
      AND s.reservation_expires_at > NOW()
      AND NOT EXISTS (
        SELECT 1
        FROM public.student_applications sa
        INNER JOIN public.contracts c ON sa.contract_id = c.id
        WHERE sa.assigned_studio_id = s.id
          AND c.academic_year_id != ay.id
          AND public.application_actively_holds_studio(sa.status, sa.reserved_studio_expires_at)
      )
    THEN 'reserved'
    ELSE 'available'
  END AS effective_status,
  s.status AS global_status,
  s.reservation_expires_at
FROM public.studios s
CROSS JOIN public.academic_years ay
WHERE s.is_active = true
  AND ay.is_active = true;

GRANT SELECT ON public.studio_status_by_academic_year TO authenticated;

COMMENT ON VIEW public.studio_status_by_academic_year IS
'Effective status per (studio, academic_year). Pre-deposit holds block only while reserved_studio_expires_at > NOW(). Post-deposit pipeline is occupied and never timer-released.';

DROP VIEW IF EXISTS public.studio_grade_availability_by_year;

CREATE VIEW public.studio_grade_availability_by_year AS
SELECT
  sg.id AS studio_grade_id,
  sg.name AS studio_grade_name,
  sg.slug AS studio_grade_slug,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  COUNT(DISTINCT CASE
    WHEN ss.is_active = true
      AND ss.effective_status <> 'maintenance'
      AND (ss.allocation IS NULL OR ss.allocation NOT IN ('OTA', 'Keyworkers'))
    THEN ss.studio_id
  END)::INTEGER AS total_capacity,
  COUNT(DISTINCT CASE
    WHEN ss.is_active = true
      AND ss.effective_status = 'available'
      AND (ss.allocation IS NULL OR ss.allocation NOT IN ('OTA', 'Keyworkers'))
    THEN ss.studio_id
  END)::INTEGER AS available_count,
  COUNT(DISTINCT CASE
    WHEN ss.is_active = true
      AND ss.effective_status = 'reserved'
      AND (ss.allocation IS NULL OR ss.allocation NOT IN ('OTA', 'Keyworkers'))
    THEN ss.studio_id
  END)::INTEGER AS reserved_count,
  COUNT(DISTINCT CASE
    WHEN ss.is_active = true
      AND ss.effective_status = 'occupied'
      AND (ss.allocation IS NULL OR ss.allocation NOT IN ('OTA', 'Keyworkers'))
    THEN ss.studio_id
  END)::INTEGER AS occupied_count,
  COUNT(DISTINCT CASE
    WHEN ss.is_active = true
      AND ss.effective_status = 'maintenance'
    THEN ss.studio_id
  END)::INTEGER AS maintenance_count,
  CASE
    WHEN COUNT(DISTINCT CASE
      WHEN ss.is_active = true
        AND ss.effective_status <> 'maintenance'
        AND (ss.allocation IS NULL OR ss.allocation NOT IN ('OTA', 'Keyworkers'))
      THEN ss.studio_id
    END) > 0
    THEN ROUND(
      (
        COUNT(DISTINCT CASE
          WHEN ss.is_active = true
            AND ss.effective_status = 'available'
            AND (ss.allocation IS NULL OR ss.allocation NOT IN ('OTA', 'Keyworkers'))
          THEN ss.studio_id
        END)::NUMERIC
        /
        COUNT(DISTINCT CASE
          WHEN ss.is_active = true
            AND ss.effective_status <> 'maintenance'
            AND (ss.allocation IS NULL OR ss.allocation NOT IN ('OTA', 'Keyworkers'))
          THEN ss.studio_id
        END)::NUMERIC
      ) * 100,
      2
    )
    ELSE 0
  END AS availability_percentage
FROM public.studio_grades sg
CROSS JOIN public.academic_years ay
LEFT JOIN public.studio_status_by_academic_year ss
  ON ss.studio_grade_id = sg.id
 AND ss.academic_year_id = ay.id
WHERE sg.is_active = true
  AND ay.is_active = true
GROUP BY
  sg.id, sg.name, sg.slug,
  ay.id, ay.name;

GRANT SELECT ON public.studio_grade_availability_by_year TO authenticated;
GRANT SELECT ON public.studio_grade_availability_by_year TO anon;

-- reserve_studio_atomic: run cleanup before every reservation attempt.
CREATE OR REPLACE FUNCTION public.reserve_studio_atomic(
  p_studio_id UUID,
  p_application_id UUID,
  p_student_id UUID,
  p_reservation_duration_minutes INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_expiry TIMESTAMPTZ;
  v_studio_status TEXT;
  v_studio_allocation TEXT;
  v_reservation_expires_at TIMESTAMPTZ;
  v_result JSONB;
  v_academic_year_id UUID;
  v_effective_status TEXT;
BEGIN
  PERFORM public.release_expired_studio_holds();

  v_expiry := NOW() + (p_reservation_duration_minutes || ' minutes')::INTERVAL;

  SELECT
    status,
    allocation,
    reservation_expires_at
  INTO
    v_studio_status,
    v_studio_allocation,
    v_reservation_expires_at
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
    SELECT
      effective_status,
      allocation,
      reservation_expires_at
    INTO
      v_effective_status,
      v_studio_allocation,
      v_reservation_expires_at
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
    SET
      status = 'available',
      reservation_expires_at = NULL,
      allocation = NULL
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
    SET
      status = 'available',
      reservation_expires_at = NULL,
      allocation = NULL
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
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'studio_id', p_studio_id
    );
END;
$$;

-- Wire trigger_release_expired_reservations to the real cleanup (for pg_cron / manual SQL).
CREATE OR REPLACE FUNCTION public.trigger_release_expired_reservations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN public.release_expired_studio_holds();
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_release_expired_reservations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_release_expired_reservations() TO service_role;

-- One-time cleanup of existing stale holds.
SELECT public.release_expired_studio_holds();

-- Schedule pg_cron when available (Supabase Dashboard → Database → Extensions: enable pg_cron).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'release-expired-studio-holds') THEN
      PERFORM cron.schedule(
        'release-expired-studio-holds',
        '*/5 * * * *',
        'SELECT public.release_expired_studio_holds();'
      );
      RAISE NOTICE 'Scheduled pg_cron job release-expired-studio-holds every 5 minutes';
    END IF;
  ELSE
    RAISE NOTICE 'pg_cron not enabled. Enable it in Supabase Dashboard → Database → Extensions, then re-run: SELECT cron.schedule(''release-expired-studio-holds'', ''*/5 * * * *'', ''SELECT public.release_expired_studio_holds();'');';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule pg_cron job: %. Cleanup still runs on every reservation and via release_expired_studio_holds() RPC.', SQLERRM;
END $$;
