-- Fix Studio Availability Aggregation
-- Creates an aggregated view for catalog page that shows total availability per studio grade
-- across all active contracts

-- Drop existing view to recreate with aggregation
DROP VIEW IF EXISTS public.studio_grade_availability_summary CASCADE;

-- Create aggregated view for catalog page (shows total availability per grade)
CREATE VIEW public.studio_grade_availability_summary AS
SELECT 
  sg.id AS studio_grade_id,
  sg.name AS studio_grade_name,
  sg.slug AS studio_grade_slug,
  COUNT(DISTINCT s.id)::INTEGER AS total_capacity,
  COUNT(DISTINCT CASE 
    WHEN s.status = 'available' 
      AND (s.reservation_expires_at IS NULL OR s.reservation_expires_at < NOW())
      AND NOT EXISTS (
        SELECT 1 
        FROM public.student_applications sa
        WHERE sa.assigned_studio_id = s.id
          AND sa.status IN ('draft', 'awaiting_deposit', 'awaiting_signature', 'awaiting_verification', 'confirmed')
          AND (sa.reserved_studio_expires_at IS NULL OR sa.reserved_studio_expires_at > NOW())
      )
    THEN s.id 
  END)::INTEGER AS available_count,
  COUNT(DISTINCT CASE 
    WHEN s.status = 'reserved' 
      OR EXISTS (
        SELECT 1 
        FROM public.student_applications sa
        WHERE sa.assigned_studio_id = s.id
          AND sa.status IN ('draft', 'awaiting_deposit', 'awaiting_signature', 'awaiting_verification')
          AND (sa.reserved_studio_expires_at IS NOT NULL AND sa.reserved_studio_expires_at > NOW())
      )
    THEN s.id 
  END)::INTEGER AS reserved_count,
  COUNT(DISTINCT CASE 
    WHEN s.status = 'occupied' 
      OR EXISTS (
        SELECT 1 
        FROM public.student_applications sa
        WHERE sa.assigned_studio_id = s.id
          AND sa.status = 'confirmed'
      )
    THEN s.id 
  END)::INTEGER AS occupied_count,
  COUNT(DISTINCT CASE WHEN s.status = 'maintenance' THEN s.id END)::INTEGER AS maintenance_count,
  CASE 
    WHEN COUNT(DISTINCT s.id) > 0 
    THEN ROUND(
      (COUNT(DISTINCT CASE 
        WHEN s.status = 'available' 
          AND (s.reservation_expires_at IS NULL OR s.reservation_expires_at < NOW())
          AND NOT EXISTS (
            SELECT 1 
            FROM public.student_applications sa
            WHERE sa.assigned_studio_id = s.id
              AND sa.status IN ('draft', 'awaiting_deposit', 'awaiting_signature', 'awaiting_verification', 'confirmed')
              AND (sa.reserved_studio_expires_at IS NULL OR sa.reserved_studio_expires_at > NOW())
          )
        THEN s.id 
      END)::NUMERIC / COUNT(DISTINCT s.id)::NUMERIC) * 100, 
      2
    )
    ELSE 0 
  END AS availability_percentage
FROM public.studio_grades sg
LEFT JOIN public.studios s ON sg.id = s.studio_grade_id AND s.is_active = true AND s.status != 'maintenance'
WHERE sg.is_active = true
GROUP BY sg.id, sg.name, sg.slug;

-- Grant permissions
GRANT SELECT ON public.studio_grade_availability_summary TO authenticated;

-- Keep the original view for contract-specific queries
-- (No changes needed - it's used for contract detail pages)

