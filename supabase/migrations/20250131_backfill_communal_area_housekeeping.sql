-- Backfill housekeeping records for existing communal areas
-- Creates a housekeeping record for any communal area that doesn't have one

BEGIN;

-- Insert housekeeping records for communal areas that don't have one
-- Set default next_clean_due_at to tomorrow (can be adjusted manually later)
INSERT INTO public.communal_area_housekeeping (
  communal_area_id,
  status,
  next_clean_due_at
)
SELECT 
  ca.id,
  'clean'::TEXT,
  (CURRENT_DATE + INTERVAL '1 day')::DATE -- Default to tomorrow, can be adjusted
FROM public.communal_areas ca
WHERE NOT EXISTS (
  SELECT 1 FROM public.communal_area_housekeeping cah
  WHERE cah.communal_area_id = ca.id
)
ON CONFLICT (communal_area_id) DO NOTHING;

COMMIT;

