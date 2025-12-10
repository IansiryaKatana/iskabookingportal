# URGENT: Fix Application Creation Issue

## Problem
After running the `is_staff()` migration, student application creation is broken with:
```
403 Forbidden: new row violates row-level security policy for table "student_applications"
```

## Root Cause
The `is_staff()` function change may have corrupted RLS policy evaluation, even though the INSERT policy doesn't use `is_staff()`.

## Immediate Fix

### Step 1: Run the Complete Fix SQL
1. Go to **Supabase Dashboard** > **SQL Editor**
2. Open the file `COMPLETE_FIX_APPLICATION_CREATION.sql`
3. Copy the **ENTIRE** contents
4. Paste into SQL Editor
5. Click **Run**
6. Check the results - you should see:
   - `is_staff_check`: true or false (not an error)
   - List of policies on `student_applications`
   - Confirmation that INSERT policy was recreated
   - Status message: "Fix complete!"

### Step 2: Test Application Creation
1. Log in as a student
2. Go to a contract page
3. Click "Enquire" or "Start Application"
4. It should work now

## What the Fix Does

1. **Restores Original Function**: Restores `is_staff()` to the exact working version
2. **Verifies Function**: Tests that the function works
3. **Checks Policies**: Lists all RLS policies on `student_applications`
4. **Recreates INSERT Policy**: Drops and recreates the INSERT policy to ensure it's not corrupted
5. **Confirms Fix**: Shows confirmation message

## If It Still Doesn't Work

1. Check the SQL Editor output for any errors
2. Verify you're logged in as a student (not staff)
3. Check browser console for the exact error message
4. Verify `auth.uid()` matches the `student_id` being inserted

## Prevention

**DO NOT** modify `is_staff()` function in the future. It's too critical and affects 130+ RLS policies.

