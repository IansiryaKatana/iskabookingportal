-- Per-academic-year studio maintenance
-- Maintenance set for a year only affects that year (portal, reports, availability).
-- Global studios.status = 'maintenance' still means maintenance for every year (backward compat).

-- ============================================================================
-- TABLE: studio_maintenance_by_academic_year
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.studio_maintenance_by_academic_year (
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (studio_id, academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_studio_maintenance_by_ay_studio
  ON public.studio_maintenance_by_academic_year(studio_id);
CREATE INDEX IF NOT EXISTS idx_studio_maintenance_by_ay_year
  ON public.studio_maintenance_by_academic_year(academic_year_id);

ALTER TABLE public.studio_maintenance_by_academic_year ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage studio maintenance by year"
  ON public.studio_maintenance_by_academic_year
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Allow read for authenticated (portal needs to check via view / RPC)
CREATE POLICY "Authenticated can read studio maintenance by year"
  ON public.studio_maintenance_by_academic_year
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_maintenance_by_academic_year TO authenticated;

COMMENT ON TABLE public.studio_maintenance_by_academic_year IS
'Stores per-academic-year maintenance: studio is in maintenance (blocked from portal) for that year only. Overrides are used by studio_status_by_academic_year view.';

-- ============================================================================
-- VIEW: studio_status_by_academic_year (recreate with override logic)
-- ============================================================================

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
    -- Per-year maintenance override: studio in maintenance for this academic year only
    WHEN EXISTS (
      SELECT 1 FROM public.studio_maintenance_by_academic_year m
      WHERE m.studio_id = s.id AND m.academic_year_id = ay.id
    ) THEN 'maintenance'
    -- Global maintenance (backward compat): studio.status = maintenance for all years
    WHEN s.status = 'maintenance' THEN 'maintenance'
    WHEN s.allocation IN ('OTA', 'Keyworkers') THEN s.status
    WHEN EXISTS (
      SELECT 1
      FROM public.student_applications sa
      INNER JOIN public.contracts c ON sa.contract_id = c.id
      WHERE sa.assigned_studio_id = s.id
        AND c.academic_year_id = ay.id
        AND sa.status = 'confirmed'
    ) THEN 'occupied'
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
'Effective status per (studio, academic_year). Maintenance can be per-year (studio_maintenance_by_academic_year) or global (studios.status). Occupied/reserved derived from applications for that year.';
