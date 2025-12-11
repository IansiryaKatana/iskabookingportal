-- Studio Availability Tracking System
-- Calculates real-time availability per studio grade and contract

-- Function to calculate studio availability for a given grade and contract
CREATE OR REPLACE FUNCTION public.get_studio_availability(
  p_studio_grade_id UUID,
  p_contract_id UUID DEFAULT NULL
)
RETURNS TABLE (
  total_capacity INTEGER,
  available_count INTEGER,
  reserved_count INTEGER,
  occupied_count INTEGER,
  maintenance_count INTEGER,
  availability_percentage NUMERIC
) 
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total INTEGER;
  v_available INTEGER;
  v_reserved INTEGER;
  v_occupied INTEGER;
  v_maintenance INTEGER;
  v_percentage NUMERIC;
BEGIN
  -- Count total capacity (active studios only, excluding maintenance)
  SELECT COUNT(*)
  INTO v_total
  FROM public.studios
  WHERE studio_grade_id = p_studio_grade_id
    AND is_active = true
    AND status != 'maintenance';

  -- If contract_id provided, filter by studios assigned to applications for this contract
  IF p_contract_id IS NOT NULL THEN
    -- Count available (status = 'available' AND not reserved by any application for this contract)
    SELECT COUNT(*)
    INTO v_available
    FROM public.studios s
    WHERE s.studio_grade_id = p_studio_grade_id
      AND s.is_active = true
      AND s.status = 'available'
      AND (
        s.reservation_expires_at IS NULL 
        OR s.reservation_expires_at < NOW()
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.student_applications sa
        WHERE sa.assigned_studio_id = s.id
          AND sa.contract_id = p_contract_id
          AND sa.status IN ('draft', 'awaiting_deposit', 'awaiting_signature', 'awaiting_verification', 'confirmed')
          AND (
            sa.reserved_studio_expires_at IS NULL
            OR sa.reserved_studio_expires_at > NOW()
          )
      );

    -- Count reserved (status = 'reserved' OR has active reservation for this contract)
    SELECT COUNT(*)
    INTO v_reserved
    FROM public.studios s
    WHERE s.studio_grade_id = p_studio_grade_id
      AND s.is_active = true
      AND (
        s.status = 'reserved'
        OR EXISTS (
          SELECT 1
          FROM public.student_applications sa
          WHERE sa.assigned_studio_id = s.id
            AND sa.contract_id = p_contract_id
            AND sa.status IN ('draft', 'awaiting_deposit', 'awaiting_signature', 'awaiting_verification')
            AND (
              sa.reserved_studio_expires_at IS NOT NULL
              AND sa.reserved_studio_expires_at > NOW()
            )
        )
      );

    -- Count occupied (status = 'occupied' OR confirmed applications for this contract)
    SELECT COUNT(DISTINCT s.id)
    INTO v_occupied
    FROM public.studios s
    INNER JOIN public.student_applications sa ON sa.assigned_studio_id = s.id
    WHERE s.studio_grade_id = p_studio_grade_id
      AND s.is_active = true
      AND sa.contract_id = p_contract_id
      AND sa.status = 'confirmed';
  ELSE
    -- No contract filter - count all studios for this grade
    SELECT COUNT(*)
    INTO v_available
    FROM public.studios s
    WHERE s.studio_grade_id = p_studio_grade_id
      AND s.is_active = true
      AND s.status = 'available'
      AND (
        s.reservation_expires_at IS NULL 
        OR s.reservation_expires_at < NOW()
      );

    SELECT COUNT(*)
    INTO v_reserved
    FROM public.studios s
    WHERE s.studio_grade_id = p_studio_grade_id
      AND s.is_active = true
      AND s.status = 'reserved';

    SELECT COUNT(*)
    INTO v_occupied
    FROM public.studios s
    WHERE s.studio_grade_id = p_studio_grade_id
      AND s.is_active = true
      AND s.status = 'occupied';
  END IF;

  -- Count maintenance (always excluded from capacity)
  SELECT COUNT(*)
  INTO v_maintenance
  FROM public.studios s
  WHERE s.studio_grade_id = p_studio_grade_id
    AND s.is_active = true
    AND s.status = 'maintenance';

  -- Calculate percentage
  IF v_total > 0 THEN
    v_percentage := ROUND((v_available::NUMERIC / v_total::NUMERIC) * 100, 2);
  ELSE
    v_percentage := 0;
  END IF;

  RETURN QUERY SELECT 
    COALESCE(v_total, 0),
    COALESCE(v_available, 0),
    COALESCE(v_reserved, 0),
    COALESCE(v_occupied, 0),
    COALESCE(v_maintenance, 0),
    COALESCE(v_percentage, 0);
END;
$$;

-- View for easy querying of availability per grade and contract
CREATE OR REPLACE VIEW public.studio_grade_availability AS
SELECT 
  sg.id AS studio_grade_id,
  sg.name AS studio_grade_name,
  sg.slug AS studio_grade_slug,
  c.id AS contract_id,
  c.name AS contract_name,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  (SELECT total_capacity FROM public.get_studio_availability(sg.id, c.id)) AS total_capacity,
  (SELECT available_count FROM public.get_studio_availability(sg.id, c.id)) AS available_count,
  (SELECT reserved_count FROM public.get_studio_availability(sg.id, c.id)) AS reserved_count,
  (SELECT occupied_count FROM public.get_studio_availability(sg.id, c.id)) AS occupied_count,
  (SELECT maintenance_count FROM public.get_studio_availability(sg.id, c.id)) AS maintenance_count,
  (SELECT availability_percentage FROM public.get_studio_availability(sg.id, c.id)) AS availability_percentage
FROM public.studio_grades sg
CROSS JOIN public.contracts c
INNER JOIN public.academic_years ay ON c.academic_year_id = ay.id
WHERE sg.is_active = true
  AND c.is_active = true
  AND ay.is_active = true;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_studios_grade_status_active 
ON public.studios(studio_grade_id, status, is_active) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_applications_contract_studio_status 
ON public.student_applications(contract_id, assigned_studio_id, status);

-- Grant permissions
GRANT SELECT ON public.studio_grade_availability TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_studio_availability(UUID, UUID) TO authenticated;

