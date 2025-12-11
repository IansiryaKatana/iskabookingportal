# Authentication Records Deletion Assessment

**Date:** 2025-01-28  
**Question:** Is it possible to delete authentication records of applications when clicking "delete all applications" in admin?

---

## Current Behavior Analysis

### What Gets Deleted

When clicking **"Delete All Applications"** in the admin Settings page, the following are deleted:

#### ✅ Deleted Records:
1. **Student Applications** (`student_applications`)
2. **Application Steps** (`student_application_steps`)
3. **Documents** (`student_documents`)
4. **Signatures** (`student_signatures`)
5. **DocuSign Envelopes** (`docusign_envelopes`)
6. **Stripe Payments** (`stripe_payments`)
7. **Manual Payments** (`manual_payments`)
8. **Partner Referrals** (`partner_referrals`)
9. **Application Cashbacks** (`application_cashbacks`)
10. **Studio Allocations** (freed up)

#### ❌ NOT Deleted:
1. **Authentication Records** (`auth.users`) - **NOT DELETED**
2. **User Profiles** (`profiles`) - **NOT DELETED**
3. **Notifications** (`notifications`) - **NOT DELETED**
4. **Refunds** (`refunds`) - Only `application_id` set to NULL

---

## Database Schema Relationships

### Foreign Key Constraints

```sql
-- student_applications table
student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE

-- profiles table  
id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
```

### Cascade Behavior

**Current Cascade Direction:**
- ✅ `auth.users` → `student_applications` (CASCADE)
- ✅ `auth.users` → `profiles` (CASCADE)
- ❌ `student_applications` → `auth.users` (NO CASCADE - reverse direction)

**What This Means:**
- If you delete from `auth.users`, it automatically deletes related `student_applications` and `profiles`
- If you delete `student_applications`, it does **NOT** delete `auth.users` or `profiles`

---

## Current Delete Function Implementation

### Function: `delete_all_student_applications()`

**Location:** `supabase/migrations/20251122_data_management_functions.sql`

**What It Does:**
1. Loops through all applications
2. Calls `delete_student_application()` for each
3. Deletes all application-related data
4. Cleans up orphaned studio allocations
5. **Does NOT touch `auth.users` or `profiles`**

**Code Reference:**
```123:266:supabase/migrations/20251122_data_management_functions.sql
CREATE OR REPLACE FUNCTION public.delete_all_student_applications()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application_id UUID;
  v_total_deleted INTEGER := 0;
  v_details JSONB := '[]'::JSONB;
  v_result RECORD;
  v_deleted_tables JSONB;
  v_total_records INTEGER;
  v_total_applications INTEGER;
BEGIN
  -- Disable RLS for this function to ensure we can see all applications
  -- Note: SECURITY DEFINER should bypass RLS, but we explicitly disable it
  PERFORM set_config('row_security', 'off', true);
  
  -- Count total applications first (for debugging/feedback)
  -- Use explicit schema to avoid any issues
  SELECT COUNT(*) INTO v_total_applications 
  FROM public.student_applications;
  
  -- If no applications, return early with debug info
  IF v_total_applications = 0 THEN
    RETURN jsonb_build_object(
      'deleted_count', 0,
      'details', '[]'::JSONB,
      'message', 'No applications found to delete',
      'total_found', v_total_applications,
      'debug', jsonb_build_object(
        'row_security_disabled', current_setting('row_security', true),
        'query_executed', 'SELECT COUNT(*) FROM public.student_applications'
      )
    );
  END IF;
  
  -- Loop through all applications and delete them
  -- SECURITY DEFINER should allow us to see all rows
  FOR v_application_id IN 
    SELECT id 
    FROM public.student_applications
    ORDER BY created_at ASC
  LOOP
    BEGIN
      -- Call the delete function and get the result
      -- Use STRICT to ensure exactly one row is returned, otherwise raise exception
      SELECT deleted_tables, total_deleted INTO STRICT v_deleted_tables, v_total_records
      FROM public.delete_student_application(v_application_id);
      
      -- Verify we got valid results
      IF v_deleted_tables IS NULL OR v_total_records IS NULL THEN
        RAISE EXCEPTION 'Delete function returned NULL for application %', v_application_id;
      END IF;
      
      -- If we got here, deletion was successful
      v_total_deleted := v_total_deleted + 1;
      v_details := v_details || jsonb_build_object(
        'application_id', v_application_id,
        'deleted_tables', v_deleted_tables,
        'total_deleted', v_total_records,
        'success', true
      );
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        -- Function returned no rows
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', 'Delete function returned no rows - application may not exist or RLS blocked access',
          'error_code', 'P0002',
          'success', false
        );
        RAISE WARNING 'Delete function returned no rows for application %', v_application_id;
      WHEN TOO_MANY_ROWS THEN
        -- Function returned multiple rows (shouldn't happen)
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', 'Delete function returned multiple rows',
          'error_code', 'P0003',
          'success', false
        );
        RAISE WARNING 'Delete function returned multiple rows for application %', v_application_id;
      WHEN OTHERS THEN
        -- Log error but continue with next application
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', SQLERRM,
          'error_code', SQLSTATE,
          'success', false
        );
        -- Raise warning for logging
        RAISE WARNING 'Failed to delete application %: % (Code: %)', v_application_id, SQLERRM, SQLSTATE;
    END;
  END LOOP;
  
  -- Cleanup orphaned records after deleting all applications
  -- 1. Clear studio allocations that reference deleted applications (UUID allocations)
  --    These are temporary reservations that should be cleared
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
    AND allocation ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' -- UUID format
    AND allocation::UUID NOT IN (
      SELECT id FROM public.student_applications
    );
  
  -- 2. Clear all expired reservations
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
  
  -- 3. Reset any studios that are still marked as reserved but have no allocation
  UPDATE public.studios
  SET 
    status = 'available',
    allocation = NULL,
    reservation_expires_at = NULL
  WHERE 
    status = 'reserved'
    AND (allocation IS NULL OR allocation = '');
  
  -- Return as JSONB object instead of TABLE
  RETURN jsonb_build_object(
    'deleted_count', v_total_deleted,
    'details', v_details,
    'cleanup_performed', true,
    'message', format('Deleted %s applications and cleaned up orphaned studio allocations', v_total_deleted)
  );
END;
$$;
```

