# Payment Calculation Discrepancy Analysis

## Problem Statement

When all installments and deposit are paid, there's a small remaining balance (e.g., £0.81) even though all payments show as "Paid". The Total Due shows £7,956.00 but the sum of actual payments is slightly less.

## ⚠️ CRITICAL FINDING: Decimal Precision Issue

**YES, you are absolutely correct!** The rounding errors are occurring because:

1. **Database columns use only 2 decimal places**: `NUMERIC(10,2)`
   - `contract_payment_schedule.amount`: `numeric(10,2)`
   - `payment_plan_installments.amount_value`: `numeric(10,2)` 
   - `stripe_payments.amount`: `numeric(10,2)`
   - All amount columns: `numeric(10,2)`

2. **Percentage values stored with only 2 decimals**: 
   - Example: 33.33% instead of 33.3333...%
   - When you calculate: `(£7,857 × 33.33) / 100 = £2,619.3381`
   - Stored/rounded to: £2,619.34 (or £2,619.33 depending on rounding)
   - **3 installments**: £2,619.34 × 3 = £7,858.02 ❌ (over by £1.02)
   - **OR**: £2,619.33 × 3 = £7,857.99 ❌ (under by £0.99)

3. **Intermediate calculations are rounded at each step**:
   - `currency()` function: `Math.round((amount + Number.EPSILON) * 100) / 100`
   - Each installment calculation rounds to 2 decimals
   - Rounding errors accumulate across multiple installments

4. **The exact problem**:
   - Remaining Balance: £7,857.00
   - 3 installments at 33.33% each:
     - Inst 1: £7,857 × 33.33% = £2,619.3381 → £2,619.34
     - Inst 2: £7,857 × 33.33% = £2,619.3381 → £2,619.34
     - Inst 3: £7,857 × 33.33% = £2,619.3381 → £2,619.34
     - **Sum**: £7,858.02 (over by £1.02)
   - **OR** if rounding down:
     - Inst 1-3: £2,619.33 each
     - **Sum**: £7,857.99 (under by £0.99)

## Root Cause Analysis

### Current System Architecture

The system has **TWO different calculation paths** that can produce different results:

#### Path A: `contract_payment_schedule` (Pre-generated Schedule)
- **Location**: `scripts/seed-data.mjs` (lines 367-390)
- **Logic**: 
  ```javascript
  let amount = remaining / count;  // Divide equally
  amount = currency(amount);       // Round to 2 decimals
  distributed += amount;
  
  // Last installment absorbs rounding difference
  if (idx === count - 1) {
    amount = currency(remaining - (distributed - amount));
  }
  ```
- **Result**: Rounded amounts that **sum exactly** to remaining balance
- **Used by**: `get_payment_summary()` when schedule exists (line 106-109)

#### Path B: `payment_plan_installments` (Percentage-based Calculation)
- **Location**: `src/hooks/useStudentPayments.ts` (lines 119-121)
- **Logic**:
  ```typescript
  if (inst.amount_type === "percentage") {
    amount = (remainingBalance * Number(inst.amount_value)) / 100;
  }
  ```
- **Result**: Each installment calculated independently, **no rounding compensation**
- **Used by**: Payment UI when displaying amounts, actual payment processing

### The Discrepancy Source

**Scenario**: 4-installment plan with 25% each
- Remaining Balance: £7,857.00
- Expected: 4 × £1,964.25 = £7,857.00 ✅
- **BUT** if percentages are 33.33%, 33.33%, 33.33% (for 3 installments):
  - Installment 1: 33.33% × £7,857 = £2,619.33
  - Installment 2: 33.33% × £7,857 = £2,619.33  
  - Installment 3: 33.33% × £7,857 = £2,619.33
  - **Total**: £7,857.99 ❌ (0.01% over, or missing if only 99.99%)

**The Real Issue**:
1. `contract_payment_schedule` has rounded amounts summing to exactly £7,857.00
2. `get_payment_summary()` uses `SUM(amount)` from schedule → £7,857.00
3. But actual payments are calculated from `payment_plan_installments` percentages
4. If percentages don't sum to exactly 100%, or rounding occurs differently, there's a mismatch
5. The last installment should absorb the difference, but it's calculated the same way as others

