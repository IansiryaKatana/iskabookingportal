-- Fix Studio Status for Bulk Imported Applications
-- This migration backfills studio status for studios that are assigned to confirmed applications
-- but still have status='available' (due to the trigger not firing on INSERT before the fix)

-- Update studios that are assigned to confirmed applications but still marked as available
UPDATE public.studios s
SET 
  status = 'occupied',
  allocation = 'Student'
WHERE s.status = 'available'
  AND EXISTS (
    SELECT 1
    FROM public.student_applications sa
    WHERE sa.assigned_studio_id = s.id
      AND sa.status = 'confirmed'
  );

-- Also handle studios that might be in 'reserved' status but have confirmed applications
UPDATE public.studios s
SET 
  status = 'occupied',
  allocation = 'Student',
  reservation_expires_at = NULL
WHERE s.status = 'reserved'
  AND EXISTS (
    SELECT 1
    FROM public.student_applications sa
    WHERE sa.assigned_studio_id = s.id
      AND sa.status = 'confirmed'
  );

-- Log the number of studios updated
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % studios to occupied status for confirmed applications', v_updated_count;
END $$;

