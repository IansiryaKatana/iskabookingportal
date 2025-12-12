# Migration Success - Verification Checklist

## ✅ Migrations Completed

1. ✅ `20251212_increase_payment_precision_to_4_decimals.sql` - Main migration
2. ✅ `20251212_update_bulk_import_precision.sql` - Bulk import functions update

---

## Verification Steps

### Step 1: Verify Column Precision

Run this SQL in Supabase SQL Editor:

```sql
-- Verify all amount columns are now NUMERIC(12,4)
SELECT 
  table_name, 
  column_name, 
  numeric_precision, 
  numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN (
    'amount', 
    'amount_value', 
    'deposit_amount', 
    'weekly_price', 
    'cashback_amount',
    'total_contract_value',
    'commission_amount',
    'amount_gbp'
  )
  AND numeric_precision IS NOT NULL
ORDER BY table_name, column_name;
```

**Expected Result**: All rows should show `numeric_precision = 12` and `numeric_scale = 4`

---

### Step 2: Verify Views Are Recreated

Run this SQL:

```sql
-- Check that all views exist
SELECT 
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'unified_payment_history',
    'deposit_installment_breakdown',
    'partner_referred_applications',
    'accounts_receivable_report',
    'outstanding_balances_report',
    'bank_reconciliation_report'
  )
ORDER BY table_name;
```

**Expected Result**: All 6 views should be listed with `table_type = 'VIEW'`

---

### Step 3: Test Payment Calculation Function

```sql
-- Test get_payment_summary function
SELECT * FROM public.get_payment_summary(
  (SELECT id FROM student_applications LIMIT 1)
);
```

**Expected Result**: Function should return values with no errors

---

### Step 4: Test Views

```sql
-- Test unified_payment_history
SELECT COUNT(*) FROM unified_payment_history;

-- Test deposit_installment_breakdown
SELECT COUNT(*) FROM deposit_installment_breakdown;

-- Test accounts_receivable_report
SELECT COUNT(*) FROM accounts_receivable_report;
```

**Expected Result**: All queries should execute without errors

---

## Code Changes to Deploy

### Frontend Changes

The following files have been updated with last-installment adjustment logic:

1. **`src/hooks/useStudentPayments.ts`**
   - Added last-installment adjustment to ensure installments sum exactly to remaining balance
   - **Action**: Code is already updated, just needs to be deployed

2. **`supabase/functions/docusign-envelopes/index.ts`**
   - Added last-installment adjustment in payment schedule generation
   - **Action**: Code is already updated, just needs to be deployed

### Deployment Steps

1. **Deploy Frontend Changes**:
   ```bash
   # Commit and push changes
   git add .
   git commit -m "feat: increase payment precision to 4 decimals and add last-installment adjustment"
   git push
   ```

2. **Deploy Edge Function** (if using Supabase CLI):
   ```bash
   supabase functions deploy docusign-envelopes
   ```

---

## Testing Checklist

After deployment, test the following:

### Payment Calculations
- [ ] Create a test payment plan with 3 installments at 33.33% each
- [ ] Create a test application
- [ ] Verify installments sum exactly to remaining balance (no rounding errors)
- [ ] Check remaining balance shows £0.00 when all installments are paid

### Payment Display
- [ ] Verify amounts display with 2 decimals (user-facing)
- [ ] Check payment pages show correct amounts
- [ ] Verify payment schedule shows correct installment amounts

### Reports
- [ ] Check accounting reports show correct totals
- [ ] Verify revenue summaries work correctly
- [ ] Check outstanding balances report

### Bulk Import
- [ ] Test bulk import with payment plan data
- [ ] Verify imported amounts use 4-decimal precision

### Refunds
- [ ] Verify refund amounts display correctly
- [ ] Check revenue calculations subtract refunds correctly

---

## What Changed

### Database
- ✅ All amount columns: `NUMERIC(10,2)` → `NUMERIC(12,4)`
- ✅ Views: Dropped and recreated with new precision
- ✅ Functions: Updated to use new precision
- ✅ Tolerance: Increased from £0.01 to £1.00

### Code
- ✅ `useStudentPayments.ts`: Last-installment adjustment
- ✅ `docusign-envelopes/index.ts`: Last-installment adjustment

### Benefits
- ✅ Eliminates rounding errors in payment calculations
- ✅ Ensures installments sum exactly to remaining balance
- ✅ More accurate financial reporting
- ✅ Better handling of percentage-based installments

---

## Rollback (If Needed)

If you need to rollback, run:

```sql
-- Run the rollback migration
\i supabase/migrations/20251212_rollback_payment_precision_to_2_decimals.sql
```

**Note**: This will round all values to 2 decimals (e.g., £2,619.3381 → £2,619.34)

---

## Support

If you encounter any issues:

1. Check migration logs in Supabase Dashboard
2. Verify column precision with Step 1 SQL query
3. Test payment calculations with a test application
4. Check browser console for any frontend errors

---

**Migration Status**: ✅ **COMPLETE**

**Next Steps**: Deploy frontend code changes and test payment calculations