### Current Tolerance Logic

```sql
v_tolerance NUMERIC := 0.01; -- £0.01 tolerance
IF ABS(v_total_due_after_cashback - v_total_paid) <= v_tolerance AND v_total_paid > 0 THEN
  v_remaining_balance := 0;
END IF;
```

**Problem**: Tolerance is only £0.01, but discrepancies can be larger (£0.81 in your case).

## Options to Fix

### Option 0: Increase Decimal Precision (ROOT CAUSE FIX) ✅✅✅ **RECOMMENDED**

**Approach**: Increase database precision from `NUMERIC(10,2)` to `NUMERIC(12,4)` or `NUMERIC(15,4)`

**Why This Works**:
- Stores amounts with 4 decimal places during calculations
- Only rounds to 2 decimals for display/final storage
- Prevents rounding errors from accumulating
- More accurate percentage calculations

**Example**:
- Current: `33.33% × £7,857 = £2,619.3381` → stored as `£2,619.34` (rounded)
- With 4 decimals: `33.33% × £7,857 = £2,619.3381` → stored as `£2,619.3381` (no rounding)
- Final display: Round to 2 decimals only when showing to user

**Pros**:
- ✅ Fixes root cause, not symptoms
- ✅ More accurate calculations
- ✅ Prevents future rounding errors
- ✅ Industry standard (most financial systems use 4+ decimals internally)
- ✅ Can combine with last-installment adjustment for perfect accuracy

**Cons**:
- ⚠️ Requires database migration (ALTER TABLE)
- ⚠️ Need to update all amount columns
- ⚠️ Need to ensure calculations use full precision
- ⚠️ Display logic must round to 2 decimals for users

**Implementation**:
```sql
-- Migration to increase precision
ALTER TABLE contract_payment_schedule 
  ALTER COLUMN amount TYPE NUMERIC(12,4);

ALTER TABLE payment_plan_installments 
  ALTER COLUMN amount_value TYPE NUMERIC(12,4);

ALTER TABLE stripe_payments 
  ALTER COLUMN amount TYPE NUMERIC(12,4);

-- Keep display at 2 decimals, but calculations use 4
```

**Combined with**: Option 2 (last-installment adjustment) for perfect accuracy

---

### Option 1: Increase Tolerance (QUICK FIX) ⚠️
**Approach**: Increase tolerance to £1.00 or £2.00

**Pros**:
- ✅ Minimal code changes
- ✅ No risk to existing functionality
- ✅ Handles rounding errors up to £2

**Cons**:
- ⚠️ Masks the real problem
- ⚠️ Could hide legitimate small balances
- ⚠️ Not a proper fix, just a workaround

**Implementation**:
```sql
v_tolerance NUMERIC := 2.00; -- £2.00 tolerance for rounding
```

---

### Option 2: Ensure Last Installment Absorbs Difference (RECOMMENDED) ✅
**Approach**: When calculating from `payment_plan_installments`, make the last installment = remaining balance - sum of previous installments

**Pros**:
- ✅ Fixes root cause
- ✅ Ensures installments always sum to exactly remaining balance
- ✅ Works for both percentage and fixed amounts
- ✅ No changes to database schema

**Cons**:
- ⚠️ Requires changes in multiple places:
  - `useStudentPayments.ts` (frontend calculation)
  - `get_payment_summary()` (database function)
  - `docusign-envelopes` (edge function)
  - Any other place that calculates installments

**Implementation Locations**:
1. `src/hooks/useStudentPayments.ts` - Line 116-155
2. `supabase/migrations/20250125_align_all_payment_calculations.sql` - Line 126-135
3. `supabase/functions/docusign-envelopes/index.ts` - Line 694-706

**Logic**:
```typescript
// Calculate all installments
const installments = installments.map((inst, idx) => {
  let amount = calculateAmount(inst, remainingBalance);
  // ... other fields
  return { amount, ... };
});

// Adjust last installment to absorb rounding
const lastIndex = installments.length - 1;
const sumOfPrevious = installments.slice(0, lastIndex).reduce((sum, i) => sum + i.amount, 0);
installments[lastIndex].amount = remainingBalance - sumOfPrevious;
```

