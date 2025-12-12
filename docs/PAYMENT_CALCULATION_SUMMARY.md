# Payment Calculation System - Complete Summary

## Overview

This document provides a complete summary of the payment calculation system, including all critical rules and fixes.

## Core Calculation Formula

```
Contract Total = weekly_price × weeks
Deposit = contract.deposit_override OR payment_plan.deposit_amount OR studio_grade_prices.deposit_amount_override
Remaining Balance = Contract Total - Deposit
Installments = Calculated from Remaining Balance (NOT Contract Total)
Last Installment = Remaining Balance - Sum of Previous Installments (adjustment for rounding)
```

## ⚠️ CRITICAL RULES

### Rule 1: Deposits Are Separate from Installments
- **NEVER** include deposits in installment calculations
- Deposits are tracked separately via `deposit_payment_intent_id`
- Always filter deposits from `payment_plan_installments` before processing

### Rule 2: Always Filter Deposits
When processing `payment_plan_installments`:
```typescript
const installments = allInstallments.filter(inst => {
  const isDeposit = 
    inst.label?.toLowerCase().includes('deposit') ||
    (inst.sequence === 1 && inst.amount_type === 'fixed' && Number(inst.amount_value) === depositAmount);
  return !isDeposit;
});
```

### Rule 3: Calculate from Remaining Balance
- Installments are calculated from **Remaining Balance** (Contract Total - Deposit)
- NOT from Contract Total
- This ensures installments + deposit = Contract Total

### Rule 4: Last-Installment Adjustment
- Last installment absorbs rounding differences
- Formula: `Last Installment = Remaining Balance - Sum of Previous Installments`
- Ensures installments sum exactly to Remaining Balance

## File Locations

### Frontend
- **`src/hooks/useStudentPayments.ts`**: Main calculation hook
  - Filters deposits from `payment_plan_installments`
  - Calculates installments from remaining balance
  - Applies last-installment adjustment
  - Includes debug logging

- **`src/pages/portal/Payments.tsx`**: Payment page UI
  - Displays payment summary
  - Shows debug info in development mode
  - Calculates contract total and deposit

### Backend
- **`supabase/migrations/20251212_fix_deposit_in_remaining_balance.sql`**: Database function fix
  - Excludes deposits from `total_due` calculation
  - Ensures only installments are counted

- **`supabase/migrations/20251212_fix_last_installment_adjustment_in_function.sql`**: Last-installment adjustment in database
  - Matches frontend logic
  - Ensures `total_due` equals remaining balance exactly

## Common Issues and Fixes

### Issue 1: Deposit Included in Installments
**Symptom**: Installments sum includes deposit, causing incorrect totals
**Fix**: Filter deposits before calculating installments (see Rule 2)

### Issue 2: Installments Calculated from Contract Total
**Symptom**: Installments are too large, don't account for deposit
**Fix**: Calculate from Remaining Balance (Contract Total - Deposit)

### Issue 3: Rounding Errors
**Symptom**: Installments don't sum exactly to remaining balance
**Fix**: Apply last-installment adjustment (see Rule 4)

### Issue 4: Remaining Balance Not Zero When Paid
**Symptom**: Shows remaining balance even when all payments made
**Fix**: Ensure deposits excluded from `total_due`, only count installment payments in `total_paid`

## Testing Checklist

When working with payment calculations:

- [ ] Deposits are filtered from installments array
- [ ] Installments calculated from Remaining Balance (not Contract Total)
- [ ] Last installment is adjusted correctly
- [ ] Sum of installments = Remaining Balance exactly
- [ ] No deposits in payment schedule UI
- [ ] Database function excludes deposits from `total_due`
- [ ] Remaining balance = 0 when all installments paid
- [ ] Debug logs show correct values

## Related Documentation

- [`PAYMENT_CALCULATION_CRITICAL_RULE.md`](./PAYMENT_CALCULATION_CRITICAL_RULE.md) - Detailed explanation of deposit filtering
- [`PAYMENT_CALCULATION_EXPLANATION.md`](./PAYMENT_CALCULATION_EXPLANATION.md) - Calculation examples
- [`PAYMENT_SCHEDULE_SYSTEM_EXPLANATION.md`](./PAYMENT_SCHEDULE_SYSTEM_EXPLANATION.md) - How schedules work

## History

- **2025-01-12**: Fixed deposit inclusion in installments calculation
- **2025-01-25**: Implemented last-installment adjustment
- **2025-01-25**: Aligned frontend and backend calculations

---

**Last Updated**: 2025-01-12
**Status**: ✅ All fixes applied and documented

