# Rebooking Feature Fix Summary

## Issue
User reported that rebooking options are not showing in the dashboard despite:
- Having confirmed applications for 2025/2026
- Contracts existing for 2026/2027
- SQL function `can_student_rebook` returning `can_rebook: true` when tested directly

## Root Causes Identified

### 1. Dashboard Query Limitations
**Problem**: The dashboard was fetching contracts with `.limit(5)`, which could exclude 2026/2027 contracts if they weren't in the first 5 results.

**Location**: `src/pages/portal/Dashboard.tsx` line 60

**Fix**: Removed the limit and added filter for future contracts only:
```typescript
.gte("contract_start", today) // Only future contracts
.order("contract_start", { ascending: true });
```

### 2. Missing Future Contract Filter
**Problem**: The dashboard was checking ALL active contracts, including past ones, which is inefficient and could cause confusion.

**Fix**: Added filter to only check contracts with `contract_start >= today`.

### 3. Insufficient Debugging
**Problem**: Limited console logging made it difficult to diagnose why rebooking options weren't showing.

**Fix**: Added comprehensive console logging in both:
- `src/pages/portal/Dashboard.tsx` - logs contract fetching and rebooking checks
- `src/pages/ContractDetail.tsx` - logs hook state and conditions

## Changes Made

### `src/pages/portal/Dashboard.tsx`
1. ✅ Removed `.limit(5)` restriction
2. ✅ Added `.gte("contract_start", today)` filter for future contracts only
3. ✅ Added detailed console logging for:
   - Number of contracts found
   - Each contract being checked
   - Rebooking check results
   - Final opportunities count

### `src/pages/ContractDetail.tsx`
1. ✅ Enhanced debug logging with clear section markers
2. ✅ Logs all conditions: user, contract, hook state, and visibility conditions

### `src/hooks/useRebooking.ts`
1. ✅ Added error logging for function calls
2. ✅ Added result logging to see what the function returns

## Testing Steps

1. **Dashboard Test**:
   - Log in as a student with a confirmed 2025/2026 application
   - Navigate to the dashboard
   - Open browser console (F12)
   - Look for logs starting with "Dashboard:"
   - Verify that:
     - Contracts are being fetched
     - Rebooking checks are being performed
     - Opportunities are being found

2. **Contract Detail Test**:
   - Navigate to a 2026/2027 contract detail page
   - Open browser console
   - Look for logs starting with "=== REBOOKING DEBUG ==="
   - Verify that:
     - User is logged in
     - Contract is loaded
     - Hook is enabled
     - Rebooking check returns `can_rebook: true`
     - Rebooking button/alert should be visible

## Expected Console Output

### Dashboard:
```
Dashboard: Found contracts for rebooking check: X [...]
Dashboard: Checking rebooking for contract: [contract-id] [contract-name]
Dashboard: Rebooking check result for [contract-name]: [{can_rebook: true, ...}]
Dashboard: Adding rebooking opportunity: [contract-name]
Dashboard: Total rebooking opportunities found: X
```

### Contract Detail:
```
=== REBOOKING DEBUG ===
User: Logged in [user-id]
Contract: Loaded [contract-id] [contract-name]
Hook enabled: true
Rebooking check result: {can_rebook: true, previous_application_id: "...", ...}
Is loading: false
Error: null
Can show rebooking: true
=======================
```

## Next Steps if Still Not Working

If rebooking options still don't appear after these fixes:

1. **Check Console Logs**: Look for the debug messages above to identify where the flow breaks
2. **Verify Contract Status**: Ensure 2026/2027 contracts have `is_active = true`
3. **Verify Contract Dates**: Ensure `contract_start >= today`
4. **Check RLS Policies**: Ensure the `can_student_rebook` function is accessible to authenticated users
5. **Test Function Directly**: Run the SQL function in Supabase SQL editor with the exact user_id and contract_id

## Notes

- The rebooking feature requires:
  - User to be logged in
  - A confirmed application for a previous academic year
  - An active contract for a future academic year
  - The future contract's `start_date` must be after the previous contract's `start_date`
- The function `can_student_rebook` must return:
  - `can_rebook: true`
  - `previous_application_id: [UUID]` (not null)

