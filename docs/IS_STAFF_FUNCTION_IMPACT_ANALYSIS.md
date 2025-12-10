# `is_staff()` Function Impact Analysis

## ⚠️ CRITICAL: This Function is Used System-Wide

The `is_staff()` function is used in **130+ RLS policies** across the entire system. Any changes must be made with extreme caution.

## Current Usage

### Tables Using `is_staff()` in RLS Policies:

1. **profiles** - Staff can manage all profiles
2. **student_applications** - Staff can view/manage all applications
3. **student_application_steps** - Staff can view/manage all steps
4. **studios** - Staff can manage studios
5. **contracts** - Staff can manage contracts
6. **academic_years** - Staff can manage academic years
7. **studio_grades** - Staff can manage studio grades
8. **payment_plans** - Staff can manage payment plans
9. **financial_forecasts** - Staff can manage forecasts
10. **docusign_envelopes** - Staff can view/manage envelopes
11. **manual_payments** - Staff can manage payments
12. **notifications** - Staff can manage notifications
13. **email_templates** - Staff can manage templates
14. **branding_settings** - Staff can manage branding
15. **cashback_campaigns** - Staff can manage campaigns
16. **referral_codes** - Staff can manage referral codes
17. **partners** - Staff can manage partners
18. **stripe_payments** - Staff can view payments
19. **refunds** - Staff can manage refunds
20. **staff_activity_logs** - Staff can view logs
21. **storage buckets** - Staff can manage documents/branding
22. **bulk_import_logs** - Staff can manage import logs

**And many more...**

## Current Implementation

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
    FROM public.profiles p
    WHERE p.id = current_uid
      AND p.role IN ('staff', 'superadmin')
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;
```

## Proposed Fix

The proposed fix is **essentially the same logic**, just with:
1. More explicit null handling (`COALESCE`)
2. Slightly more defensive error handling
3. Better variable naming

**Key Point**: The logic is **identical** - it still:
- Checks if `auth.uid()` is null → returns false
- Queries `profiles` table for staff/superadmin role → returns true/false
- Uses `SECURITY DEFINER` to bypass RLS
- Handles exceptions by returning false

## Safety Assessment

### ✅ SAFE - The fix is safe because:

1. **Same Logic**: The core logic is identical to the current implementation
2. **Same Security**: Still uses `SECURITY DEFINER` to bypass RLS
3. **Same Return Values**: Still returns `boolean` (true/false)
4. **Backward Compatible**: No changes to function signature or behavior
5. **More Defensive**: Better null handling (won't break if something unexpected happens)

### ⚠️ RISKS (Minimal):

1. **Function Recreation**: Using `DROP FUNCTION ... CASCADE` will temporarily remove the function
   - **Mitigation**: The function is recreated immediately in the same transaction
   - **Impact**: Very brief moment where policies might fail (milliseconds)
   
2. **RLS Policy Evaluation**: If the function is being evaluated during the drop, policies might temporarily fail
   - **Mitigation**: PostgreSQL handles this gracefully, policies will re-evaluate after recreation
   - **Impact**: Minimal - policies will work again immediately

## Recommendation

### Option 1: Use `CREATE OR REPLACE` (SAFER - RECOMMENDED)

Instead of `DROP ... CASCADE`, use `CREATE OR REPLACE` which is atomic:

```sql
-- Safer approach - no DROP needed
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
  
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = current_uid
      AND p.role IN ('staff', 'superadmin')
  ) INTO is_staff_result;
  
  RETURN COALESCE(is_staff_result, FALSE);
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;
```

**Benefits**:
- ✅ No DROP needed - function is replaced atomically
- ✅ No brief moment where function doesn't exist
- ✅ Policies continue working throughout
- ✅ Same improved logic

### Option 2: Keep Current Function, Fix RLS Policy Instead

Instead of changing the function, we could fix the specific RLS policy that's causing the issue:

```sql
-- Fix the profiles SELECT policy to be more explicit
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('staff', 'superadmin')
      )
    )
  );
```

**But this is less clean** and duplicates the `is_staff()` logic.

## Testing Plan

If we proceed with the fix:

1. **Test in Development First**
   - Run migration on dev/staging
   - Test all admin pages
   - Test student portal (should still work)
   - Test staff operations

2. **Verify Critical Functions**
   - ✅ Staff can see all users
   - ✅ Staff can manage applications
   - ✅ Staff can manage studios
   - ✅ Staff can manage contracts
   - ✅ Students can still access their own data

3. **Monitor After Deployment**
   - Watch for any RLS policy errors
   - Check logs for function evaluation issues
   - Verify all admin operations work

## Final Recommendation

**Use Option 1** (`CREATE OR REPLACE` without `DROP CASCADE`):
- ✅ Safest approach
- ✅ No downtime
- ✅ Same improved logic
- ✅ Minimal risk

The function fix is safe, but using `CREATE OR REPLACE` instead of `DROP ... CASCADE` eliminates even the minimal risk.

