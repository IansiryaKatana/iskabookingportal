# Concurrent User Support Analysis

## Executive Summary

**Current Status:** ⚠️ **PARTIALLY SUPPORTED** - The system has basic concurrent user support but has several race condition vulnerabilities that need to be addressed.

---

## 1. ✅ What's Working Well

### 1.1 Authentication & Sessions
- **✅ Multiple Concurrent Sessions:** Supabase Auth handles multiple simultaneous logins per user (different devices/browsers)
- **✅ Session Isolation:** Each user's session is isolated - no conflicts between different users
- **✅ Staff/Student/Partner Separation:** RLS policies ensure users only access their own data
- **✅ Auto Token Refresh:** Sessions automatically refresh, preventing conflicts

### 1.2 Database Constraints
- **✅ Unique Constraints:** 
  - Email addresses (enforced by Supabase Auth)
  - Referral codes (`partners.referral_code` is UNIQUE)
  - Contract slugs are unique
  - Receipt numbers are unique
- **✅ Primary Keys:** All tables have proper primary keys
- **✅ Foreign Keys:** Proper referential integrity maintained

### 1.3 Basic Concurrency Protection
- **✅ Conditional Updates:** Studio reservation uses `eq("status", "available")` check
- **✅ Indexes:** Performance indexes exist for common queries
- **✅ RLS Policies:** Row-level security prevents unauthorized access

---

## 2. ⚠️ Race Condition Vulnerabilities

### 2.1 Partner Registration - Referral Code Linking ⚠️ **CRITICAL**

**Location:** `src/pages/partner/Register.tsx` + `link_partner_account()` function

**IMPORTANT DISTINCTION:**
- **Partner Registration:** ONE partner account can be linked to ONE referral code (one-to-one relationship)
- **Student Applications:** MULTIPLE students can USE the same referral code (one-to-many relationship)
  - Each student application creates a separate `partner_referrals` record
  - Many students can use code "PARTNER123" - each gets their own referral record
  - ✅ **NO RACE CONDITION** for students using referral codes

**Problem (Partner Registration Only):**
```sql
-- Current flow (VULNERABLE):
1. Check if code is available (SELECT)
2. [RACE CONDITION WINDOW - another user could link here]
3. Link account (UPDATE)
```

**Scenario:**
- Partner User A and Partner User B both try to register with the same referral code simultaneously
- Both pass the `check_referral_code_available` check
- Both try to link - one succeeds, one fails with confusing error
- **Note:** This is ONLY for partner account registration, NOT for students using referral codes

**Current Code:**
```226:276:supabase/migrations/20251118_partner_referral_code_system.sql
CREATE OR REPLACE FUNCTION public.link_partner_account(
  p_referral_code TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_partner_id UUID;
  v_code_already_linked BOOLEAN;
BEGIN
  -- Normalize referral code
  p_referral_code := UPPER(TRIM(p_referral_code));
  
  -- Find partner by referral code
  SELECT id INTO v_partner_id
  FROM public.partners
  WHERE UPPER(TRIM(referral_code)) = p_referral_code
    AND is_active = true;
  
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid referral code. Please check and try again.';
  END IF;
  
  -- Check if referral code is already linked to another account
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE partner_id = v_partner_id
      AND id != p_user_id
  ) INTO v_code_already_linked;
  
  IF v_code_already_linked THEN
    RAISE EXCEPTION 'This referral code is already linked to another account. Please contact admin.';
  END IF;
  
  -- Link account to partner
  UPDATE public.profiles
  SET 
    role = 'partner',
    partner_id = v_partner_id
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;
  
  RETURN TRUE;
END;
$$;
```

**Fix Required:** Use `SELECT FOR UPDATE` or atomic UPDATE with WHERE clause check

---

### 2.2 Studio Reservations ⚠️ **HIGH PRIORITY**

**Location:** `src/hooks/useStudios.ts` - `reserveStudio()` function

**Problem:**
```typescript
// Current flow (VULNERABLE):
1. Release expired reservations (UPDATE)
2. [RACE CONDITION - another student could reserve here]
3. Reserve studio (UPDATE with status check)
```

**Scenario:**
- Student A and Student B both try to reserve Studio #101 simultaneously
- Both see it as "available"
- Both execute reservation - one succeeds, one gets "Studio already reserved" error

