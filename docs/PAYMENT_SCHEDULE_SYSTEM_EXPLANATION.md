# Payment Schedule System Explanation

## Two Different Systems

### 1. **`payment_plan_installments`** (Template/Configuration)
- **What it is**: A reusable TEMPLATE that defines HOW to calculate installments
- **Contains**: 
  - Percentages (e.g., 33.33%, 33.33%, 33.34%)
  - OR fixed amounts (e.g., £1,000, £1,000, £1,000)
  - Due date rules (offsets from contract start)
- **Purpose**: Defines the payment plan structure, not specific amounts
- **Example**:
  ```
  Payment Plan: "3 Instalments"
  - Instalment 1: 33.33% of remaining balance, due 0 days after contract start
  - Instalment 2: 33.33% of remaining balance, due 30 days after contract start
  - Instalment 3: 33.34% of remaining balance, due 60 days after contract start
  ```

### 2. **`contract_payment_schedule`** (Pre-Calculated Results)
- **What it is**: The ACTUAL calculated amounts for a SPECIFIC contract
- **Contains**:
  - Specific amounts (e.g., £3,041.70, £3,041.70, £3,042.60)
  - Specific due dates (e.g., 2024-09-01, 2024-10-01, 2024-11-01)
- **Purpose**: Stores the final payment schedule after calculation
- **Example**:
  ```
  Contract: "Rhodium Plus - Student ABC"
  - Deposit: £99.00, due 2024-09-01
  - Instalment 1: £3,041.70, due 2024-09-01
  - Instalment 2: £3,041.70, due 2024-10-01
  - Instalment 3: £3,042.60, due 2024-11-01
  ```

## When Each Is Used

### Frontend Logic (`useStudentPayments.ts`)

```typescript
// Step 1: Check if pre-calculated schedule exists
if (contract_payment_schedule exists) {
  // ✅ Use stored amounts directly (no calculation)
  return scheduleData;
}

// Step 2: If no schedule, calculate from template
if (payment_plan_installments exists) {
  // ✅ Calculate installments from template
  // - Get contract total
  // - Get deposit
  // - Calculate remaining balance = total - deposit
  // - Apply percentages to remaining balance
  // - Adjust last installment for rounding
  return calculatedSchedule;
}
```

## When Is `contract_payment_schedule` Created?

### Scenario 1: Seed Data / Bulk Import
- **When**: During `scripts/seed-data.mjs` execution
- **Why**: Pre-populate contracts with payment schedules
- **Result**: Schedule exists immediately

### Scenario 2: DocuSign Envelope Generation
- **When**: When application is confirmed and DocuSign envelope is created
- **Why**: Need actual amounts for the contract document
- **Result**: Schedule is created and stored in database
- **Location**: `supabase/functions/docusign-envelopes/index.ts` (line 681-725)

### Scenario 3: New Application (Before Confirmation)
- **When**: Student is viewing payment page before confirming
- **Why**: Need to show payment schedule preview
- **Result**: **NO schedule exists yet** → Frontend calculates from template

## Why "No Schedule" for New Application?

For a **new application** that hasn't been confirmed yet:
- ❌ No `contract_payment_schedule` exists (not created until DocuSign envelope generation)
- ✅ `payment_plan_installments` template exists (defines the plan structure)
- ✅ Frontend calculates installments from template using our new fix

**This is CORRECT behavior!** The schedule is created later when the contract is signed.

## The Fix We Applied

Our fix ensures that when the frontend **calculates from the template** (no schedule exists):
1. ✅ Deposit priority is correct (contract override > payment plan > grade override)
2. ✅ Remaining balance = Contract Total - Deposit
3. ✅ Installments are calculated from remaining balance (not total)
4. ✅ Last installment is adjusted to ensure exact sum
5. ✅ Proper currency rounding (2 decimals)

## Summary

| Situation | Schedule Exists? | What Frontend Does |
|-----------|------------------|-------------------|
| **New Application** (not confirmed) | ❌ No | ✅ Calculates from `payment_plan_installments` template (uses our fix) |
| **Confirmed Application** (DocuSign generated) | ✅ Yes | ✅ Uses stored `contract_payment_schedule` amounts (bypasses calculation) |
| **Bulk Import** | ✅ Yes | ✅ Uses stored `contract_payment_schedule` amounts (bypasses calculation) |

## For Your Test Application

Since it says "No Schedule", this means:
- ✅ The application hasn't been confirmed yet (or schedule was deleted)
- ✅ Frontend will calculate from `payment_plan_installments` template
- ✅ Our fix will be applied
- ✅ Installments should sum correctly to remaining balance

**This is the perfect scenario to test our fix!**

