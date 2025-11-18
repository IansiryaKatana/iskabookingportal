# First Name & Last Name Sync Recommendations

## Problem Analysis

### Current Data Flow

1. **Registration (`Auth.tsx`)**:
   - Collects `first_name` and `last_name`
   - Passes to `signUp()` with metadata
   - `signUp()` stores in `user.app_metadata` (via Supabase Auth `options.data`)
   - ❌ **NOT saved to `profiles` table**

2. **Application Wizard Step 1 (`ApplicationWizard.tsx`)**:
   - Collects `first_name` and `last_name` again
   - Saves to `student_application_steps` table as JSON payload (step_number = 1)
   - ❌ **NOT saved to `profiles` table**

3. **Profile Page (`Profile.tsx`)**:
   - Reads from `profiles.first_name` and `profiles.last_name`
   - ❌ **Fields appear empty** because they were never saved to `profiles` table

### Database Schema

- `profiles` table has `first_name` and `last_name` columns (nullable)
- `handle_new_user()` trigger only creates profile with `id`, not names
- `student_application_steps.payload` stores names as JSON

## Root Cause

**No sync mechanism exists between:**
- `user.app_metadata` → `profiles` table
- `student_application_steps.payload` → `profiles` table

## Recommended Solutions

### Solution 1: Update Registration to Save to Profiles (HIGH PRIORITY)

**File**: `src/contexts/AuthContext.tsx`

Update the `signUp` function to also update the `profiles` table:

```typescript
const signUp = useCallback(
  async (
    email: string,
    password: string,
    metadata?: { first_name?: string; last_name?: string },
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: metadata?.first_name,
          last_name: metadata?.last_name,
          role: "student",
        },
      },
    });

    if (error) {
      console.error("Sign up failed:", error);
      return { error: error.message };
    }

    if (!data.session || !data.user) {
      // Email confirmation is required
      return { requiresConfirmation: true, email };
    }

    // ✅ NEW: Update profiles table with first_name and last_name
    if (metadata?.first_name || metadata?.last_name) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          first_name: metadata.first_name || null,
          last_name: metadata.last_name || null,
        })
        .eq("id", data.user.id);

      if (profileError) {
        console.error("Failed to update profile:", profileError);
        // Don't fail registration, just log the error
      }
    }

    setSession(data.session);
    updateUser(data.user);
    await refreshProfile(data.user.id);
    return {};
  },
  [refreshProfile, updateUser],
);
```

**Benefits**:
- Names available immediately after registration
- Profile page shows names right away
- No duplicate data entry needed

---

### Solution 2: Sync from Application Wizard Step 1 (HIGH PRIORITY)

**File**: `src/pages/portal/ApplicationWizard.tsx`

Update the `handlePersonalSubmit` function to also update the `profiles` table:

```typescript
const handlePersonalSubmit = async (
  event: React.FormEvent<HTMLFormElement>,
) => {
  event.preventDefault();
  // ... existing validation code ...

  const sanitized: PersonalValues = {
    ...parsed.data,
    age: calculateAgeFromDob(parsed.data.date_of_birth),
  };
  setPersonalValues(sanitized);
  setPersonalErrors({});

  // Save to application steps (existing)
  await handleStepSubmit(1, sanitized);

  // ✅ NEW: Also update profiles table
  if (sanitized.first_name || sanitized.last_name) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        first_name: sanitized.first_name || null,
        last_name: sanitized.last_name || null,
      })
      .eq("id", user?.id);

    if (profileError) {
      console.error("Failed to update profile:", profileError);
      // Don't fail step submission, just log the error
    } else {
      // Refresh profile to update UI
      await refreshProfile();
    }
  }
};
```

**Benefits**:
- Names sync when application wizard step 1 is completed
- Works even if registration didn't save names
- Ensures profile is always up-to-date

---

### Solution 3: Profile Page Fallback Logic (MEDIUM PRIORITY)

**File**: `src/pages/portal/Profile.tsx`

Add fallback logic to read from `app_metadata` or `application_steps` if `profiles` is empty:

```typescript
// Add this useEffect to fetch names from fallback sources
useEffect(() => {
  if (!profile?.first_name || !profile?.last_name) {
    // Try to get from app_metadata
    const appMetadata = user?.app_metadata;
    const firstNameFromMetadata = appMetadata?.first_name;
    const lastNameFromMetadata = appMetadata?.last_name;

    // Or try to get from application_steps (if application exists)
    // This would require fetching the application first

    if (firstNameFromMetadata || lastNameFromMetadata) {
      // Update profile with metadata
      supabase
        .from("profiles")
        .update({
          first_name: firstNameFromMetadata || profile?.first_name || null,
          last_name: lastNameFromMetadata || profile?.last_name || null,
        })
        .eq("id", user?.id)
        .then(() => refreshProfile());
    }
  }
}, [user, profile, refreshProfile]);
```

