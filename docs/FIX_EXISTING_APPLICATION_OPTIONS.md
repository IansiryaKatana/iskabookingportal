# Fix Options for Existing Application

## The Problem

If a `contract_payment_schedule` exists for a contract, the frontend **bypasses the calculation** and uses the schedule amounts directly (see `useStudentPayments.ts` line 52-54).

This means:
- ✅ The fix works for **new applications** (no schedule exists)
- ❌ **Existing applications** with schedules will still show old amounts

## Solution Options

### Option 1: Delete Schedule for Existing Contract (Recommended for Testing)
This will force the frontend to calculate with the new logic:

```sql
-- Find the contract ID first
SELECT id, name FROM contracts WHERE name LIKE '%Rhodium Plus%';

-- Delete the schedule (replace CONTRACT_ID)
DELETE FROM contract_payment_schedule 
WHERE contract_id = 'CONTRACT_ID'::UUID;
```

**After deletion:**
- Frontend will calculate installments with the new fix
- Installments will sum correctly to remaining balance
- Last-installment adjustment will work

### Option 2: Update Schedule with Correct Amounts
Recalculate and update the schedule:

```sql
-- This would require a script to recalculate all installments
-- Not recommended - better to delete and let frontend calculate
```

### Option 3: Test with New Application (Recommended)
Create a brand new application:
- No schedule will exist
- Frontend will calculate with new logic
- Will verify the fix works correctly

## Recommendation

**Test with a new application first** to verify the fix works. Then, if needed, delete the schedule for existing applications to apply the fix.

