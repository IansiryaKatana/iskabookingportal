-- Studio status view: split tentative holds from committed occupancy.
--
-- Business rules:
--   reserved  = pre-deposit pipeline (draft, awaiting_deposit) — blocks booking;
--               timer enforcement stays in release-expired-reservations, not the view.
--   occupied  = post-deposit pipeline (awaiting_signature, awaiting_verification, confirmed).
--   available = no blocking application for this academic year.
--
-- Does NOT block: cancelled, expired, checked_out (historical / released).

DROP VIEW IF EXISTS public.studio_status_by_academic_year CASCADE;

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
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.studio_maintenance_by_academic_year m
      WHERE m.studio_id = s.id AND m.academic_year_id = ay.id
    ) THEN 'maintenance'
    WHEN s.status = 'maintenance' THEN 'maintenance'
    WHEN s.allocation IN ('OTA', 'Keyworkers') THEN s.status
    -- Committed hold: deposit paid and beyond (no reservation timer)
    WHEN EXISTS (
      SELECT 1
      FROM public.student_applications sa
      INNER JOIN public.contracts c ON sa.contract_id = c.id
      WHERE sa.assigned_studio_id = s.id
        AND c.academic_year_id = ay.id
        AND sa.status IN ('awaiting_signature', 'awaiting_verification', 'confirmed')
    ) THEN 'occupied'
    -- Tentative hold: studio selected, deposit not yet paid
    WHEN EXISTS (
      SELECT 1
      FROM public.student_applications sa
      INNER JOIN public.contracts c ON sa.contract_id = c.id
      WHERE sa.assigned_studio_id = s.id
        AND c.academic_year_id = ay.id
        AND sa.status IN ('draft', 'awaiting_deposit')
    ) THEN 'reserved'
    -- Global reserved row (orphan timer on studios table) when not blocked for this year
    WHEN s.status = 'reserved'
      AND (s.reservation_expires_at IS NULL OR s.reservation_expires_at > NOW())
      AND NOT EXISTS (
        SELECT 1
        FROM public.student_applications sa
        INNER JOIN public.contracts c ON sa.contract_id = c.id
        WHERE sa.assigned_studio_id = s.id
          AND c.academic_year_id != ay.id
          AND sa.status IN (
            'draft',
            'awaiting_deposit',
            'awaiting_signature',
            'awaiting_verification',
            'confirmed'
          )
      )
    THEN 'reserved'
    ELSE 'available'
  END AS effective_status,
  s.status AS global_status,
  s.reservation_expires_at
FROM public.studios s
CROSS JOIN public.academic_years ay
WHERE s.is_active = true
  AND ay.is_active = true;

GRANT SELECT ON public.studio_status_by_academic_year TO authenticated;

COMMENT ON VIEW public.studio_status_by_academic_year IS
'Effective status per (studio, academic_year). reserved = pre-deposit holds (draft/awaiting_deposit). occupied = committed pipeline (awaiting_signature/awaiting_verification/confirmed). Timer release is handled by release-expired-reservations, not reserved_studio_expires_at in this view.';

-- Recreate dependent aggregate view (dropped by CASCADE above)
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
'Studio availability per grade per academic year. Uses studio_status_by_academic_year effective_status.';

-- Hygiene: stale timers on post-deposit apps no longer affect the view, but clear them anyway.
UPDATE public.student_applications
SET reserved_studio_expires_at = NULL
WHERE status IN ('awaiting_signature', 'awaiting_verification', 'confirmed')
  AND reserved_studio_expires_at IS NOT NULL;