**Benefits**:
- Handles existing users who registered before the fix
- Provides fallback for edge cases
- Auto-syncs missing data

---

### Solution 4: Database Trigger for Auto-Sync (OPTIONAL, FUTURE-PROOF)

**File**: `supabase/migrations/[timestamp]_sync_profile_names.sql`

Create a database trigger to auto-sync names from `app_metadata` to `profiles`:

```sql
-- Function to sync first_name and last_name from auth.users to profiles
CREATE OR REPLACE FUNCTION public.sync_profile_names_from_auth()
RETURNS TRIGGER AS $$
BEGIN
  -- Update profiles table when user metadata changes
  UPDATE public.profiles
  SET
    first_name = COALESCE(
      (NEW.raw_user_meta_data->>'first_name')::text,
      first_name
    ),
    last_name = COALESCE(
      (NEW.raw_user_meta_data->>'last_name')::text,
      last_name
    ),
    updated_at = NOW()
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users update
CREATE TRIGGER sync_profile_names_trigger
AFTER UPDATE ON auth.users
FOR EACH ROW
WHEN (
  OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data
)
EXECUTE FUNCTION public.sync_profile_names_from_auth();
```

**Benefits**:
- Automatic sync from auth metadata
- Future-proof for any changes to auth metadata
- No code changes needed

**Note**: This requires Supabase admin access and may need to be run via SQL editor.

---

## Implementation Priority

1. **Solution 1** (Update Registration) - **IMMEDIATE**
   - Fixes the issue for all new registrations
   - Simple code change
   - No database migration needed

2. **Solution 2** (Sync from Application Wizard) - **IMMEDIATE**
   - Ensures names are saved when application is started
   - Works for existing users who haven't completed step 1 yet
   - Simple code change

3. **Solution 3** (Profile Page Fallback) - **SHORT TERM**
   - Handles existing users with missing data
   - Provides better UX
   - More complex but worth it

4. **Solution 4** (Database Trigger) - **LONG TERM**
   - Future-proof solution
   - Requires database migration
   - Can be added later

## Recommended Implementation Order

1. ✅ Implement **Solution 1** (Update Registration)
2. ✅ Implement **Solution 2** (Sync from Application Wizard)
3. ✅ Implement **Solution 3** (Profile Page Fallback) - for existing users
4. ⏳ Consider **Solution 4** (Database Trigger) - for future-proofing

## Testing Checklist

After implementation, test:

- [ ] New user registration → Profile page shows names
- [ ] Existing user completes application step 1 → Profile page shows names
- [ ] Existing user with names in app_metadata → Profile page auto-syncs
- [ ] Profile page edit → Names update correctly
- [ ] Multiple applications → Names stay consistent

## Migration for Existing Users

For existing users who already have names in `app_metadata` or `application_steps` but not in `profiles`, you can run a one-time migration:

```sql
-- One-time migration to sync existing names
UPDATE public.profiles p
SET
  first_name = COALESCE(
    p.first_name,
    (SELECT (raw_user_meta_data->>'first_name')::text 
     FROM auth.users 
     WHERE id = p.id)
  ),
  last_name = COALESCE(
    p.last_name,
    (SELECT (raw_user_meta_data->>'last_name')::text 
     FROM auth.users 
     WHERE id = p.id)
  )
WHERE p.first_name IS NULL OR p.last_name IS NULL;
```

Or sync from application_steps:

```sql
-- Sync from most recent application step 1
UPDATE public.profiles p
SET
  first_name = COALESCE(
    p.first_name,
    (SELECT (sas.payload->>'first_name')::text
     FROM student_application_steps sas
     JOIN student_applications sa ON sa.id = sas.application_id
     WHERE sa.student_id = p.id
       AND sas.step_number = 1
     ORDER BY sa.created_at DESC
     LIMIT 1)
  ),
  last_name = COALESCE(
    p.last_name,
    (SELECT (sas.payload->>'last_name')::text
     FROM student_application_steps sas
     JOIN student_applications sa ON sa.id = sas.application_id
     WHERE sa.student_id = p.id
       AND sas.step_number = 1
     ORDER BY sa.created_at DESC
     LIMIT 1)
  )
WHERE p.first_name IS NULL OR p.last_name IS NULL;
```

---

## Summary

The issue is that names are collected in two places (registration and application wizard) but never saved to the `profiles` table. The recommended solution is to:

1. **Update registration** to save names to profiles immediately
2. **Update application wizard step 1** to sync names to profiles
3. **Add fallback logic** in profile page for existing users
4. **Consider database trigger** for future-proofing

This ensures names are always available in the `profiles` table, which is the single source of truth for the profile page.