---

## Use Case Analysis

### Scenario 1: Development/Testing Cleanup
**Current Behavior:** ✅ Appropriate
- Applications deleted, but user accounts remain
- Allows re-testing application creation with same users
- Useful for development/testing workflows

### Scenario 2: Production Data Cleanup
**Current Behavior:** ⚠️ May Leave Orphaned Accounts
- User accounts remain even if all applications deleted
- Users can still log in but have no applications
- May be intentional (users might reapply)

### Scenario 3: Complete User Removal
**Current Behavior:** ❌ Not Supported
- Cannot remove users completely
- Would need separate user deletion process

---

## Recommendations

### Option 1: Keep Current Behavior (Recommended for Development)

**Pros:**
- ✅ Safe for development/testing
- ✅ Allows re-testing with same users
- ✅ Users can reapply if needed
- ✅ No risk of accidentally deleting user accounts

**Cons:**
- ⚠️ Leaves orphaned user accounts
- ⚠️ Users can still log in with no applications

**Use Case:** Development, testing, staging environments

---

### Option 2: Add Optional User Deletion

**Implementation:**
Add a checkbox in the delete dialog: "Also delete user accounts"

**Function Enhancement:**
```sql
CREATE OR REPLACE FUNCTION public.delete_all_student_applications(
  p_delete_users BOOLEAN DEFAULT false
)
RETURNS JSONB
-- ... existing code ...
BEGIN
  -- ... existing deletion logic ...
  
  -- If p_delete_users is true, delete orphaned users
  IF p_delete_users THEN
    -- Delete users who have no remaining applications
    DELETE FROM auth.users
    WHERE id IN (
      SELECT DISTINCT student_id
      FROM public.student_applications
      WHERE id IN (SELECT unnest(application_ids))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.student_applications sa2
      WHERE sa2.student_id = auth.users.id
    );
  END IF;
END;
```

