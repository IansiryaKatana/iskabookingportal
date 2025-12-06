# Rebooking Feature Diagnosis & Recommendations

## Executive Summary

The rebooking feature is **fully implemented** in the codebase, but may not be showing because:
1. **No confirmed applications exist** - Students need at least one `status = 'confirmed'` application
2. **Academic year start_date comparison** - The function compares academic year `start_date` values to determine if rebooking is allowed
3. **Contract must be for a future academic year** - The new contract's academic year must have a `start_date` greater than the previous application's academic year `start_date`

## How Rebooking Works (From Documentation)

### Eligibility Requirements:
1. **Student must have a confirmed application** (`status = 'confirmed'`) for a previous academic year
2. **New contract must be for a future academic year** - The new contract's academic year `start_date` must be **greater than** the previous application's academic year `start_date`
3. **Contract must be active** (`is_active = true`)
4. **No existing rebooking** - Student cannot have an existing rebooking application for the same contract

### Database Function Logic (`can_student_rebook`):

```sql
-- Finds most recent confirmed application
SELECT sa.id, c.name, ay.name
FROM student_applications sa
INNER JOIN contracts c ON sa.contract_id = c.id
INNER JOIN academic_years ay ON c.academic_year_id = ay.id
WHERE sa.student_id = p_user_id
  AND sa.status = 'confirmed'
ORDER BY sa.created_at DESC
LIMIT 1;

-- Compares academic year start dates
IF v_new_year_start > v_current_year_start THEN
  -- Allow rebooking
END IF;
```

## Current Implementation Status

### ✅ Fully Implemented:
1. **Database Schema**:
   - `is_rebooking` (BOOLEAN)
   - `previous_application_id` (UUID)
   - `rebooking_reason` (TEXT)
   - `rebooking_approved_at` (TIMESTAMPTZ)
   - `rebooking_approved_by` (UUID)

2. **Database Functions**:
   - `can_student_rebook(p_user_id, p_contract_id)` - Checks eligibility
   - `get_rebooking_data(p_previous_application_id)` - Fetches previous application data

3. **Frontend Components**:
   - **ContractDetail.tsx**: Shows rebooking alert and "Rebook for This Contract" button
   - **ApplicationWizard.tsx**: Automatically pre-fills all 5 steps with previous data
   - **Dashboard.tsx**: Shows rebooking opportunities section

4. **React Hooks**:
   - `useCanRebook(contractId)` - Checks rebooking eligibility
   - `useRebookingData(previousApplicationId)` - Fetches previous application data
   - `useMarkAsRebooking()` - Marks application as rebooking

## Why Rebooking Might Not Be Showing

### Issue 1: No Confirmed Applications ⚠️ **MOST LIKELY**
**Problem**: Students need at least one confirmed application for rebooking to work.

**Check**:
```sql
SELECT 
  sa.id,
  sa.student_id,
  sa.status,
  c.name as contract_name,
  ay.name as academic_year,
  ay.start_date
FROM student_applications sa
INNER JOIN contracts c ON sa.contract_id = c.id
INNER JOIN academic_years ay ON c.academic_year_id = ay.id
WHERE sa.status = 'confirmed'
ORDER BY sa.created_at DESC;
```

**Solution**: 
- Ensure students have completed the full booking journey (deposit paid, signature completed, verification approved)
- Application status must be `'confirmed'` (not `'awaiting_deposit'`, `'awaiting_signature'`, etc.)

### Issue 2: Academic Year start_date Not Set Correctly ⚠️ **LIKELY**
**Problem**: The function compares `academic_years.start_date` to determine if a year is "future". If dates are not set correctly, rebooking won't work.

**Check**:
```sql
SELECT 
  id,
  name,
  start_date,
  end_date,
  is_active
FROM academic_years
ORDER BY start_date;
```

**Expected**:
- Academic years should have `start_date` values in chronological order
- Example:
  - 2025/26: `start_date = '2025-09-01'`
  - 2026/27: `start_date = '2026-09-01'` (must be > 2025-09-01)

**Solution**:
- Verify all academic years have `start_date` set correctly
- Ensure future years have later `start_date` values than past years

### Issue 3: Contracts Not Linked to Correct Academic Years ⚠️ **POSSIBLE**
**Problem**: Contracts must be linked to academic years via `contracts.academic_year_id`.

