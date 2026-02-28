-- Recreate studio_grade_availability_by_year (dropped by 20260248 CASCADE)
-- Room grades cards in portal/catalog use this view for available_count / fully booked

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

COMMENT ON VIEW public.studio_grade_availability_by_year IS
'Studio availability per grade per academic year (used by catalog room grade cards). Uses studio_status_by_academic_year effective_status.';
