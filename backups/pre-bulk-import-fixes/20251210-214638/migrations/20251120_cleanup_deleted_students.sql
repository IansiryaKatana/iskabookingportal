-- Cleanup script for deleted students
-- Run this after deleting students from auth.users to clean up orphaned data

-- 1. Clear allocation and reservation_expires_at from studios table
--    where the allocation references a deleted user
UPDATE public.studios
SET 
  allocation = NULL,
  reservation_expires_at = NULL,
  status = CASE 
    WHEN status = 'reserved' THEN 'available'
    ELSE status
  END
WHERE 
  allocation IS NOT NULL
  AND allocation NOT IN (
    SELECT id::text FROM auth.users
  );

-- 2. Clear all expired reservations (optional - cleans up old expired reservations)
UPDATE public.studios
SET 
  reservation_expires_at = NULL,
  status = CASE 
    WHEN status = 'reserved' AND reservation_expires_at < NOW() THEN 'available'
    ELSE status
  END
WHERE 
  reservation_expires_at IS NOT NULL
  AND reservation_expires_at < NOW();

-- 3. Clear allocation for specific UUID if provided (for testing)
--    Replace '33350fb7-e6b7-4fc1-9deb-86e734649233' with the actual UUID you want to remove
UPDATE public.studios
SET 
  allocation = NULL,
  reservation_expires_at = NULL,
  status = CASE 
    WHEN status = 'reserved' THEN 'available'
    ELSE status
  END
WHERE allocation = '33350fb7-e6b7-4fc1-9deb-86e734649233';

-- 4. Clear specific reservation expiry date (for testing)
UPDATE public.studios
SET 
  reservation_expires_at = NULL,
  status = CASE 
    WHEN status = 'reserved' THEN 'available'
    ELSE status
  END
WHERE reservation_expires_at = '2025-11-15T17:01:57.174+00:00'::timestamptz;

-- 5. Clean up any orphaned student_applications (should be auto-deleted by cascade, but check)
--    This will only affect applications where the student_id doesn't exist in auth.users
DELETE FROM public.student_applications
WHERE student_id NOT IN (SELECT id FROM auth.users);

-- 6. Clean up orphaned profiles (should be auto-deleted by cascade, but check)
DELETE FROM public.profiles
WHERE id NOT IN (SELECT id FROM auth.users);

-- 7. Clean up orphaned notifications (should be auto-deleted by cascade, but check)
DELETE FROM public.notifications
WHERE user_id NOT IN (SELECT id FROM auth.users);

-- 8. Clean up orphaned refunds (should be auto-deleted by cascade, but check)
DELETE FROM public.refunds
WHERE student_id NOT IN (SELECT id FROM auth.users);

-- Note: The following tables should be automatically cleaned up via CASCADE:
-- - student_application_steps (via student_applications)
-- - student_documents (via student_applications)
-- - student_signatures (via student_applications)
-- - profiles (via auth.users on delete cascade)
-- - notifications (via auth.users on delete cascade)

-- Verify cleanup:
-- SELECT 
--   COUNT(*) as studios_with_allocation,
--   COUNT(CASE WHEN reservation_expires_at IS NOT NULL THEN 1 END) as studios_with_reservation
-- FROM public.studios
-- WHERE allocation IS NOT NULL OR reservation_expires_at IS NOT NULL;

