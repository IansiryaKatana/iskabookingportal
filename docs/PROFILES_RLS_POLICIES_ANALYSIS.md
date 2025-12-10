# Profiles Table RLS Policies - Current State & Recommendations

## Current RLS Policies on `profiles` Table

### 1. **"Users read own profile"** (SELECT)
```sql
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR public.is_staff()
  );
```
**Purpose**: Allows users to read their own profile OR staff/superadmin can read any profile  
**Status**: ✅ Working correctly

---

### 2. **"Users update own profile"** (UPDATE)
```sql
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```
**Purpose**: Allows users to update ONLY their own profile  
**Status**: ⚠️ **This is the problem!** This policy prevents staff from updating other users' profiles

---

### 3. **"Staff manage profiles"** (ALL operations)
```sql
CREATE POLICY "Staff manage profiles" ON public.profiles
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());
```
**Purpose**: Allows staff/superadmin to perform ALL operations (SELECT, INSERT, UPDATE, DELETE) on any profile  
**Status**: ✅ Should work, but might conflict with policy #2

---

### 4. **"Partners can view own profile"** (SELECT)
```sql
CREATE POLICY "Partners can view own profile" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.is_partner()
  );
```
**Purpose**: Allows partners to view their own profile or any profile if they're a partner  
**Status**: ✅ Working correctly

---

### 5. **"Partners can update own profile"** (UPDATE)
```sql
CREATE POLICY "Partners can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```
**Purpose**: Allows partners to update only their own profile  
**Status**: ✅ Working correctly (doesn't conflict with staff operations)

---

## The Problem

**Policy Conflict**: The "Users update own profile" policy (policy #2) has a `WITH CHECK (auth.uid() = id)` clause that prevents staff from updating other users' profiles, even though "Staff manage profiles" (policy #3) should allow it.

In PostgreSQL RLS, when multiple policies exist:
- `USING` clause determines which rows can be accessed
- `WITH CHECK` clause determines which rows can be inserted/updated

The issue is that policy #2's `WITH CHECK` is too restrictive and conflicts with policy #3.

---

## Recommended Fix

### Option 1: Remove the conflicting policy (RECOMMENDED)

Since "Staff manage profiles" already covers all operations for staff, we can remove "Users update own profile" and let staff handle all updates. Regular users can still update their own profiles via the "Staff manage profiles" policy (since `is_staff()` returns true for staff updating their own profile).

**Migration:**
```sql
-- Remove the conflicting policy
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

-- The "Staff manage profiles" policy will handle all updates
-- Staff can update any profile (including their own)
-- Regular users can update their own profile (via is_staff() check on their own profile)
```

**However**, this might not work for regular users (students) updating their own profiles if they're not staff.

### Option 2: Fix the "Users update own profile" policy (BETTER)

Update the policy to allow staff to bypass it:

```sql
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE 
  USING (
    auth.uid() = id
    OR public.is_staff()
  )
  WITH CHECK (
    auth.uid() = id
    OR public.is_staff()
  );
```

**This allows:**
- Users to update their own profile (`auth.uid() = id`)
- Staff to update any profile (`public.is_staff()`)

---

## Recommended Migration

Create a new migration file to fix the RLS policies:

```sql
-- Fix profiles RLS policies to allow staff to update any profile
-- while still allowing users to update their own profile

-- Drop the conflicting policy
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

-- Recreate with staff bypass
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE 
  USING (
    auth.uid() = id
    OR public.is_staff()
  )
  WITH CHECK (
    auth.uid() = id
    OR public.is_staff()
  );
```

---

## Current Policy Summary

| Policy Name | Operation | Allows | Status |
|------------|-----------|--------|--------|
| Users read own profile | SELECT | Own profile OR staff can read any | ✅ Working |
| Users update own profile | UPDATE | **ONLY own profile** | ❌ **Blocking staff updates** |
| Staff manage profiles | ALL | Staff can do everything | ✅ Should work but conflicts |
| Partners can view own profile | SELECT | Own profile OR partner can read any | ✅ Working |
| Partners can update own profile | UPDATE | Only own profile | ✅ Working |

---

## Why Edge Function Works

The edge function uses `SUPABASE_SERVICE_ROLE_KEY` which:
- Bypasses all RLS policies
- Has full database access
- Can update any profile regardless of policies

This is why switching to the edge function fixed the issue, but it's better to fix the RLS policies so direct updates work too.

---

**Recommendation**: Use Option 2 (fix the policy) so that:
1. ✅ Staff can update any profile (via direct database call)
2. ✅ Users can update their own profile
3. ✅ Edge function still works as backup
4. ✅ Better security (RLS still enforced)

