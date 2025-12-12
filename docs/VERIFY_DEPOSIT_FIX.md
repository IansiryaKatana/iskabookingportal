# Verify Deposit Exclusion Fix

## Step 1: Verify the Function Was Updated

Run this SQL in Supabase SQL Editor to check if the function has the deposit exclusion:

```sql
-- Check the function definition
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'get_payment_summary';
```

Look for this line in the output:
```sql
AND LOWER(COALESCE(label, '')) NOT LIKE '%deposit%';
```

## Step 2: Test the Function Directly

Run this SQL with your application ID to see the raw results:

```sql
-- Replace 'YOUR_APPLICATION_ID' with the actual application ID
SELECT * FROM public.get_payment_summary('YOUR_APPLICATION_ID'::UUID);
```

Expected results:
- `total_due` should NOT include the deposit (should be £9,027.01, not £9,126.00)
- `remaining_balance` should be £0.00 when all installments are paid

## Step 3: Clear Frontend Cache

The frontend uses React Query which caches data for 30 seconds. To force a refresh:

1. **Hard Refresh**: Press `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. **Clear Browser Cache**: Open DevTools (F12) → Application → Clear Storage → Clear site data
3. **Wait 30 seconds**: The cache will automatically refresh after 30 seconds

## Step 4: Check Contract Payment Schedule

Verify the deposit is actually in the schedule:

```sql
-- Replace 'YOUR_CONTRACT_ID' with the actual contract ID
SELECT id, sequence, label, amount, due_date
FROM public.contract_payment_schedule
WHERE contract_id = 'YOUR_CONTRACT_ID'::UUID
ORDER BY sequence;
```

You should see:
- Sequence 1: "Deposit" with amount £99.00
- Sequence 2+: "Instalment X" with installment amounts

The function should now exclude the deposit row when summing.

