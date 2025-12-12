# Payment Calculation Misalignment Analysis

## ✅ Documented Calculation Flow (CORRECT)

Based on your specs and documentation:

1. **Contract Total** = `weekly_price × weeks`
   - Example: 45 weeks × £205/week = **£9,225**

2. **Deposit** = `payment_plan.deposit_amount` (or override)
   - Example: **£99**

3. **Remaining Balance** = Contract Total - Deposit
   - Example: £9,225 - £99 = **£9,126**

4. **Installments** = Remaining Balance × percentage
   - Example: 3 installments at 33.33% each
   - Inst 1: £9,126 × 33.33% = £3,041.6958
   - Inst 2: £9,126 × 33.33% = £3,041.6958
   - Inst 3: £9,126 × 33.33% = £3,041.6958
   - **Sum**: £9,125.0874 ❌ (doesn't equal £9,126)

## ⚠️ The Misalignment

### Frontend Logic (useStudentPayments.ts - Line 166)
```typescript
// Last installment absorbs rounding difference
generatedSchedule[lastIndex].amount = remainingBalance - sumOfPrevious;
```
- ✅ Applies last-installment adjustment
- ✅ Ensures installments sum exactly to remaining balance (£9,126)
- ✅ Actual payments created: £9,027.01 (with adjustment)

### Database Function Logic (get_payment_summary)
```sql
SELECT COALESCE(SUM(
  CASE 
    WHEN amount_type = 'percentage' THEN (v_remaining_balance * amount_value / 100)
    ...
  END
), 0)
INTO v_total_due
FROM public.payment_plan_installments
WHERE ... AND LOWER(COALESCE(label, '')) NOT LIKE '%deposit%';
```
- ❌ Calculates from percentages WITHOUT last-installment adjustment
- ❌ Result: £9,125.0874 (doesn't match actual payments)
- ❌ Causes remaining_balance = £98.0774 instead of £0.00

## 🔍 Root Cause

**The database function doesn't apply the same last-installment adjustment that the frontend does.**

When calculating from `payment_plan_installments`:
- Frontend: Calculates all installments, then adjusts last one to sum exactly to remaining balance
- Database: Sums all percentage calculations directly (no adjustment)

This creates a mismatch:
- Function says: `total_due = £9,125.0874`
- Actual payments: `£9,027.01` (with frontend adjustment)
- Difference: `£98.0774`

## 💡 Solution Options

### Option 1: Apply Last-Installment Adjustment in Database Function ✅ RECOMMENDED

**Approach**: Make the database function apply the same last-installment adjustment logic as the frontend.

**Logic**:
```sql
-- Calculate all installments
-- Then adjust last installment: remaining_balance - sum_of_previous
```

**Pros**:
- ✅ Aligns database function with frontend logic
- ✅ Ensures total_due matches actual payments
- ✅ No changes to payment processing
- ✅ Maintains documented calculation flow

**Cons**:
- ⚠️ Need to identify which installment is "last" (exclude deposit, then last installment)
- ⚠️ More complex SQL logic

### Option 2: Use contract_payment_schedule When Available ✅

**Approach**: Generate `contract_payment_schedule` when application is confirmed, with last-installment adjustment already applied.

**Pros**:
- ✅ Single source of truth
- ✅ Database function just sums the schedule
- ✅ No calculation needed

**Cons**:
- ⚠️ Requires generating schedule for all applications
- ⚠️ Need to handle when schedule doesn't exist

### Option 3: Increase Tolerance (QUICK FIX) ⚠️

**Approach**: Increase tolerance from £1.00 to cover the discrepancy.

**Pros**:
- ✅ Minimal code changes
- ✅ Quick fix

**Cons**:
- ❌ Masks the real problem
- ❌ Not a proper solution

## 🎯 Recommended Solution

**Apply last-installment adjustment in the database function** (Option 1)

This ensures:
1. Database function calculates same way as frontend
2. `total_due` matches actual payments
3. `remaining_balance` = £0.00 when all paid
4. No changes to payment processing logic

## Implementation

The function should:
1. Calculate remaining balance = Contract Total - Deposit
2. Get all installments (excluding deposit) from `payment_plan_installments`
3. Calculate each installment amount from percentages
4. **Apply last-installment adjustment**: Last installment = Remaining Balance - Sum of Previous
5. Sum all adjusted amounts for `total_due`

This matches exactly what the frontend does in `useStudentPayments.ts` line 166.

