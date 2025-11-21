-- Studio Status by Academic Year
-- Computes the effective status of each studio per academic year based on applications
-- This ensures studios show correct status (reserved/occupied) only for the relevant academic year

-- Drop existing view if it exists
DROP VIEW IF EXISTS public.studio_status_by_academic_year CASCADE;

-- Create view for studio status per academic year
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
  -- Compute effective status based on applications for this academic year
  CASE
    -- Maintenance status always takes precedence (global)
    WHEN s.status = 'maintenance' THEN 'maintenance'
    -- Check for confirmed applications (occupied)
    WHEN EXISTS (
      SELECT 1 
      FROM public.student_applications sa
      INNER JOIN public.contracts c ON sa.contract_id = c.id
      WHERE sa.assigned_studio_id = s.id
        AND c.academic_year_id = ay.id
        AND sa.status = 'confirmed'
    ) THEN 'occupied'
    -- Check for active reservations (reserved)
    WHEN EXISTS (
      SELECT 1 
      FROM public.student_applications sa
      INNER JOIN public.contracts c ON sa.contract_id = c.id
      WHERE sa.assigned_studio_id = s.id
        AND c.academic_year_id = ay.id
        AND sa.status IN ('draft', 'awaiting_deposit', 'awaiting_signature', 'awaiting_verification')
        AND (
          sa.reserved_studio_expires_at IS NULL 
          OR sa.reserved_studio_expires_at > NOW()
        )
    ) THEN 'reserved'
    -- Check for global reserved status if reservation hasn't expired
    WHEN s.status = 'reserved' 
      AND (s.reservation_expires_at IS NULL OR s.reservation_expires_at > NOW())
      AND NOT EXISTS (
        SELECT 1 
        FROM public.student_applications sa
        INNER JOIN public.contracts c ON sa.contract_id = c.id
        WHERE sa.assigned_studio_id = s.id
          AND c.academic_year_id != ay.id
          AND sa.status IN ('draft', 'awaiting_deposit', 'awaiting_signature', 'awaiting_verification', 'confirmed')
      )
    THEN 'reserved'
    -- Default to available
    ELSE 'available'
  END AS effective_status,
  -- Store the original global status for reference
  s.status AS global_status,
  s.reservation_expires_at
FROM public.studios s
CROSS JOIN public.academic_years ay
WHERE s.is_active = true
  AND ay.is_active = true;

-- Grant permissions
GRANT SELECT ON public.studio_status_by_academic_year TO authenticated;

-- Add comment
COMMENT ON VIEW public.studio_status_by_academic_year IS 
'Shows the effective status of each studio per academic year. Status is computed based on applications for that specific academic year. Maintenance status is global and takes precedence.';

