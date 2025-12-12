# Migration Execution Order

## ✅ Step 1: Run Main Migration

**File**: `supabase/migrations/20251212_increase_payment_precision_to_4_decimals.sql`

**What it does**:
- Increases all amount columns from `NUMERIC(10,2)` to `NUMERIC(12,4)`
- Updates `unified_payment_history` view
- Updates `get_payment_summary()` function (increases tolerance to £1.00)
- Updates `calculate_contract_value()` function

**How to run**:
1. Open Supabase Dashboard → SQL Editor
2. Copy the entire contents of `20251212_increase_payment_precision_to_4_decimals.sql`
3. Paste into SQL Editor
4. Click "Run" or press `Ctrl+Enter`

**Expected result**: 
- ✅ All columns updated to `NUMERIC(12,4)`
- ✅ Views and functions updated
- ✅ No errors

---

## ✅ Step 2: Run Bulk Import Update

**File**: `supabase/migrations/20251212_update_bulk_import_precision.sql`

**What it does**:
- Updates 5 bulk import functions to use `NUMERIC(12,4)` casts:
  - `bulk_import_studio_grade_prices`
  - `bulk_import_payment_plans`
  - `bulk_import_payment_plan_installments`
  - `bulk_import_contracts`
  - `bulk_import_cashback_campaigns`

**How to run**:
1. In Supabase Dashboard → SQL Editor (same session or new)
2. Copy the entire contents of `20251212_update_bulk_import_precision.sql`
3. Paste into SQL Editor
4. Click "Run" or press `Ctrl+Enter`

**Expected result**:
- ✅ All bulk import functions updated
- ✅ Functions now use `NUMERIC(12,4)` for parsing CSV data
- ✅ No errors

---

## ✅ Step 3: Verify Migration

Run this SQL to verify all columns are updated:

```sql
-- Verify column precision
SELECT 
  table_name, 
  column_name, 
  data_type, 
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
    'commission_amount'
  )
  AND numeric_precision IS NOT NULL
ORDER BY table_name, column_name;
```

**Expected result**:
- All rows should show `numeric_precision = 12` and `numeric_scale = 4`

---

## ✅ Step 4: Test Payment Calculation

Run this SQL to test the updated function:

```sql
-- Test get_payment_summary function
SELECT * FROM public.get_payment_summary(
  (SELECT id FROM student_applications LIMIT 1)
);
```

**Expected result**:
- Function returns values with correct precision
- No errors

---

## ⚠️ If You Need to Rollback

**File**: `supabase/migrations/20251212_rollback_payment_precision_to_2_decimals.sql`

**When to use**: Only if you encounter issues and need to revert

**How to run**:
1. Open Supabase Dashboard → SQL Editor
2. Copy the entire contents of `20251212_rollback_payment_precision_to_2_decimals.sql`
3. Paste into SQL Editor
4. Click "Run" or press `Ctrl+Enter`

**Warning**: This will round all values to 2 decimals (e.g., £2,619.3381 → £2,619.34)

---

## Summary

**Execution Order**:
1. ✅ `20251212_increase_payment_precision_to_4_decimals.sql` (Main migration)
2. ✅ `20251212_update_bulk_import_precision.sql` (Bulk import functions)
3. ✅ Verify with SQL queries above
4. ✅ Test payment calculations

**Total time**: ~2-5 minutes depending on database size

**Rollback available**: Yes, use `20251212_rollback_payment_precision_to_2_decimals.sql` if needed

