-- Admin release of studios whose confirmed contracts have ended.
-- This keeps student applications as historical data but stops them
-- counting as current occupancy for the studio status view.

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
  v_updated_apps INTEGER := 0;
BEGIN
  -- Mark all matching confirmed applications as checked_out, but keep
  -- their association to the studio for history so booking calendar and
  -- studio detail still show who stayed here.
  UPDATE public.student_applications sa
  SET status = 'checked_out'
  FROM public.contracts c
  WHERE sa.assigned_studio_id = p_studio_id
    AND sa.status = 'confirmed'
    AND sa.contract_id = c.id
    AND c.contract_end::DATE < v_today
    AND (p_academic_year_id IS NULL OR c.academic_year_id = p_academic_year_id);

  GET DIAGNOSTICS v_updated_apps = ROW_COUNT;

  -- Ensure the studio itself is globally available.
  UPDATE public.studios
  SET
    status = 'available',
    allocation = NULL,
    reservation_expires_at = NULL
  WHERE id = p_studio_id;

  RETURN jsonb_build_object(
    'updated_applications', v_updated_apps
  );
END;
$$;

COMMENT ON FUNCTION public.admin_release_studio_occupancy(UUID, UUID) IS
'Marks ended confirmed applications for a studio as checked_out (by academic year when provided) and globally frees the studio for new allocations, while preserving application history.';

GRANT EXECUTE ON FUNCTION public.admin_release_studio_occupancy(UUID, UUID) TO authenticated;

