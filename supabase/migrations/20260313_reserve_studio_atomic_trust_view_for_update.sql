-- Refine reserve_studio_atomic to rely on the per-academic-year
-- availability checks from studio_status_by_academic_year for
-- concurrency, and avoid false "may have been reserved just now"
-- errors when the view says a studio is still available.
--
-- After the effective_status and allocation checks pass, we can
-- safely update the studios row without re-checking global status,
-- because any concurrent reservation will change the effective_status
-- seen by later transactions before they reach the UPDATE.

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
  v_expiry := NOW() + (p_reservation_duration_minutes || ' minutes')::INTERVAL;

  -- Lock the studio row globally to prevent race conditions while we
  -- evaluate and potentially update it.
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

  -- Determine the academic year for this application (if any).
  SELECT c.academic_year_id INTO v_academic_year_id
  FROM public.student_applications sa
  JOIN public.contracts c ON c.id = sa.contract_id
  WHERE sa.id = p_application_id;

  -- When we have an academic year, use per-year effective status so
  -- that the portal and this RPC agree on what "available" means.
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
    -- Fallback for legacy/global cases with no academic year context:
    -- keep original global studios-based availability rules.
    IF NOT (
      (v_studio_status = 'available' AND (v_studio_allocation IS NULL OR v_studio_allocation = 'Student'))
      OR (v_studio_status = 'reserved' AND v_reservation_expires_at IS NOT NULL AND v_reservation_expires_at < NOW())
    ) THEN
      RAISE EXCEPTION 'Studio is not available for reservation. It may be occupied, in maintenance, or already reserved by another student.';
    END IF;
  END IF;

  -- If there is a stale global reservation, clear it before
  -- reserving again.
  IF v_studio_status = 'reserved' AND v_reservation_expires_at IS NOT NULL AND v_reservation_expires_at < NOW() THEN
    UPDATE public.studios
    SET
      status = 'available',
      reservation_expires_at = NULL,
      allocation = NULL
    WHERE id = p_studio_id;
  END IF;

  -- At this point, per-year (or global) checks have guaranteed that
  -- the studio is reservable. We can safely update the studios row
  -- without re-checking status in the WHERE clause; any concurrent
  -- reservation will update the view first and cause later
  -- transactions to fail the availability checks above.
  UPDATE public.studios
  SET
    status = 'reserved',
    reservation_expires_at = v_expiry,
    allocation = p_student_id::TEXT
  WHERE id = p_studio_id;

  -- Update the application to point at the reserved studio.
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

  v_result := jsonb_build_object(
    'success', true,
    'studio_id', p_studio_id,
    'expiry', v_expiry,
    'message', 'Studio reserved successfully'
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'studio_id', p_studio_id
    );
END;
$$;

COMMENT ON FUNCTION public.reserve_studio_atomic(UUID, UUID, UUID, INTEGER) IS
'Atomically reserves a studio for a student application. Uses per-academic-year effective status (studio_status_by_academic_year) when available so portal and backend agree on availability, and trusts those checks when updating studios to avoid false race-condition errors.';

