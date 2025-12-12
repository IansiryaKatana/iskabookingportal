# Root Cause Analysis: Payment Calculation Discrepancy

## Issue Summary
For new bulk-imported applications:
- **Total Due**: Shows £12,498.00 (should be £12,399.00 - remaining balance after deposit)
- **Remaining Balance**: Shows £12,498.00 (should be £12,399.00)
- **Installments Sum**: £12,398.99 (should be £12,399.00 - £0.01 rounding error)

## Root Causes Identified

### 1. `get_payment_summary` Function Issue
**Problem**: The function may be using a `contract_payment_schedule` that was created with old logic or includes errors, causing `v_total_due` to be set incorrectly.

**Fix Applied**: Added validation check (line 133-136 in migration):
```sql
-- CRITICAL FIX: If schedule sum doesn't match remaining_balance, use remaining_balance
IF v_total_due IS NULL OR v_total_due = 0 OR ABS(v_total_due - v_remaining_balance) > v_tolerance THEN
  v_total_due := v_remaining_balance;
END IF;
```

### 2. Frontend Last-Installment Adjustment Rounding
**Problem**: The frontend calculation may have a rounding issue causing installments to sum to £12,398.99 instead of £12,399.00.

**Location**: `src/hooks/useStudentPayments.ts` line 166
```typescript
generatedSchedule[lastIndex].amount = remainingBalance - sumOfPrevious;
```

**Potential Issue**: JavaScript floating-point arithmetic may cause rounding errors when summing previous installments.

## Solutions

### Solution 1: Database Function Fix ✅
Migration: `20251212_fix_total_due_calculation_final.sql`
- Ensures `v_total_due` always equals `v_remaining_balance`
- Validates schedule sums against remaining balance
- Falls back to `remaining_balance` if schedule is incorrect

### Solution 2: Frontend Rounding Fix (Needed)
Need to ensure the frontend calculation uses proper rounding to avoid floating-point errors.

## Next Steps

1. **Deploy Database Migration**: Run `20251212_fix_total_due_calculation_final.sql`
2. **Test Function**: Verify `get_payment_summary` returns correct `total_due`
3. **Fix Frontend Rounding**: Update `useStudentPayments.ts` to use proper rounding
4. **Test New Application**: Create a new application and verify all calculations

