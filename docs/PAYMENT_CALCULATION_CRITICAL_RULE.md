# ⚠️ CRITICAL RULE: Deposits Must Be Excluded from Installments

## The Problem We Fixed

**Issue**: The payment plan had a deposit entry in the `payment_plan_installments` table (sequence 1, label "Deposit"), and the frontend was **including it in the installments calculation**. This caused:

1. **Incorrect Sum**: Installments included the deposit, making the total wrong
2. **Double Counting**: Deposit was counted both as a deposit AND as an installment
3. **Wrong Last Installment**: The last-installment adjustment was based on the wrong sum

## Root Cause

The `payment_plan_installments` table can contain **both deposits and installments**. The frontend was processing ALL entries without filtering out deposits.

### Example of the Problem:

```
Payment Plan Installments:
- Sequence 1: "Deposit" (fixed £99) ❌ Should be excluded
- Sequence 2: "Instalment 1" (33.33% of remaining balance) ✅
- Sequence 3: "Instalment 2" (33.33% of remaining balance) ✅
- Sequence 4: "Instalment 3" (33.34% of remaining balance) ✅

Frontend was calculating:
- Sum = Deposit (£99) + Inst 1 + Inst 2 + Inst 3 = WRONG! ❌

Should be:
- Sum = Inst 1 + Inst 2 + Inst 3 = Remaining Balance ✅
```

## The Fix

**Location**: `src/hooks/useStudentPayments.ts`

**Solution**: Filter out deposits before calculating installments:

```typescript
// CRITICAL: Filter out deposits from installments
// Deposits are separate and should NOT be included in installment calculations
const installments = allInstallments.filter(inst => {
  const isDeposit = 
    inst.label?.toLowerCase().includes('deposit') ||
    (inst.sequence === 1 && inst.amount_type === 'fixed' && Number(inst.amount_value) === depositAmount);
  
  return !isDeposit;
});
```

## ⚠️ CRITICAL RULES - NEVER FORGET

### Rule 1: Deposits Are Separate from Installments
- **Deposits** are paid separately and tracked via `deposit_payment_intent_id`
- **Installments** are calculated from `Remaining Balance = Contract Total - Deposit`
- **NEVER** include deposits in installment calculations

### Rule 2: Always Filter Deposits
When processing `payment_plan_installments`:
1. ✅ Filter out entries where `label` contains "deposit" (case-insensitive)
2. ✅ Filter out sequence 1 if it's a fixed amount matching the deposit
3. ✅ Only process actual installments (percentage or fixed amounts for installments)

### Rule 3: Verify No Deposits in Schedule
After generating the payment schedule:
- ✅ Verify no deposits are in the final `generatedSchedule` array
- ✅ Log a warning/error if deposits are found
- ✅ The sum of installments should equal `Remaining Balance` (not Contract Total)

## Database Schema Context

### Why Deposits Can Be in `payment_plan_installments`:
- Some payment plans store deposits in the same table for convenience
- Seed data scripts may create deposit entries
- Bulk import may include deposits
- **BUT**: The frontend must always filter them out

### Correct Data Flow:

```
1. Get payment_plan_installments (may include deposits)
   ↓
2. Filter out deposits (label contains "deposit" OR sequence 1 + fixed + matches deposit)
   ↓
3. Calculate installments from remaining balance
   ↓
4. Apply last-installment adjustment
   ↓
5. Verify: Sum of installments = Remaining Balance (Contract Total - Deposit)
```

## Testing Checklist

When working with payment calculations, ALWAYS verify:

- [ ] Deposits are excluded from installments array
- [ ] Sum of installments = Remaining Balance (not Contract Total)
- [ ] Last installment is adjusted correctly
- [ ] No deposits appear in the payment schedule UI
- [ ] Database function `get_payment_summary` also excludes deposits (see migration `20251212_fix_deposit_in_remaining_balance.sql`)

## Related Files

- **Frontend**: `src/hooks/useStudentPayments.ts` (filters deposits)
- **Backend**: `supabase/migrations/20251212_fix_deposit_in_remaining_balance.sql` (excludes deposits from `total_due`)
- **Database Function**: `get_payment_summary()` (must exclude deposits from `total_due`)

## Debug Logging

The code includes debug logs to catch this issue:
- `🚫 [FILTERED OUT]` - Shows when deposits are filtered
- `✅ Verified: No deposits in installments schedule` - Confirms no deposits in final schedule
- `❌ ERROR: Deposit found in installments!` - Alerts if deposits slip through

## Never Do This Again

❌ **DON'T**: Process all `payment_plan_installments` entries without filtering
❌ **DON'T**: Include deposits in installment sum calculations
❌ **DON'T**: Assume sequence 1 is always an installment
❌ **DON'T**: Calculate installments from Contract Total (use Remaining Balance)

✅ **DO**: Always filter deposits before calculating installments
✅ **DO**: Verify no deposits in final schedule
✅ **DO**: Calculate installments from Remaining Balance (Contract Total - Deposit)
✅ **DO**: Test with payment plans that have deposits in the installments table

---

**Last Updated**: 2025-01-12
**Issue Fixed**: Deposit was included in installments calculation, causing incorrect sums
**Fix Applied**: Filter deposits from `payment_plan_installments` before processing

