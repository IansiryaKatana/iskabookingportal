# Rebooking Functionality Status

## ✅ What's Built

### 1. Database Backend (Complete)
- ✅ **Migration:** `20251118_rebooking_system.sql`
- ✅ **Fields added to `student_applications`:**
  - `is_rebooking` (BOOLEAN)
  - `previous_application_id` (UUID)
  - `rebooking_reason` (TEXT)
  - `rebooking_approved_at` (TIMESTAMPTZ)
  - `rebooking_approved_by` (UUID)
- ✅ **Database Functions:**
  - `can_student_rebook(p_user_id, p_contract_id)` - Checks if student can rebook
  - `get_rebooking_data(p_previous_application_id)` - Gets data from previous application
- ✅ **Indexes created** for performance
- ⚠️ **Bug Fix Needed:** `20251118_fix_rebooking_user_id.sql` - Function uses wrong column name

### 2. React Hooks (Complete)
- ✅ **File:** `src/hooks/useRebooking.ts`
- ✅ **Hooks available:**
  - `useCanRebook(contractId)` - Checks rebooking eligibility
  - `useRebookingData(previousApplicationId)` - Fetches previous application data
  - `useMarkAsRebooking()` - Marks application as rebooking

## ❌ What's Missing (Frontend UI)

### 1. Contract Detail Page Integration
**Location:** `src/pages/ContractDetail.tsx`
- ❌ No rebooking check when viewing contract
- ❌ No UI to show "Rebook for this contract" option
- ❌ No prompt to use previous application data

### 2. Application Wizard Integration
**Location:** `src/pages/portal/ApplicationWizard.tsx`
- ❌ No check for `is_rebooking` flag
- ❌ No pre-filling of form data from previous application
- ❌ No UI indication that this is a rebooking

### 3. Student Portal Dashboard
**Location:** `src/pages/portal/Dashboard.tsx`
- ❌ No "Rebook for next year" section
- ❌ No list of available contracts for rebooking

## ⚠️ Important: Bug Fix Required

**File:** `supabase/migrations/20251118_fix_rebooking_user_id.sql`

The `can_student_rebook` function uses `user_id` but should use `student_id`. Run this migration to fix it.

## 🧪 How to Test (Current State)

### Option 1: Test via Database (After running bug fix)
You can manually test the database functions:

```sql
-- Check if a student can rebook
SELECT * FROM can_student_rebook(
  'student-user-id-here'::UUID,
  'contract-id-here'::UUID
);

-- Get rebooking data from previous application
SELECT * FROM get_rebooking_data(
  'previous-application-id-here'::UUID
);

-- Manually mark an application as rebooking
UPDATE student_applications
SET 
  is_rebooking = true,
  previous_application_id = 'previous-app-id'::UUID,
  rebooking_reason = 'Rebooking for next academic year'
WHERE id = 'new-application-id'::UUID;
```

### Option 2: Test via Supabase Dashboard
1. Go to Supabase Dashboard → SQL Editor
2. Run the functions above with real user/contract IDs
3. Check the `student_applications` table for rebooking fields

## 🚀 Implementation Plan

To make rebooking fully functional, we need to:

1. **Add rebooking check to ContractDetail page:**
   - When a logged-in student views a contract, check if they can rebook
   - Show a banner/button: "Rebook for this contract"
   - If they click it, create application and mark as rebooking

2. **Add rebooking data pre-fill to ApplicationWizard:**
   - On mount, check if `application.is_rebooking === true`
   - If yes, fetch previous application data using `useRebookingData`
   - Pre-fill form fields from previous application
   - Show a notice: "We've pre-filled your information from your previous application"

3. **Add rebooking section to Student Dashboard:**
   - Show available contracts for rebooking
   - Quick action to start rebooking process

## 📝 Notes

- The backend is **100% complete** and ready to use
- The hooks are **ready** but not integrated into any UI
- This is a **backend-first implementation** - frontend integration is pending
- The functionality will work once the UI is connected to the hooks