---

### Option 3: Always Use `contract_payment_schedule` (CONSISTENT SOURCE) ✅
**Approach**: Ensure all calculations use `contract_payment_schedule` amounts, not recalculate from percentages

**Pros**:
- ✅ Single source of truth
- ✅ Consistent amounts everywhere
- ✅ No rounding discrepancies

**Cons**:
- ⚠️ Requires generating schedule for ALL contracts (including Pay in Full)
- ⚠️ Schedule must be kept in sync with payment plan changes
- ⚠️ More database writes

**Implementation**:
- Generate `contract_payment_schedule` when application is confirmed
- Always use schedule amounts, never recalculate from percentages
- Update schedule if payment plan changes

---

### Option 4: Store Calculated Amounts in `contract_payment_schedule` (HYBRID) ✅
**Approach**: When application is confirmed, calculate installments with last-installment adjustment and store in `contract_payment_schedule`

**Pros**:
- ✅ Single source of truth (schedule)
- ✅ Ensures exact amounts
- ✅ No recalculation needed
- ✅ Works for all payment plan types

**Cons**:
- ⚠️ Requires generating schedule on application confirmation
- ⚠️ Need to handle schedule updates if payment plan changes

**Implementation**:
- Create/update `contract_payment_schedule` when application status → `confirmed`
- Use Option 2 logic to ensure last installment absorbs difference
- Store the adjusted amounts in database
- All queries use schedule amounts

---

### Option 5: Fix Percentage Sums to Exactly 100% (PREVENTION) ✅
**Approach**: When creating payment plans, ensure percentages sum to exactly 100%, and use exact division for equal installments

**Pros**:
- ✅ Prevents issue at source
- ✅ No calculation changes needed
- ✅ Cleaner data

**Cons**:
- ⚠️ Doesn't fix existing discrepancies
- ⚠️ Still need Option 2 for last-installment adjustment
- ⚠️ Requires validation in payment plan creation

**Implementation**:
- Add validation: `SUM(amount_value) = 100` for percentage-based plans
- For equal installments, use exact division: `100 / count` (e.g., 33.333...%)
- Store as decimal with sufficient precision

---

## Recommended Solution: Combination Approach

### Phase 1: Immediate Fix (Option 2 + Option 1)
1. **Implement last-installment adjustment** in all calculation locations
2. **Increase tolerance** to £2.00 as safety net
3. **Test thoroughly** with existing applications

### Phase 2: Long-term Fix (Option 4)
1. **Generate `contract_payment_schedule`** on application confirmation
2. **Use schedule as single source of truth** for all calculations
3. **Remove percentage-based calculations** from payment processing

### Phase 3: Prevention (Option 5)
1. **Add validation** to payment plan creation
2. **Ensure percentages sum to 100%**
3. **Use exact division** for equal installments

## Impact Assessment

### Risk Level: LOW-MEDIUM
- ✅ No data loss risk
- ✅ No breaking changes to payment processing
- ✅ Only affects calculation/display logic
- ⚠️ Need to test with existing applications
- ⚠️ Need to handle edge cases (cashback, partial payments)

### Testing Required
1. Test with 3, 4, 5, 10 installment plans
2. Test with percentage and fixed amounts
3. Test with cashback applied
4. Test with existing applications that have discrepancies
5. Verify remaining balance = 0 when all paid

## Questions to Answer Before Implementation

1. **Do you want to fix existing discrepancies?**
   - Option: One-time data migration to adjust existing schedules
   - Option: Leave existing, only fix new calculations

2. **Should we generate schedules for all contracts?**
   - Currently only seed-data generates schedules
   - Should we generate on application confirmation?

3. **What's the maximum acceptable discrepancy?**
   - Current: £0.01 tolerance
   - Proposed: £2.00 tolerance (safety net)
   - Or: Zero tolerance (must fix calculation)

4. **How should we handle cashback?**
   - Currently reduces final installment
   - Should this be recalculated or stored?

## Next Steps

1. **Review this analysis** and confirm understanding
2. **Choose preferred option(s)** from above
3. **Answer questions** about existing data and preferences
4. **Create implementation plan** with specific code changes
5. **Test thoroughly** before deploying