**Current Code:**
```48:93:src/hooks/useStudios.ts
const reserveStudio = async ({
  studioId,
  applicationId,
  studentId,
}: ReservePayload) => {
  const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  await supabase
    .from("studios")
    .update({
      status: "available",
      reservation_expires_at: null,
      allocation: null,
    })
    .eq("id", studioId)
    .eq("status", "reserved")
    .lt("reservation_expires_at", now);

  const { error: reserveError, data } = await supabase
    .from("studios")
    .update({
      status: "reserved",
      reservation_expires_at: expiry,
      allocation: studentId,
    })
    .eq("id", studioId)
    .eq("status", "available")
    .select("id")
    .maybeSingle();

  if (reserveError) throw reserveError;
  if (!data) throw new Error("Studio already reserved");

  const { error: applicationError } = await supabase
    .from("student_applications")
    .update({
      assigned_studio_id: studioId,
      reserved_studio_expires_at: expiry,
    })
    .eq("id", applicationId);

  if (applicationError) throw applicationError;

  return { studioId, expiry };
};
```

**Issues:**
1. **Not Atomic:** Three separate database calls (release expired → reserve → update application)
2. **No Transaction:** If step 3 fails, studio is reserved but application isn't updated
3. **No Row Locking:** Multiple students can check availability simultaneously

**Fix Required:** Move to database function with transaction and `SELECT FOR UPDATE`

---

### 2.3 Student Registration - Email Conflicts ✅ **HANDLED**

**Status:** ✅ **PROTECTED** by Supabase Auth

- Supabase Auth enforces unique email addresses at database level
- Concurrent registration attempts with same email will fail gracefully
- Error message: "User already registered"

---

## 3. 🔍 Detailed Analysis by Use Case

### 3.1 Multiple Students Registering Simultaneously ✅ **SAFE**

**Scenario:** 10 students register at the same time

**Protection:**
- ✅ Supabase Auth handles concurrent user creation
- ✅ Email uniqueness enforced at database level
- ✅ Profile creation via trigger is atomic
- ✅ No race conditions in basic registration

**Potential Issue:**
- ⚠️ Profile name sync happens after auth creation (non-atomic)
- If profile update fails, user is created but names aren't saved
- **Impact:** Low - names can be updated later

---

### 3.2 Multiple Students Logged Into Portal ✅ **SAFE**

**Scenario:** 50 students logged in simultaneously, viewing/editing their applications

**Protection:**
- ✅ RLS policies ensure students only see their own data
- ✅ Each session is isolated
- ✅ React Query caching prevents unnecessary duplicate requests
- ✅ No shared state conflicts

**Note:** Students can't interfere with each other's data due to RLS

---

### 3.3 Multiple Staff Members Logged In ✅ **MOSTLY SAFE**

**Scenario:** 5 staff members working simultaneously

**Protection:**
- ✅ RLS policies allow staff to see all student data
- ✅ Each staff session is isolated
- ✅ No shared editing conflicts (no real-time collaboration)

**Potential Issues:**
- ⚠️ If two staff edit same record simultaneously, last write wins (no conflict detection)
- ⚠️ No optimistic locking or version tracking
- **Impact:** Medium - could cause data loss if two staff edit same record

---

### 3.4 Studio Selection Race Condition ⚠️ **VULNERABLE**

**Scenario:** 3 students try to reserve the same studio at the same time

**Current Behavior:**
- All 3 see studio as "available"
- All 3 click "Reserve"
- First request succeeds
- Other 2 get "Studio already reserved" error
- **User Experience:** Poor - users see error after clicking

**Fix Needed:**
- Use database function with `SELECT FOR UPDATE` (row-level lock)
- Atomic reservation in single transaction
- Better error handling with retry mechanism

---

## 4. 📊 Recommendations

### Priority 1: Fix Studio Reservation Race Condition

**Solution:** Create database function with transaction

