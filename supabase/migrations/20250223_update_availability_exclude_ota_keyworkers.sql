-- Update Studio Availability to Exclude OTA/Keyworkers Allocated Studios
-- Studios allocated to OTA or Keyworkers should not count toward student availability

-- Update the get_studio_availability function to exclude OTA/Keyworkers
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
  -- Count total capacity (active studios only, excluding maintenance and OTA/Keyworkers allocated)
  SELECT COUNT(*)
  INTO v_total
  FROM public.studios
  WHERE studio_grade_id = p_studio_grade_id
    AND is_active = true
    AND status != 'maintenance'
    AND (allocation IS NULL OR allocation NOT IN ('OTA', 'Keyworkers'));

  -- If contract_id provided, filter by studios assigned to applications for this contract
  IF p_contract_id IS NOT NULL THEN
    -- Count available (status = 'available' AND not reserved by any application for this contract)
    -- AND not allocated to OTA/Keyworkers
    SELECT COUNT(*)
    INTO v_available
    FROM public.studios s
    WHERE s.studio_grade_id = p_studio_grade_id
      AND s.is_active = true
      AND s.status = 'available'
      AND (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'))
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
    -- AND not allocated to OTA/Keyworkers
    SELECT COUNT(*)
    INTO v_reserved
    FROM public.studios s
    WHERE s.studio_grade_id = p_studio_grade_id
      AND s.is_active = true
      AND (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'))
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
    -- AND not allocated to OTA/Keyworkers
    SELECT COUNT(DISTINCT s.id)
    INTO v_occupied
    FROM public.studios s
    INNER JOIN public.student_applications sa ON sa.assigned_studio_id = s.id
    WHERE s.studio_grade_id = p_studio_grade_id
      AND s.is_active = true
      AND (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'))
      AND sa.contract_id = p_contract_id
      AND sa.status = 'confirmed';
  ELSE
    -- No contract filter - count all studios for this grade (excluding OTA/Keyworkers)
    SELECT COUNT(*)
    INTO v_available
    FROM public.studios s
    WHERE s.studio_grade_id = p_studio_grade_id
      AND s.is_active = true
      AND s.status = 'available'
      AND (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'))
      AND (
        s.reservation_expires_at IS NULL 
        OR s.reservation_expires_at < NOW()
      );

    SELECT COUNT(*)
    INTO v_reserved
    FROM public.studios s
    WHERE s.studio_grade_id = p_studio_grade_id
      AND s.is_active = true
      AND s.status = 'reserved'
      AND (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'));

    SELECT COUNT(*)
    INTO v_occupied
    FROM public.studios s
    WHERE s.studio_grade_id = p_studio_grade_id
      AND s.is_active = true
      AND s.status = 'occupied'
      AND (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'));
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

-- Update studio_grade_availability_by_year view to exclude OTA/Keyworkers
DROP VIEW IF EXISTS public.studio_grade_availability_by_year CASCADE;

CREATE VIEW public.studio_grade_availability_by_year AS
SELECT 
  sg.id AS studio_grade_id,
  sg.name AS studio_grade_name,
  sg.slug AS studio_grade_slug,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  -- Total capacity: exclude maintenance and OTA/Keyworkers
  COUNT(DISTINCT CASE 
    WHEN s.status != 'maintenance' 
      AND (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'))
    THEN s.id 
  END)::INTEGER AS total_capacity,
  -- Available: status = 'available' AND not assigned to any application for this academic year
  -- AND not allocated to OTA/Keyworkers
  COUNT(DISTINCT CASE 
    WHEN s.status = 'available' 
      AND (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'))
      AND (s.reservation_expires_at IS NULL OR s.reservation_expires_at < NOW())
      AND NOT EXISTS (
        SELECT 1 
        FROM public.student_applications sa
        INNER JOIN public.contracts c ON sa.contract_id = c.id
        WHERE sa.assigned_studio_id = s.id
          AND c.academic_year_id = ay.id
          AND sa.status IN ('draft', 'awaiting_deposit', 'awaiting_signature', 'awaiting_verification', 'confirmed')
          AND (
            sa.reserved_studio_expires_at IS NULL 
            OR sa.reserved_studio_expires_at > NOW()
          )
      )
    THEN s.id 
  END)::INTEGER AS available_count,
  -- Reserved: status = 'reserved' OR has active reservation for this academic year
  -- AND not allocated to OTA/Keyworkers
  COUNT(DISTINCT CASE 
    WHEN (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'))
      AND (
        s.status = 'reserved' 
        OR EXISTS (
          SELECT 1 
          FROM public.student_applications sa
          INNER JOIN public.contracts c ON sa.contract_id = c.id
          WHERE sa.assigned_studio_id = s.id
            AND c.academic_year_id = ay.id
            AND sa.status IN ('draft', 'awaiting_deposit', 'awaiting_signature', 'awaiting_verification')
            AND (
              sa.reserved_studio_expires_at IS NOT NULL 
              AND sa.reserved_studio_expires_at > NOW()
            )
        )
      )
    THEN s.id 
  END)::INTEGER AS reserved_count,
  -- Occupied: status = 'occupied' OR confirmed applications for this academic year
  -- AND not allocated to OTA/Keyworkers
  COUNT(DISTINCT CASE 
    WHEN (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'))
      AND (
        s.status = 'occupied' 
        OR EXISTS (
          SELECT 1 
          FROM public.student_applications sa
          INNER JOIN public.contracts c ON sa.contract_id = c.id
          WHERE sa.assigned_studio_id = s.id
            AND c.academic_year_id = ay.id
            AND sa.status = 'confirmed'
        )
      )
    THEN s.id 
  END)::INTEGER AS occupied_count,
  -- Maintenance: always excluded from capacity
  COUNT(DISTINCT CASE WHEN s.status = 'maintenance' THEN s.id END)::INTEGER AS maintenance_count,
  -- Calculate availability percentage
  CASE 
    WHEN COUNT(DISTINCT CASE 
      WHEN s.status != 'maintenance' 
        AND (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'))
      THEN s.id 
    END) > 0 
    THEN ROUND(
      (COUNT(DISTINCT CASE 
        WHEN s.status = 'available' 
          AND (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'))
          AND (s.reservation_expires_at IS NULL OR s.reservation_expires_at < NOW())
          AND NOT EXISTS (
            SELECT 1 
            FROM public.student_applications sa
            INNER JOIN public.contracts c ON sa.contract_id = c.id
            WHERE sa.assigned_studio_id = s.id
              AND c.academic_year_id = ay.id
              AND sa.status IN ('draft', 'awaiting_deposit', 'awaiting_signature', 'awaiting_verification', 'confirmed')
              AND (
                sa.reserved_studio_expires_at IS NULL 
                OR sa.reserved_studio_expires_at > NOW()
              )
          )
        THEN s.id 
      END)::NUMERIC / COUNT(DISTINCT CASE 
        WHEN s.status != 'maintenance' 
          AND (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'))
        THEN s.id 
      END)::NUMERIC) * 100, 
      2
    )
    ELSE 0 
  END AS availability_percentage
FROM public.studio_grades sg
CROSS JOIN public.academic_years ay
LEFT JOIN public.studios s ON sg.id = s.studio_grade_id 
  AND s.is_active = true
WHERE sg.is_active = true
  AND ay.is_active = true
GROUP BY sg.id, sg.name, sg.slug, ay.id, ay.name;

-- Grant permissions
GRANT SELECT ON public.studio_grade_availability_by_year TO authenticated;

-- Update comment
COMMENT ON VIEW public.studio_grade_availability_by_year IS 
'Shows studio availability aggregated per studio grade per academic year. Excludes studios allocated to OTA or Keyworkers from student availability calculations. Studios booked for one academic year do not affect availability calculations for other years.';

