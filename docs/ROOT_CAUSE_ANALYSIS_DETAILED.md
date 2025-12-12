# Detailed Root Cause Analysis

## Problem Identified

**Current Situation:**
- Contract Total: £12,597.00
- Deposit: £99.00
- Expected Remaining Balance: £12,498.00
- **Actual Installments Sum: £12,398.99** ❌
- **Difference: £99.01** (almost exactly the deposit amount)

## Root Cause #1: Frontend Deposit Calculation Missing Priority

**Location**: `src/hooks/useStudentPayments.ts` line 92-99

**Current Code:**
```typescript
// Get deposit amount
const { data: paymentPlan } = await supabase
  .from("payment_plans")
  .select("deposit_amount")
  .eq("id", application.selected_payment_plan_id)
  .maybeSingle();

const depositAmount = paymentPlan?.deposit_amount || 0;
```

**Problem**: Only checks `payment_plans.deposit_amount`, but should follow priority:
1. `contract.deposit_override` (highest priority)
2. `payment_plans.deposit_amount`
3. `studio_grade_prices.deposit_amount_override` (lowest priority)

**Impact**: If contract has `deposit_override`, frontend uses wrong deposit amount, causing incorrect remaining balance calculation.

## Root Cause #2: JavaScript Floating-Point Precision

**Location**: `src/hooks/useStudentPayments.ts` line 122-166

**Issue**: When calculating installments:
- Inst 1: 33.33% × £12,498 = £4,165.58 (rounded)
- Inst 2: 33.33% × £12,498 = £4,165.58 (rounded)
- Sum of previous: £8,331.16
- Inst 3: £12,498.00 - £8,331.16 = £4,166.84

But if deposit is wrong:
- If deposit used is £0 (instead of £99):
  - Remaining Balance = £12,597 - £0 = £12,597
  - Inst 1: 33.33% × £12,597 = £4,199.00
  - Inst 2: 33.33% × £12,597 = £4,199.00
  - Sum: £8,398.00
  - Inst 3: £12,597 - £8,398 = £4,199.00
  - Total: £12,597 (wrong - includes deposit)

- If deposit is subtracted twice:
  - Remaining Balance = £12,597 - £99 - £99 = £12,399
  - Inst 1: 33.33% × £12,399 = £4,133.00
  - Inst 2: 33.33% × £12,399 = £4,133.00
  - Sum: £8,266.00
  - Inst 3: £12,399 - £8,266 = £4,133.00
  - Total: £12,399 (close to £12,398.99!)

## Root Cause #3: Contract Query Missing deposit_override

**Location**: `src/hooks/useStudentPayments.ts` line 59-75

**Current Query:**
```typescript
.select(`
  id,
  name,
  contract_start,
  contract_end,
  weeks,
  weekly_price_override,
  academic_year_id,
  studio_grade_id,
  studio_grade:studio_grades ( name )
`)
```

**Problem**: Missing `deposit_override` field! Even if we fix the deposit calculation, we can't use it because it's not being fetched.

## Solution

1. **Add `deposit_override` to contract query**
2. **Implement proper deposit priority logic** (match database function)
3. **Add `studio_grade_prices.deposit_amount_override` check**
4. **Ensure JavaScript rounding is correct** (use proper rounding functions)