**Check**:
```sql
SELECT 
  c.id,
  c.name,
  c.is_active,
  ay.name as academic_year,
  ay.start_date
FROM contracts c
INNER JOIN academic_years ay ON c.academic_year_id = ay.id
WHERE c.is_active = true
ORDER BY ay.start_date, c.name;
```

**Solution**:
- Ensure all active contracts have `academic_year_id` set
- Verify contracts are linked to the correct academic years

### Issue 4: Same Academic Year ⚠️ **POSSIBLE**
**Problem**: If student's confirmed application is for the same academic year as the contract they're viewing, rebooking won't show (by design - prevents duplicate bookings for same year).

**Check**:
```sql
-- Check if student has confirmed app for same academic year as contract
SELECT 
  sa.id,
  sa.status,
  ay1.name as previous_year,
  ay1.start_date as previous_start,
  ay2.name as new_year,
  ay2.start_date as new_start
FROM student_applications sa
INNER JOIN contracts c1 ON sa.contract_id = c1.id
INNER JOIN academic_years ay1 ON c1.academic_year_id = ay1.id
CROSS JOIN contracts c2
INNER JOIN academic_years ay2 ON c2.academic_year_id = ay2.id
WHERE sa.student_id = '<student_user_id>'
  AND sa.status = 'confirmed'
  AND c2.id = '<contract_id>'
  AND ay1.id = ay2.id;  -- Same academic year
```

**Solution**: This is expected behavior - students cannot rebook for the same academic year.

### Issue 5: Function Returns `can_rebook = true` but `previous_application_id = null` ⚠️ **POSSIBLE**
**Problem**: The function returns `can_rebook = true` for first-time applications (no previous application), but the UI only shows rebooking if `previous_application_id` is not null.

**Check**: The function logic:
```sql
-- If no previous application, they can still apply (first time)
IF v_previous_app IS NULL THEN
  RETURN QUERY SELECT 
    true,
    NULL::UUID,  -- previous_application_id is NULL
    ...
    'First-time application'::TEXT;
  RETURN;
END IF;
```

**Solution**: This is correct - the UI correctly checks for `previous_application_id` to distinguish between first-time applications and rebookings.

## Diagnostic Queries

### Query 1: Check Student's Confirmed Applications
```sql
SELECT 
  sa.id,
  sa.student_id,
  sa.status,
  sa.created_at,
  c.name as contract_name,
  ay.name as academic_year,
  ay.start_date
FROM student_applications sa
INNER JOIN contracts c ON sa.contract_id = c.id
INNER JOIN academic_years ay ON c.academic_year_id = ay.id
WHERE sa.student_id = '<STUDENT_USER_ID>'
  AND sa.status = 'confirmed'
ORDER BY sa.created_at DESC;
```

### Query 2: Test Rebooking Function
```sql
SELECT * FROM can_student_rebook(
  '<STUDENT_USER_ID>'::UUID,
  '<CONTRACT_ID>'::UUID
);
```

### Query 3: Check Academic Years
```sql
SELECT 
  id,
  name,
  start_date,
  end_date,
  is_active,
  CASE 
    WHEN start_date > CURRENT_DATE THEN 'Future'
    WHEN start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE THEN 'Current'
    ELSE 'Past'
  END as year_status
FROM academic_years
ORDER BY start_date;
```

### Query 4: Check Active Contracts by Academic Year
```sql
SELECT 
  ay.name as academic_year,
  ay.start_date,
  COUNT(c.id) as contract_count,
  STRING_AGG(c.name, ', ') as contract_names
FROM academic_years ay
LEFT JOIN contracts c ON c.academic_year_id = ay.id AND c.is_active = true
WHERE ay.is_active = true
GROUP BY ay.id, ay.name, ay.start_date
ORDER BY ay.start_date;
```

## Critical Issue Found: NULL Handling in Function ⚠️

**Problem**: The function doesn't handle NULL `start_date` values. If an academic year has `start_date = NULL`, the comparison `v_new_year_start > v_current_year_start` will fail or return unexpected results.

**Location**: `supabase/migrations/20251118_fix_rebooking_user_id.sql` lines 86-93

**Current Code**:
```sql
SELECT start_date INTO v_current_year_start
FROM public.academic_years
WHERE id = v_current_contract_year_id;

SELECT start_date INTO v_new_year_start
FROM public.academic_years
WHERE id = v_new_contract_year_id;

-- If new contract is for a future year, allow rebooking
IF v_new_year_start > v_current_year_start THEN
```

**Issue**: If either `start_date` is NULL, the comparison will not work as expected.

