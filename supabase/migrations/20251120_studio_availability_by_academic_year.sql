-- Studio Availability by Academic Year
-- Creates a view that shows availability per studio grade per academic year
-- This ensures studios booked for one year don't affect availability for other years

-- Drop existing view if it exists
DROP VIEW IF EXISTS public.studio_grade_availability_by_year CASCADE;

-- Create view for availability per studio grade per academic year
CREATE VIEW public.studio_grade_availability_by_year AS
SELECT 
  sg.id AS studio_grade_id,
  sg.name AS studio_grade_name,
  sg.slug AS studio_grade_slug,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  COUNT(DISTINCT s.id)::INTEGER AS total_capacity,
  -- Available: status = 'available' AND not assigned to any application for this academic year
  COUNT(DISTINCT CASE 
    WHEN s.status = 'available' 
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
  COUNT(DISTINCT CASE 
    WHEN s.status = 'reserved' 
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
    THEN s.id 
  END)::INTEGER AS reserved_count,
  -- Occupied: status = 'occupied' OR confirmed applications for this academic year
  COUNT(DISTINCT CASE 
    WHEN s.status = 'occupied' 
      OR EXISTS (
        SELECT 1 
        FROM public.student_applications sa
        INNER JOIN public.contracts c ON sa.contract_id = c.id
        WHERE sa.assigned_studio_id = s.id
          AND c.academic_year_id = ay.id
          AND sa.status = 'confirmed'
      )
    THEN s.id 
  END)::INTEGER AS occupied_count,
  -- Maintenance: always excluded from capacity
  COUNT(DISTINCT CASE WHEN s.status = 'maintenance' THEN s.id END)::INTEGER AS maintenance_count,
  -- Calculate availability percentage
  CASE 
    WHEN COUNT(DISTINCT s.id) > 0 
    THEN ROUND(
      (COUNT(DISTINCT CASE 
        WHEN s.status = 'available' 
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
      END)::NUMERIC / COUNT(DISTINCT s.id)::NUMERIC) * 100, 
      2
    )
    ELSE 0 
  END AS availability_percentage
FROM public.studio_grades sg
CROSS JOIN public.academic_years ay
LEFT JOIN public.studios s ON sg.id = s.studio_grade_id 
  AND s.is_active = true 
  AND s.status != 'maintenance'
WHERE sg.is_active = true
  AND ay.is_active = true
GROUP BY sg.id, sg.name, sg.slug, ay.id, ay.name;

-- Grant permissions
GRANT SELECT ON public.studio_grade_availability_by_year TO authenticated;

-- Add comment
COMMENT ON VIEW public.studio_grade_availability_by_year IS 
'Shows studio availability aggregated per studio grade per academic year. This ensures studios booked for one academic year do not affect availability calculations for other years.';

