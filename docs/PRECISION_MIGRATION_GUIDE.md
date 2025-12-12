# Payment Precision Migration Guide

## Overview

This guide documents the migration from `NUMERIC(10,2)` to `NUMERIC(12,4)` precision for all payment-related columns. This fixes rounding errors in payment calculations.

## Migration Files

### 1. Main Migration
**File**: `supabase/migrations/20251212_increase_payment_precision_to_4_decimals.sql`

**What it does**:
- Increases precision for all amount columns to `NUMERIC(12,4)`
- Updates `unified_payment_history` view
- Updates `get_payment_summary()` function (increases tolerance to £1.00)
- Updates `calculate_contract_value()` function
- Implements last-installment adjustment in `get_payment_summary()`

### 2. Bulk Import Update
**File**: `supabase/migrations/20251212_update_bulk_import_precision.sql`

**What it does**:
- Updates bulk import functions to use `NUMERIC(12,4)` casts
- Functions updated:
  - `bulk_import_studio_grade_prices`
  - `bulk_import_payment_plans`
  - `bulk_import_payment_plan_installments`
  - `bulk_import_contracts`
  - `bulk_import_cashback_campaigns`

### 3. Rollback Migration
**File**: `supabase/migrations/20251212_rollback_payment_precision_to_2_decimals.sql`

**What it does**:
- Reverts all changes back to `NUMERIC(10,2)`
- Rounds values to 2 decimals (e.g., £2,619.3381 → £2,619.34)
- Restores original view and function definitions

## Code Changes

### Frontend Changes

**File**: `src/hooks/useStudentPayments.ts`
- **Change**: Added last-installment adjustment logic
- **Impact**: Ensures installments sum exactly to remaining balance
- **Reversible**: Yes, can revert to previous version

**File**: `supabase/functions/docusign-envelopes/index.ts`
- **Change**: Added last-installment adjustment in payment schedule generation
- **Impact**: DocuSign contracts show exact amounts
- **Reversible**: Yes, can revert to previous version

## How to Apply Migration

### Step 1: Backup Database
```bash
# Create a backup before migration
supabase db dump -f backup_before_precision_migration.sql
```

### Step 2: Apply Migration
```bash
# Apply the migration
supabase migration up

# Or apply specific migration
supabase db push
```

### Step 3: Verify
```sql
-- Check column precision
SELECT 
  table_name, 
  column_name, 
  data_type, 
  numeric_precision, 
  numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('amount', 'amount_value', 'deposit_amount', 'weekly_price', 'cashback_amount')
ORDER BY table_name, column_name;

-- Should show numeric_precision = 12, numeric_scale = 4
```

### Step 4: Test
1. Create a test payment plan with 3 installments at 33.33% each
2. Create a test application
3. Verify installments sum exactly to remaining balance
4. Check remaining balance shows £0.00 when all paid

## How to Rollback

### Option 1: Using Rollback Migration
```bash
# Apply rollback migration
supabase migration up

# The rollback migration will:
# 1. Revert all columns to NUMERIC(10,2)
# 2. Round values to 2 decimals
# 3. Restore original views and functions
```

### Option 2: Manual Rollback
```sql
-- Run the rollback migration SQL directly
\i supabase/migrations/20251212_rollback_payment_precision_to_2_decimals.sql
```

### Option 3: Revert Code Changes
```bash
# Revert frontend changes
git checkout HEAD~1 src/hooks/useStudentPayments.ts
git checkout HEAD~1 supabase/functions/docusign-envelopes/index.ts
```

## What Gets Changed

### Database Tables (15 columns)
- `payment_plans.deposit_amount`
- `payment_plan_installments.amount_value`
- `contract_payment_schedule.amount`
- `studio_grade_prices.weekly_price`
- `studio_grade_prices.deposit_amount_override`
- `contracts.weekly_price_override`
- `contracts.deposit_override`
- `stripe_payments.amount`
- `manual_payments.amount`
- `partner_referrals.total_contract_value`
- `partner_referrals.commission_amount`
- `cashback_campaigns.cashback_amount`
- `student_applications.cashback_amount`
- `financial_forecasts.weekly_price`
- `financial_forecasts.total_contract_value`
- `student_applications.total_contract_value` (if exists)

### Views (1 view)
- `unified_payment_history` - Updated cast from `::NUMERIC(10,2)` to `::NUMERIC(12,4)`

### Functions (3 functions)
- `get_payment_summary()` - Updated tolerance to £1.00, added last-installment adjustment
- `calculate_contract_value()` - Updated return type to `NUMERIC(12,4)`
- Bulk import functions (5 functions) - Updated casts

### Frontend Code (2 files)
- `src/hooks/useStudentPayments.ts` - Added last-installment adjustment
- `supabase/functions/docusign-envelopes/index.ts` - Added last-installment adjustment

## Data Preservation

### Existing Data
- **No data loss**: Values like `£2,619.34` become `£2,619.3400` (same value, more precision)
- **Automatic conversion**: PostgreSQL handles the precision increase automatically
- **Backward compatible**: Can still display as 2 decimals

### After Rollback
- **Values rounded**: `£2,619.3381` → `£2,619.34` (rounded to 2 decimals)
- **No data corruption**: All values remain valid
- **Slight precision loss**: 4-decimal values rounded to 2 decimals

## Testing Checklist

After migration, verify:

- [ ] All amount columns show `NUMERIC(12,4)` precision
- [ ] Payment creation works (Stripe integration)
- [ ] Payment display shows 2 decimals (user-facing)
- [ ] Installment calculations use 4 decimals internally
- [ ] Last installment adjustment works correctly
- [ ] Remaining balance = £0.00 when all paid
- [ ] Reports show correct totals
- [ ] Bulk import functions work
- [ ] DocuSign contracts show correct amounts
- [ ] No errors in console or logs

## Rollback Safety

### Before Rollback
1. **Backup current data**: Create a database backup
2. **Document current state**: Note any discrepancies
3. **Test rollback on staging**: If possible, test rollback first

### After Rollback
1. **Verify data**: Check that values are correctly rounded
2. **Test payments**: Ensure payment flow still works
3. **Check reports**: Verify reports show correct values

## Support

If you encounter issues:

1. **Check migration logs**: Review Supabase migration logs
2. **Verify column precision**: Use the SQL query in Step 3 above
3. **Test calculations**: Create a test application and verify amounts
4. **Rollback if needed**: Use the rollback migration if issues persist

## Notes

- **Display precision**: Users still see 2 decimals (e.g., £2,619.34)
- **Calculation precision**: Internal calculations use 4 decimals (e.g., £2,619.3381)
- **Stripe integration**: Converts to pence (rounds to nearest integer)
- **Tolerance**: Increased from £0.01 to £1.00 as safety net
- **Last-installment adjustment**: Ensures perfect accuracy even with 4 decimals

