# Cleanup Script for Deleted Students

## Overview
When you delete students directly from Supabase Authentication, some data may remain orphaned because:
- `studios.allocation` is stored as text (not a foreign key), so it doesn't cascade
- `studios.reservation_expires_at` needs manual cleanup
- Some tables may have orphaned references

## Quick Cleanup (For Your Specific Case)

Run this in Supabase SQL Editor to clean up the specific allocation and reservation:

```sql
-- Remove specific allocation and reservation
UPDATE public.studios
SET 
  allocation = NULL,
  reservation_expires_at = NULL,
  status = CASE 
    WHEN status = 'reserved' THEN 'available'
    ELSE status
  END
WHERE 
  allocation = '33350fb7-e6b7-4fc1-9deb-86e734649233'
  OR reservation_expires_at = '2025-11-15T17:01:57.174+00:00'::timestamptz;
```

## Full Cleanup Script

For a complete cleanup, run the migration file:
`supabase/migrations/20251120_cleanup_deleted_students.sql`

This will:
1. ✅ Clear all orphaned allocations (where user doesn't exist)
2. ✅ Clear all expired reservations
3. ✅ Clear your specific allocation UUID
4. ✅ Clear your specific reservation date
5. ✅ Clean up orphaned applications
6. ✅ Clean up orphaned profiles
7. ✅ Clean up orphaned notifications
8. ✅ Clean up orphaned refunds

## Tables That Auto-Cleanup (via CASCADE)

These are automatically deleted when you delete from `auth.users`:
- ✅ `profiles` (on delete cascade)
- ✅ `notifications` (on delete cascade)
- ✅ `refunds` (on delete cascade)
- ✅ `student_applications` (on delete cascade)
- ✅ `student_application_steps` (via applications)
- ✅ `student_documents` (via applications)
- ✅ `student_signatures` (via applications)

## Tables That Need Manual Cleanup

These need manual cleanup:
- ⚠️ `studios.allocation` (text field, not FK)
- ⚠️ `studios.reservation_expires_at` (no FK relationship)
- ⚠️ `studios.status` (may need to change from 'reserved' to 'available')

## Verification Query

After cleanup, verify with:

```sql
-- Check for remaining orphaned allocations
SELECT 
  studio_number,
  allocation,
  reservation_expires_at,
  status
FROM public.studios
WHERE 
  allocation IS NOT NULL 
  OR reservation_expires_at IS NOT NULL
ORDER BY studio_number;
```

## Testing New Applications

After cleanup:
1. All studios should be available (no orphaned allocations)
2. No expired reservations blocking studios
3. You can create new applications without conflicts

