# Bulk Upload Installment Calculation

## How Bulk Upload Calculates Installments

### 1. **Seed Data Script** (`scripts/seed-data.mjs`)

When you run the seed data script, it creates `contract_payment_schedule` entries:

```javascript
// Line 341-399
for (const contract of data) {
  // Delete existing schedule
  await supabase.from("contract_payment_schedule").delete().eq("contract_id", contract.id);

  // Calculate values
  const weeklyPrice = contract.weekly_price_override ?? 0;
  const totalRent = weeklyPrice * contract.weeks;
  const deposit = contract.deposit_override ?? 0;
  const remaining = Math.max(totalRent - deposit, 0);  // ✅ Correct: Remaining = Total - Deposit
  
  // Get payment plan config
  const planConfig = paymentPlans.find(plan => planIds[plan.key] === contract.payment_plan_id);
  const offsets = planConfig?.instalmentOffsets ?? [];

  // Create schedule
  const schedule = [];
  
  // Add deposit (if exists)
  if (deposit > 0) {
    schedule.push({
      contract_id: contract.id,
      sequence: 1,
      label: "Deposit",
      due_date: contract.contract_start,
      amount: deposit,
    });
  }

  // Add installments (calculated from remaining balance)
  if (remaining > 0 && offsets.length) {
    const count = offsets.length;
    let distributed = 0;
    offsets.forEach((offset, idx) => {
      let amount = remaining / count;  // ✅ Divide remaining balance, not total
      amount = currency(amount);  // Round to 2 decimals
      distributed += amount;

      // Last-installment adjustment
      if (idx === count - 1) {
        amount = currency(remaining - (distributed - amount));  // ✅ Adjust last to match exactly
      }

      schedule.push({
        contract_id: contract.id,
        sequence: schedule.length + 1,
        label: `Instalment ${idx + 1}`,
        due_date: dueDate.toISOString().slice(0, 10),
        amount,
      });
    });
  }

  // Insert schedule
  await supabase.from("contract_payment_schedule").insert(schedule);
}
```

### 2. **Bulk Import Functions** (`supabase/migrations/20251124_bulk_import_functions.sql`)

Bulk import functions **do NOT create payment schedules**. They only:
- Create contracts
- Create applications
- Link payment plans

**Payment schedules are created by:**
- Seed data script (for initial setup)
- DocuSign envelope generation (for new applications)
- Frontend calculation (when no schedule exists)

### 3. **How Frontend Handles Bulk Imported Applications**

For bulk imported applications:

1. **If `contract_payment_schedule` exists:**
   - ✅ Frontend uses stored amounts directly
   - ✅ No calculation needed
   - ⚠️ **Problem**: If schedule was created with old logic, amounts might be wrong

2. **If `contract_payment_schedule` doesn't exist:**
   - ✅ Frontend calculates from `payment_plan_installments` template
   - ✅ Uses new fix (last-installment adjustment)
   - ✅ Correct calculation

## The Problem with Bulk Upload

**Issue**: Seed data script creates schedules with **simple division** (not percentage-based):

```javascript
let amount = remaining / count;  // Simple division
```

This doesn't match the percentage-based calculation used by:
- Frontend (`useStudentPayments.ts`)
- Database function (`get_payment_summary`)
- DocuSign envelope generation

**Result**: 
- Bulk imported contracts have schedules with amounts from simple division
- These amounts might not match percentage-based calculations
- Can cause discrepancies

## Solution

### Option 1: Regenerate Schedules (Recommended)

Delete existing schedules and let frontend calculate:

```sql
-- Delete all schedules for contracts
DELETE FROM contract_payment_schedule;

-- Frontend will calculate from payment_plan_installments template
-- This ensures consistency with new calculation logic
```

### Option 2: Update Seed Data Script

Update `scripts/seed-data.mjs` to use percentage-based calculation:

```javascript
// Get payment plan installments
const { data: installments } = await supabase
  .from("payment_plan_installments")
  .select("*")
  .eq("payment_plan_id", contract.payment_plan_id)
  .order("sequence", { ascending: true });

// Calculate installments using percentages (matching frontend logic)
let distributed = 0;
installments.forEach((inst, idx) => {
  let amount = 0;
  if (inst.amount_type === "percentage") {
    amount = (remaining * inst.amount_value) / 100;
  } else if (inst.amount_type === "fixed") {
    amount = inst.amount_value;
  }
  
  // Last-installment adjustment
  if (idx === installments.length - 1) {
    amount = remaining - distributed;
  }
  
  distributed += amount;
  // ... add to schedule
});
```

## Recommendation

**For your current issue:**
1. ✅ Fix the `get_payment_summary` function to exclude deposits (migration created)
2. ✅ Test with a new application (no schedule exists, uses calculation)
3. ⚠️ For existing applications: Delete schedules to force recalculation

**For bulk upload going forward:**
- Option 1: Don't create schedules in seed data (let frontend calculate)
- Option 2: Update seed data to use percentage-based calculation matching frontend