```sql
CREATE OR REPLACE FUNCTION public.reserve_studio_atomic(
  p_studio_id UUID,
  p_application_id UUID,
  p_student_id UUID,
  p_reservation_duration_minutes INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expiry TIMESTAMPTZ;
  v_studio_status TEXT;
  v_result JSONB;
BEGIN
  -- Calculate expiry
  v_expiry := NOW() + (p_reservation_duration_minutes || ' minutes')::INTERVAL;
  
  -- Lock row and check availability (atomic)
  SELECT status INTO v_studio_status
  FROM public.studios
  WHERE id = p_studio_id
  FOR UPDATE; -- Row-level lock
  
  -- Check if available or expired reservation
  IF v_studio_status != 'available' 
     AND NOT (v_studio_status = 'reserved' 
              AND reservation_expires_at < NOW()) THEN
    RAISE EXCEPTION 'Studio is not available for reservation';
  END IF;
  
  -- Reserve studio
  UPDATE public.studios
  SET 
    status = 'reserved',
    reservation_expires_at = v_expiry,
    allocation = p_student_id::TEXT
  WHERE id = p_studio_id;
  
  -- Update application
  UPDATE public.student_applications
  SET 
    assigned_studio_id = p_studio_id,
    reserved_studio_expires_at = v_expiry
  WHERE id = p_application_id;
  
  -- Return result
  v_result := jsonb_build_object(
    'studio_id', p_studio_id,
    'expiry', v_expiry,
    'success', true
  );
  
  RETURN v_result;
END;
$$;
```

---

### Priority 2: Fix Partner Account Registration Race Condition

**Note:** This is ONLY for partner account registration (linking a partner user account to a referral code). Students using referral codes during application have NO race condition - multiple students can use the same code.

**Solution:** Use atomic UPDATE with WHERE clause

```sql
CREATE OR REPLACE FUNCTION public.link_partner_account(
  p_referral_code TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_partner_id UUID;
  v_updated_rows INTEGER;
BEGIN
  -- Normalize referral code
  p_referral_code := UPPER(TRIM(p_referral_code));
  
  -- Find partner by referral code
  SELECT id INTO v_partner_id
  FROM public.partners
  WHERE UPPER(TRIM(referral_code)) = p_referral_code
    AND is_active = true
  FOR UPDATE; -- Lock row to prevent concurrent linking
  
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid referral code. Please check and try again.';
  END IF;
  
  -- Atomic update: only succeeds if partner_id is not already linked
  UPDATE public.profiles
  SET 
    role = 'partner',
    partner_id = v_partner_id
  WHERE id = p_user_id
    AND (partner_id IS NULL OR partner_id = v_partner_id) -- Allow re-linking same partner
    AND NOT EXISTS (
      SELECT 1 
      FROM public.profiles p2
      WHERE p2.partner_id = v_partner_id 
        AND p2.id != p_user_id
    )
  RETURNING id INTO v_partner_id;
  
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  
  IF v_updated_rows = 0 THEN
    RAISE EXCEPTION 'This referral code is already linked to another account. Please contact admin.';
  END IF;
  
  RETURN TRUE;
END;
$$;
```

---

### Priority 3: Add Optimistic Locking for Staff Edits (Optional)

**For future enhancement:**
- Add `version` column to critical tables
- Check version before update
- Increment version on update
- Reject updates with stale version

---

## 5. ✅ Summary

| Use Case | Status | Notes |
|----------|--------|-------|
| Multiple students registering | ✅ Safe | Protected by Supabase Auth |
| Multiple students logged in | ✅ Safe | RLS isolation works |
| Multiple staff logged in | ✅ Mostly Safe | No conflict detection (acceptable) |
| Studio reservations | ⚠️ Vulnerable | Race condition exists |
| Partner account registration | ⚠️ Vulnerable | Race condition exists (partner account linking only) |
| Students using referral codes | ✅ Safe | Multiple students can use same code (no race condition) |
| Email uniqueness | ✅ Safe | Database constraint |
| Session management | ✅ Safe | Supabase handles it |

---

## 6. Action Items

1. **URGENT:** Fix studio reservation race condition (Priority 1)
2. **HIGH:** Fix partner referral code race condition (Priority 2)
3. **MEDIUM:** Add retry mechanism for failed reservations
4. **LOW:** Add optimistic locking for staff edits (future enhancement)

---

## Conclusion

The system **CAN handle concurrent users** for most operations, but has **two critical race conditions** that need fixing:
1. Studio reservations (high traffic scenario)
2. Partner account registration - linking a partner user account to a referral code (less common but still important)

**IMPORTANT CLARIFICATION:**
- ✅ **Students using referral codes:** NO race condition - multiple students can use the same referral code
- ⚠️ **Partner account registration:** Race condition exists - only one partner account can be linked to a referral code

Both race conditions can be fixed with proper database-level transactions and row locking.