**Recommendation**: Add NULL checks before comparison:
```sql
-- Get academic year start dates
SELECT start_date INTO v_current_year_start
FROM public.academic_years
WHERE id = v_current_contract_year_id;

SELECT start_date INTO v_new_year_start
FROM public.academic_years
WHERE id = v_new_contract_year_id;

-- Check for NULL values
IF v_current_year_start IS NULL OR v_new_year_start IS NULL THEN
  RETURN QUERY SELECT 
    false,
    v_previous_app,
    v_contract_name,
    v_academic_year,
    'Academic year dates are not configured correctly. Please contact support.'::TEXT;
  RETURN;
END IF;

-- If new contract is for a future year, allow rebooking
IF v_new_year_start > v_current_year_start THEN
```

## Recommendations

### Immediate Actions:

1. **Verify Academic Year Setup**:
   - Check that all academic years have `start_date` set correctly
   - Ensure dates are in chronological order (later years have later start dates)
   - Verify at least 2 academic years exist with `is_active = true`

2. **Check for Confirmed Applications**:
   - Verify students have at least one application with `status = 'confirmed'`
   - If no confirmed applications exist, complete a full booking journey (deposit + signature + verification)

3. **Test the Function Directly**:
   - Use Query 2 above to test `can_student_rebook` with a real student ID and contract ID
   - Check the return values: `can_rebook`, `previous_application_id`, `message`

4. **Check Browser Console**:
   - Open browser DevTools → Console
   - Navigate to a contract detail page
   - Look for errors from `can_student_rebook` function call
   - Check the `rebookingCheck` object in React DevTools

### Code Review Findings:

1. **ContractDetail.tsx** (Line 636):
   - ✅ Correctly checks: `rebookingCheck?.can_rebook && rebookingCheck.previous_application_id`
   - This ensures only actual rebookings (not first-time applications) show the banner

2. **Dashboard.tsx** (Line 81):
   - ✅ Correctly checks: `rebookingCheck?.[0]?.can_rebook && rebookingCheck[0].previous_application_id`
   - Only shows rebooking opportunities when there's a previous application

3. **Database Function** (`can_student_rebook`):
   - ✅ Uses `student_id` (correct - fixed in migration `20251118_fix_rebooking_user_id.sql`)
   - ✅ Compares `start_date` values correctly
   - ✅ Returns `previous_application_id = NULL` for first-time applications (correct)

### Potential Issues:

1. **Academic Year Dates Not Set**:
   - If `start_date` is NULL or not set, the comparison `v_new_year_start > v_current_year_start` will fail
   - **Fix**: Ensure all academic years have valid `start_date` values

2. **Contracts Not Active**:
   - If contracts have `is_active = false`, they won't appear in the dashboard query
   - **Fix**: Ensure contracts for future academic years are marked as `is_active = true`

3. **RLS Policies**:
   - If RLS policies block access to `student_applications` or `contracts`, the function might fail silently
   - **Fix**: Verify RLS policies allow students to read their own applications

## Testing Checklist

- [ ] At least 2 academic years exist with `is_active = true`
- [ ] Academic years have `start_date` set correctly (future year > past year)
- [ ] At least one student has a `status = 'confirmed'` application
- [ ] The confirmed application is for an academic year with earlier `start_date` than future contracts
- [ ] Active contracts exist for future academic years
- [ ] `can_student_rebook` function returns correct values when tested directly
- [ ] Browser console shows no errors when viewing contract detail page
- [ ] `rebookingCheck` object in React DevTools shows `can_rebook: true` and `previous_application_id: <uuid>`

## Next Steps

1. **Run Diagnostic Queries** above to identify the specific issue
2. **Check Academic Year Setup** - Verify dates are set correctly
3. **Create Test Data** if needed:
   - Create a confirmed application for a student
   - Ensure it's for an academic year with earlier `start_date` than future contracts
4. **Test Function Directly** using Query 2
5. **Check Browser Console** for errors
6. **Verify RLS Policies** allow function execution

## Expected Behavior

When working correctly:
- Student with confirmed application for 2025/26 views contract for 2026/27
- Function returns: `can_rebook: true`, `previous_application_id: <uuid>`, `message: "You can rebook for 2026/27..."`
- ContractDetail page shows: "Rebooking Available" alert and "Rebook for This Contract" button
- Dashboard shows: "Rebooking Available! 🎉" banner with available contracts
- Clicking "Rebook" creates application with `is_rebooking = true` and pre-fills all form steps

