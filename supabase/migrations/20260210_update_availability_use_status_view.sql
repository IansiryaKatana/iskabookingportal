-- Update studio_grade_availability_by_year to use per-academic-year status
-- via studio_status_by_academic_year, so that:
-- - Availability is calculated in the context of a specific academic year
-- - Global studio.status = 'occupied' from previous years does NOT block future years
-- - OTA/Keyworkers allocations are still excluded from student capacity

DROP VIEW IF EXISTS public.studio_grade_availability_by_year CASCADE;

CREATE VIEW public.studio_grade_availability_by_year AS
SELECT 
  sg.id AS studio_grade_id,
  sg.name AS studio_grade_name,
  sg.slug AS studio_grade_slug,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,

  -- Total capacity: active studios for this grade/year, excluding maintenance and OTA/Keyworkers
  COUNT(DISTINCT CASE
    WHEN ss.is_active = true
      AND ss.effective_status <> 'maintenance'
      AND (ss.allocation IS NULL OR ss.allocation NOT IN ('OTA', 'Keyworkers'))
    THEN ss.studio_id
  END)::INTEGER AS total_capacity,

  -- Available: effective_status = 'available' for this academic year,
  -- excluding OTA/Keyworkers
  COUNT(DISTINCT CASE
    WHEN ss.is_active = true
      AND ss.effective_status = 'available'
      AND (ss.allocation IS NULL OR ss.allocation NOT IN ('OTA', 'Keyworkers'))
    THEN ss.studio_id
  END)::INTEGER AS available_count,

  -- Reserved: effective_status = 'reserved' for this academic year,
  -- excluding OTA/Keyworkers
  COUNT(DISTINCT CASE
    WHEN ss.is_active = true
      AND ss.effective_status = 'reserved'
      AND (ss.allocation IS NULL OR ss.allocation NOT IN ('OTA', 'Keyworkers'))
    THEN ss.studio_id
  END)::INTEGER AS reserved_count,

  -- Occupied: effective_status = 'occupied' for this academic year,
  -- excluding OTA/Keyworkers
  COUNT(DISTINCT CASE
    WHEN ss.is_active = true
      AND ss.effective_status = 'occupied'
      AND (ss.allocation IS NULL OR ss.allocation NOT IN ('OTA', 'Keyworkers'))
    THEN ss.studio_id
  END)::INTEGER AS occupied_count,

  -- Maintenance: effective_status = 'maintenance' (global)
  COUNT(DISTINCT CASE
    WHEN ss.is_active = true
      AND ss.effective_status = 'maintenance'
    THEN ss.studio_id
  END)::INTEGER AS maintenance_count,

  -- Availability percentage: available / total_capacity (excluding maintenance and OTA/Keyworkers)
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

-- Grant permissions to authenticated users (same as previous migrations)
GRANT SELECT ON public.studio_grade_availability_by_year TO authenticated;

COMMENT ON VIEW public.studio_grade_availability_by_year IS 
'Shows studio availability aggregated per studio grade per academic year, based on per-academic-year effective_status from studio_status_by_academic_year. Excludes studios allocated to OTA or Keyworkers from student availability calculations. Studios booked or reserved for one academic year do not affect availability calculations for other years.';

