-- Three Modules System: Initialize Housekeeping Status
-- Phase 7: Create housekeeping_status records for all existing studios

BEGIN;

-- ============================================================================
-- PART 1: INITIALIZE HOUSEKEEPING STATUS FOR ALL ACTIVE STUDIOS
-- ============================================================================

-- Create housekeeping_status records for all active studios
-- Default status is 'clean' unless there's an active OTA booking or out of order record
INSERT INTO public.housekeeping_status (studio_id, status, next_clean_due_at)
SELECT 
  s.id AS studio_id,
  CASE
    -- Check if studio is out of order
    WHEN EXISTS (
      SELECT 1 FROM public.out_of_order_records ooor
      WHERE ooor.studio_id = s.id
        AND ooor.is_active = true
    ) THEN 'out_of_order'
    -- Check if there's an active OTA booking
    WHEN EXISTS (
      SELECT 1 FROM public.ota_bookings ob
      WHERE ob.studio_id = s.id
        AND ob.status IN ('checked_in', 'in_house_guest', 'day_use')
    ) THEN 'occupied'
    -- Check if there's a recent OTA checkout (mark as dirty)
    WHEN EXISTS (
      SELECT 1 FROM public.ota_bookings ob
      WHERE ob.studio_id = s.id
        AND ob.status = 'checked_out'
        AND ob.updated_at > NOW() - INTERVAL '24 hours'
    ) THEN 'dirty'
    -- Default to clean
    ELSE 'clean'
  END AS status,
  -- Set next clean date to 2 weeks from now (default cleaning cadence)
  (CURRENT_DATE + INTERVAL '14 days')::DATE AS next_clean_due_at
FROM public.studios s
WHERE s.is_active = true
  AND s.id NOT IN (
    SELECT studio_id FROM public.housekeeping_status WHERE studio_id IS NOT NULL
  )
ON CONFLICT (studio_id) DO NOTHING;

-- ============================================================================
-- PART 2: UPDATE STUDIOS WITH ACTIVE BOOKINGS
-- ============================================================================

-- Update housekeeping status for studios with active student applications
-- (Student studios can be clean - they follow scheduled cleaning)
-- No change needed as default 'clean' is appropriate

COMMIT;

