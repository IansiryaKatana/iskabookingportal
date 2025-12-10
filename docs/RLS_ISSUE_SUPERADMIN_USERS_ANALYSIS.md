# RLS Issue: Superadmin Cannot See All Users

## Problem
Superadmins are only seeing themselves in the Users page, not all staff/superadmin users.

## Current Query
```typescript
const { data: profiles, error: profilesError } = await supabase
  .from("profiles")
  .select("id, role, first_name, last_name")
  .in("role", ["staff", "superadmin"])  // Client-side filter
  .order("created_at", { ascending: false });
```

## Current RLS Policies on `profiles` Table

### 1. "Users read own profile" (SELECT)
```sql
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR public.is_staff()
  );
```
**Should allow**: Users to read their own profile OR staff/superadmin to read any profile

### 2. "Staff manage profiles" (ALL operations)
```sql
CREATE POLICY "Staff manage profiles" ON public.profiles
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());
```
**Should allow**: Staff/superadmin to perform ALL operations (including SELECT) on any profile

### 3. "Partners can view own profile" (SELECT)
```sql
CREATE POLICY "Partners can view own profile" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.is_partner()
  );
```
**Not relevant** for this issue

## The Issue

**Potential RLS Recursion Problem**: The `is_staff()` function queries the `profiles` table:

```sql
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_uid uuid;
BEGIN
  current_uid := auth.uid();
  
  IF current_uid IS NULL THEN
    RETURN FALSE;
  END IF;
  
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p  -- <-- Queries profiles table
    WHERE p.id = current_uid
      AND p.role in ('staff', 'superadmin')
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;
```

Even though `is_staff()` uses `SECURITY DEFINER` (which should bypass RLS), when it's called from within an RLS policy, there might still be evaluation issues.

## Root Cause Analysis

The problem is likely:

1. **RLS Policy Evaluation Order**: When a superadmin queries profiles, PostgreSQL evaluates RLS policies first
2. **Policy Conflict**: Both "Users read own profile" and "Staff manage profiles" should allow access, but there might be an evaluation issue
3. **Client-Side Filter**: The `.in("role", ["staff", "superadmin"])` filter is applied AFTER RLS, so if RLS only returns the superadmin's own profile, the filter won't help

## The Fix

The issue is that `is_staff()` queries `profiles` table, which has RLS policies that call `is_staff()`. Even with `SECURITY DEFINER`, this can cause issues.

**Solution**: Ensure `is_staff()` function properly bypasses RLS when checking the profiles table. The function already uses `SECURITY DEFINER`, but we need to verify it's working correctly.

However, there's a better approach: **Remove the client-side filter and let RLS handle it**, OR **use an edge function to bypass RLS entirely**.

## Recommended Solutions

### Option 1: Use Edge Function (RECOMMENDED - Already Working)
The edge function approach already works because it uses service role which bypasses RLS. This is the current solution.

### Option 2: Fix RLS Query (Better for Direct Queries)
Remove the `.in("role", ...)` filter and fetch all profiles, then filter client-side. The RLS policy should allow superadmin to see all profiles.

### Option 3: Create a Database View (Best Long-term)
Create a view that staff can access without RLS restrictions:

```sql
CREATE OR REPLACE VIEW public.staff_profiles AS
SELECT id, role, first_name, last_name, created_at
FROM public.profiles
WHERE role IN ('staff', 'superadmin');

-- Grant access to authenticated users (RLS will still apply)
GRANT SELECT ON public.staff_profiles TO authenticated;
```

But this won't help if RLS is still blocking.

### Option 4: Fix is_staff() Function (Most Direct)
Ensure the `is_staff()` function properly bypasses RLS. It already uses `SECURITY DEFINER`, but we can make it more explicit:

```sql
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_uid uuid;
  is_staff_result boolean;
BEGIN
  current_uid := auth.uid();
  
  IF current_uid IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Explicitly bypass RLS by using SECURITY DEFINER
  -- This query should not be subject to RLS policies
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = current_uid
      AND p.role IN ('staff', 'superadmin')
  ) INTO is_staff_result;
  
  RETURN COALESCE(is_staff_result, FALSE);
EXCEPTION
  WHEN OTHERS THEN
    -- If anything goes wrong, fail closed
    RETURN FALSE;
END;
$$;
```

## Current Status

The edge function approach is working, but direct database queries are not. This suggests the RLS policies are indeed blocking the query.

## Next Steps

1. **Test the `is_staff()` function directly** to see if it returns true for superadmin
2. **Check if removing the `.in("role", ...)` filter helps** (let RLS return all profiles)
3. **Consider using an edge function for fetching users** (similar to how we fetch emails)

## Quick Test Query

To test if RLS is working, try this in Supabase SQL Editor (as superadmin):

```sql
-- This should return all staff/superadmin profiles
SELECT id, role, first_name, last_name
FROM public.profiles
WHERE role IN ('staff', 'superadmin')
ORDER BY created_at DESC;
```

If this returns only the current user, then RLS is blocking. If it returns all users, then the issue is in the frontend query.