**Pros:**
- ✅ User control over deletion scope
- ✅ Safe default (doesn't delete users by default)
- ✅ Complete cleanup when needed

**Cons:**
- ⚠️ More complex implementation
- ⚠️ Requires careful testing
- ⚠️ Need to handle related data (notifications, etc.)

**Use Case:** Production cleanup, complete data removal

---

### Option 3: Separate User Deletion Function

**Implementation:**
Create a separate admin function: "Delete Orphaned Users"

**Function:**
```sql
CREATE OR REPLACE FUNCTION public.delete_orphaned_student_users()
RETURNS JSONB
-- Deletes users who have no applications
```

**Pros:**
- ✅ Clear separation of concerns
- ✅ Explicit action required
- ✅ Less risk of accidental deletion
- ✅ Can be run independently

**Cons:**
- ⚠️ Two-step process
- ⚠️ Users might be deleted later (not immediate)

**Use Case:** Periodic cleanup, maintenance tasks

---

### Option 4: Smart Deletion (Recommended for Production)

**Implementation:**
Automatically delete users only if they have no other data:

```sql
-- Delete users who:
-- 1. Have no applications (after deletion)
-- 2. Have no other important data (notifications, refunds, etc.)
-- 3. Are not staff members
```

**Logic:**
```sql
DELETE FROM auth.users
WHERE id IN (deleted_application_student_ids)
AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.users.id AND role IN ('staff', 'superadmin'))
AND NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = auth.users.id)
AND NOT EXISTS (SELECT 1 FROM public.refunds WHERE student_id = auth.users.id)
-- ... other checks ...
```

**Pros:**
- ✅ Intelligent cleanup
- ✅ Preserves important users (staff)
- ✅ Removes truly orphaned accounts
- ✅ Safe for production

**Cons:**
- ⚠️ More complex logic
- ⚠️ Need to define "important data"
- ⚠️ Requires careful testing

**Use Case:** Production environments, automated cleanup

---

## Security Considerations

### Current Security
- ✅ Function uses `SECURITY DEFINER` (runs with elevated privileges)
- ✅ Only authenticated users can execute
- ✅ RLS is disabled within function (intentional for cleanup)

### If Adding User Deletion
- ⚠️ **CRITICAL:** Deleting from `auth.users` is irreversible
- ⚠️ Need additional safeguards:
  - Confirmation dialog with warning
  - Audit logging
  - Staff-only access
  - Backup before deletion (recommended)

---

## Data Integrity Considerations

### Related Data That May Need Cleanup

1. **Notifications** (`notifications`)
   - Linked to `user_id`
   - Should be deleted if user is deleted (CASCADE)

2. **Refunds** (`refunds`)
   - Linked to `student_id`
   - May need to preserve for accounting
   - Consider setting `student_id` to NULL instead

3. **Maintenance Requests** (`maintenance_requests`)
   - Linked to `student_id`
   - May need to preserve for history

4. **Utility Payments** (`utility_payments`)
   - Linked to `created_by`
   - May need to preserve for accounting

5. **Storage Files**
   - Documents, signatures, avatars
   - Need cleanup from Supabase Storage
   - Currently not handled in delete function

---

## Implementation Recommendations

### 🎯 Recommended Approach: Option 4 (Smart Deletion)

**Phase 1: Assessment**
1. ✅ Document current behavior (this document)
2. ⏳ Identify all related data tables
3. ⏳ Define "orphaned user" criteria
4. ⏳ Test deletion impact on related data

**Phase 2: Implementation**
1. Create enhanced delete function with optional user deletion
2. Add UI toggle in admin Settings
3. Implement smart deletion logic
4. Add comprehensive audit logging
5. Add confirmation dialogs with warnings

**Phase 3: Testing**
1. Test in development environment
2. Verify all related data cleanup
3. Test edge cases (staff users, users with refunds, etc.)
4. Verify storage cleanup
5. Test rollback scenarios

**Phase 4: Documentation**
1. Update admin documentation
2. Add warnings in UI
3. Document data retention policies
4. Create backup procedures

---

## Code Changes Required

### 1. Enhanced Delete Function

```sql
-- Add parameter for user deletion
CREATE OR REPLACE FUNCTION public.delete_all_student_applications(
  p_delete_orphaned_users BOOLEAN DEFAULT false
)
RETURNS JSONB
-- ... implementation ...
```

### 2. UI Changes

```typescript
// In Settings.tsx
const [deleteUsers, setDeleteUsers] = useState(false);

// Add checkbox in delete dialog
<Checkbox
  checked={deleteUsers}
  onCheckedChange={setDeleteUsers}
  label="Also delete orphaned user accounts"
/>
```

### 3. Storage Cleanup

```typescript
// Add storage cleanup function
async function cleanupUserStorage(userId: string) {
  // Delete from storage buckets
  // - documents/{userId}/...
  // - signatures/{userId}/...
  // - avatars/{userId}/...
}
```

---

## Decision Matrix

| Option | Development | Staging | Production | Complexity | Risk |
|--------|------------|---------|------------|------------|------|
| **Current (No User Deletion)** | ✅ Good | ✅ Good | ⚠️ May leave orphans | Low | Low |
| **Optional User Deletion** | ✅ Good | ✅ Good | ✅ Good | Medium | Medium |
| **Separate Function** | ✅ Good | ✅ Good | ✅ Good | Medium | Low |
| **Smart Deletion** | ✅ Good | ✅ Good | ✅ Excellent | High | Low |

---

## Final Recommendation

### For Development/Testing:
**Keep current behavior** - Applications deleted, users remain for re-testing.

### For Production:
**Implement Option 4 (Smart Deletion)** with:
1. Optional user deletion toggle
2. Smart logic to preserve important users
3. Comprehensive audit logging
4. Storage cleanup
5. Clear warnings and confirmations

---

## Next Steps

1. **Decide on approach** based on use case
2. **Identify all related data** that needs cleanup
3. **Design deletion logic** with safety checks
4. **Implement and test** thoroughly
5. **Document** the behavior clearly

---

## Questions to Answer

1. **What is the primary use case?**
   - Development/testing cleanup?
   - Production data management?
   - Complete user removal?

2. **Should staff users be preserved?**
   - Yes (recommended)
   - No (risky)

3. **What about users with refunds?**
   - Preserve for accounting?
   - Delete anyway?

4. **Storage cleanup?**
   - Delete all user files?
   - Preserve for audit?

5. **Audit requirements?**
   - Full logging needed?
   - Compliance requirements?

---

**Status:** Awaiting decision on approach before implementation.

