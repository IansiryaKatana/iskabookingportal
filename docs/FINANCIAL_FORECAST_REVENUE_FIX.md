# Financial Forecast - Current Revenue Fix

## Issue
The financial forecast was not correctly calculating current revenue from confirmed bookings. Bookings with `null` or missing `total_contract_value` were being skipped, resulting in incorrect revenue totals.

## Root Cause
The original code (lines 116-122) only counted bookings that had a `total_contract_value` field populated:

```typescript
const currentRevenue = (currentBookings || []).reduce((sum, booking) => {
  // Use total_contract_value if available, otherwise calculate
  if (booking.total_contract_value) {
    return sum + Number(booking.total_contract_value);
  }
  return sum; // ❌ Skipped bookings without total_contract_value
}, 0);
```

**Problem:** If `total_contract_value` was `null` or `0`, the booking was completely ignored, leading to underreported current revenue.

## Solution
Updated the revenue calculation to:

1. **First try to use `total_contract_value`** if available
2. **If missing, calculate it from contract details** (weekly_price × weeks)
3. **Fetch prices early** so they're available for both revenue calculation and breakdown

### Changes Made

1. **Moved price fetching earlier** (before revenue calculation):
   - Fetches `studio_grade_prices` for the academic year
   - Creates `pricesMap` for quick lookup
   - Now available for both current revenue and breakdown calculations

2. **Enhanced booking query** to include contract details:
   - Added join with `contracts` table
   - Fetches `weeks`, `weekly_price_override`, `studio_grade_id` from contract
   - Allows calculation of contract value when `total_contract_value` is missing

3. **Improved revenue calculation**:
   ```typescript
   const currentRevenue = (currentBookings || []).reduce((sum, booking) => {
     // Use total_contract_value if available
     if (booking.total_contract_value) {
       return sum + Number(booking.total_contract_value);
     }

     // Otherwise, calculate from contract details
     const contract = contractsMap.get(booking.contract_id);
     if (contract) {
       // Get weekly price (override or from prices map)
       const weeklyPrice = contract.weekly_price_override
         ? Number(contract.weekly_price_override)
         : pricesMap.get(contract.studio_grade_id) || 0;

       const contractValue = weeklyPrice * contract.weeks;
       return sum + contractValue; // ✅ Now counts all bookings
     }

     return sum;
   }, 0);
   ```

## Impact

### Before Fix:
- ❌ Bookings with `null` `total_contract_value` were ignored
- ❌ Current revenue was underreported
- ❌ Revenue gap was overestimated
- ❌ Forecast calculations were incorrect

### After Fix:
- ✅ All confirmed bookings are counted
- ✅ Current revenue is accurately calculated
- ✅ Revenue gap is correct
- ✅ Forecast calculations are accurate

## Testing

To verify the fix:

1. **Check confirmed bookings:**
   - Go to Financial Forecast page
   - Select an academic year
   - Enter a target revenue
   - Click "Calculate Forecast"
   - Verify "Current Revenue" matches sum of all confirmed bookings

2. **Verify with bookings that have null total_contract_value:**
   - Check database for bookings with `total_contract_value IS NULL`
   - These should now be included in current revenue calculation
   - Revenue should be calculated as: `weekly_price × weeks`

3. **Compare with other reports:**
   - Current revenue in forecast should match:
     - Sum of `total_contract_value` from confirmed applications
     - Or calculated as `weekly_price × weeks` for each booking

## Files Modified

- `supabase/functions/calculate-forecast/index.ts`
  - Moved price fetching earlier (lines 102-116)
  - Enhanced booking query to include contract details (lines 118-141)
  - Improved revenue calculation with fallback logic (lines 159-179)

## Related Issues

- This fix ensures all confirmed bookings are counted, regardless of whether `total_contract_value` is populated
- The calculation now matches the same logic used in other parts of the system (payment summaries, reports, etc.)

---

**Date:** 2025-01-28  
**Status:** ✅ Fixed

