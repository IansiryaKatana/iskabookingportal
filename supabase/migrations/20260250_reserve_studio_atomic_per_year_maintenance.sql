-- reserve_studio_atomic: reject reservation when studio is in maintenance for the application's academic year

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
  v_updated_rows INTEGER;
  v_academic_year_id UUID;
BEGIN
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

  -- Per-year maintenance: if application has an academic year, block if studio is in maintenance for that year
  SELECT c.academic_year_id INTO v_academic_year_id
  FROM public.student_applications sa
  JOIN public.contracts c ON c.id = sa.contract_id
  WHERE sa.id = p_application_id;

  IF v_academic_year_id IS NOT NULL THEN
    IF v_studio_status = 'maintenance' THEN
      RAISE EXCEPTION 'Studio is not available for reservation. It may be occupied, in maintenance, or already reserved by another student.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.studio_maintenance_by_academic_year m
      WHERE m.studio_id = p_studio_id AND m.academic_year_id = v_academic_year_id
    ) THEN
      RAISE EXCEPTION 'Studio is not available for reservation. It is in maintenance for this academic year.';
    END IF;
  END IF;

  IF NOT (
    (v_studio_status = 'available' AND (v_studio_allocation IS NULL OR v_studio_allocation = 'Student'))
    OR (v_studio_status = 'reserved' AND v_reservation_expires_at IS NOT NULL AND v_reservation_expires_at < NOW())
  ) THEN
    RAISE EXCEPTION 'Studio is not available for reservation. It may be occupied, in maintenance, or already reserved by another student.';
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
  WHERE id = p_studio_id
    AND (
      status = 'available'
      OR (status = 'reserved' AND reservation_expires_at IS NOT NULL AND reservation_expires_at < NOW())
    );

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows = 0 THEN
    RAISE EXCEPTION 'Studio reservation failed. The studio may have been reserved by another student just now.';
  END IF;

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
'Atomically reserves a studio for a student application. Respects per-academic-year maintenance (studio_maintenance_by_academic_year and global studios.status).';
