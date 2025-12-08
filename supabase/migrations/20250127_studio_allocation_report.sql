-- Studio Allocation Report View
-- Shows studio allocation counts by studio grade and allocation type

CREATE OR REPLACE VIEW public.studio_allocation_report AS
SELECT 
  sg.id AS studio_grade_id,
  sg.name AS studio_grade_name,
  sg.slug AS studio_grade_slug,
  COUNT(*) AS total_studios,
  COUNT(*) FILTER (WHERE s.is_active = true) AS active_studios,
  -- Count by allocation type
  -- Studios allocated to students: either explicitly marked as 'Student' or assigned to a confirmed application
  COUNT(*) FILTER (
    WHERE s.allocation = 'Student' 
    OR EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.assigned_studio_id = s.id
        AND sa.status = 'confirmed'
    )
  ) AS allocated_to_students,
  COUNT(*) FILTER (WHERE s.allocation = 'OTA') AS allocated_to_ota,
  COUNT(*) FILTER (WHERE s.allocation = 'Keyworkers') AS allocated_to_keyworkers,
  -- Unallocated: NULL allocation, not assigned to any confirmed application, and not explicitly allocated to OTA/Keyworkers
  COUNT(*) FILTER (
    WHERE (s.allocation IS NULL OR s.allocation = '')
      AND NOT EXISTS (
        SELECT 1 FROM public.student_applications sa
        WHERE sa.assigned_studio_id = s.id
          AND sa.status = 'confirmed'
      )
  ) AS unallocated,
  -- Count by status for additional context
  COUNT(*) FILTER (WHERE s.status = 'available') AS status_available,
  COUNT(*) FILTER (WHERE s.status = 'occupied') AS status_occupied,
  COUNT(*) FILTER (WHERE s.status = 'reserved') AS status_reserved,
  COUNT(*) FILTER (WHERE s.status = 'maintenance') AS status_maintenance
FROM public.studio_grades sg
LEFT JOIN public.studios s ON s.studio_grade_id = sg.id
WHERE sg.is_active = true
GROUP BY sg.id, sg.name, sg.slug
ORDER BY sg.display_order, sg.name;

GRANT SELECT ON public.studio_allocation_report TO authenticated;

COMMENT ON VIEW public.studio_allocation_report IS 
'Studio Allocation Report - Shows counts of studios by grade and allocation type (Student, OTA, Keyworkers, Unallocated)';

