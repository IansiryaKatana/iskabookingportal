-- Add expected_resolve_at to maintenance_requests
-- Purpose: track planned/expected completion date separately from actual resolved_at

BEGIN;

ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS expected_resolve_at TIMESTAMPTZ;

-- Index to support filtering/sorting by expected resolve date
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_expected_resolve_at
  ON public.maintenance_requests(expected_resolve_at)
  WHERE expected_resolve_at IS NOT NULL;

COMMENT ON COLUMN public.maintenance_requests.expected_resolve_at IS
  'Planned/expected resolution timestamp for maintenance requests; distinct from actual resolved_at.';

COMMIT;


