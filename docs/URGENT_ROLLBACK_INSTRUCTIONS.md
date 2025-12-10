# URGENT: Rollback is_staff() Function Fix

## Problem
The migration `20250129_fix_is_staff_rls_recursion.sql` broke student application creation. Students are getting:
```
403 Forbidden: new row violates row-level security policy for table "student_applications"
```

## Root Cause
The change to `is_staff()` function (using `SELECT ... INTO` instead of `RETURN EXISTS`) may have caused RLS policy evaluation issues.

## Immediate Fix

### Option 1: Run SQL Directly (FASTEST)
1. Go to **Supabase Dashboard** > **SQL Editor**
2. Copy and paste the contents of `ROLLBACK_IS_STAFF_FUNCTION.sql`
3. Click **Run**
4. Test creating an application

### Option 2: Delete Migration File
1. Delete `supabase/migrations/20250129_fix_is_staff_rls_recursion.sql`
2. The rollback migration `20250129_rollback_is_staff_fix.sql` will restore the original function

## What Was Changed
The migration changed `is_staff()` from:
```sql
RETURN EXISTS (...)
```
to:
```sql
SELECT EXISTS (...) INTO is_staff_result;
RETURN COALESCE(is_staff_result, FALSE);
```

This subtle change may have broken RLS policy evaluation.

## After Rollback
- ✅ Student application creation should work again
- ✅ All other RLS policies should work
- ⚠️ The original issue (superadmin not seeing all users) will still exist

## Next Steps (After System is Fixed)
1. Investigate the original issue differently
2. Don't modify `is_staff()` - it's too critical
3. Instead, fix the specific RLS policy or use edge function for user fetching

