# Precision Migration - Refund System Impact Analysis

## Executive Summary

**Status**: ⚠️ **UPDATE REQUIRED**

The refund system improvements document reveals that the `refunds` table has a **GENERATED column** `amount_gbp` that uses `NUMERIC(10,2)`. This column needs to be updated to `NUMERIC(12,4)` for consistency with the precision migration.

---

## Key Findings

### 1. Refunds Table Structure

**Current Schema** (from `20250322_refunds_table.sql`):
```sql
CREATE TABLE public.refunds (
  ...
  amount_pence INTEGER NOT NULL,
  amount_gbp NUMERIC(10, 2) GENERATED ALWAYS AS (amount_pence / 100.0) STORED,
  ...
);
```

**Issue**: 
- `amount_gbp` is a **GENERATED column** with `NUMERIC(10,2)`
- This column is used in revenue calculations (`get_revenue_summary`)
- It should be updated to `NUMERIC(12,4)` for consistency

**Impact**:
- Revenue calculations use `amount_gbp` from refunds
- If refunds remain at 2 decimals while payments use 4 decimals, there could be precision mismatches
- However, since `amount_gbp` is calculated from `amount_pence` (integer), the precision increase is mainly for consistency

### 2. Revenue Summary Function

**Current Usage** (from `20250128_update_revenue_summary_subtract_refunds.sql`):
```sql
SELECT SUM(amount_gbp) AS total_refunds
FROM public.refunds
WHERE status = 'succeeded'
```

**Impact**:
- Function sums `amount_gbp` which is currently `NUMERIC(10,2)`
- After migration, should use `NUMERIC(12,4)` for consistency
- No functional change needed - just precision update

### 3. Manual Payments

**Status**: ✅ **ALREADY COVERED**

The `manual_payments.amount` column is already included in our migration:
```sql
ALTER TABLE public.manual_payments 
  ALTER COLUMN amount TYPE NUMERIC(12,4);
```

**No action needed** - this is already in the migration.

---

## Required Updates

### Update 1: Add Refunds Table to Migration

**File**: `supabase/migrations/20251212_increase_payment_precision_to_4_decimals.sql`

**Action**: Add this to PART 1 (after manual_payments):

```sql
-- Refunds table
-- Note: amount_gbp is a GENERATED column, so we need to drop and recreate it
ALTER TABLE public.refunds 
  DROP COLUMN IF EXISTS amount_gbp;

ALTER TABLE public.refunds 
  ADD COLUMN amount_gbp NUMERIC(12,4) 
  GENERATED ALWAYS AS (amount_pence / 100.0) STORED;
```

**Why**: 
- GENERATED columns cannot be altered directly
- Must drop and recreate with new precision
- Formula remains the same: `amount_pence / 100.0`

### Update 2: Update Rollback Migration

**File**: `supabase/migrations/20251212_rollback_payment_precision_to_2_decimals.sql`

**Action**: Add this to PART 1 (after manual_payments):

```sql
-- Refunds table - revert amount_gbp to NUMERIC(10,2)
ALTER TABLE public.refunds 
  DROP COLUMN IF EXISTS amount_gbp;

ALTER TABLE public.refunds 
  ADD COLUMN amount_gbp NUMERIC(10,2) 
  GENERATED ALWAYS AS (amount_pence / 100.0) STORED;
```

---

## Impact Assessment

### Low Risk ✅

**Why it's safe**:
1. **GENERATED column**: The value is calculated, not stored directly
2. **Formula unchanged**: Still `amount_pence / 100.0`
3. **Source unchanged**: `amount_pence` is INTEGER (not affected)
4. **Backward compatible**: Display still shows 2 decimals

**Example**:
- Before: `amount_pence = 9900` → `amount_gbp = 99.00` (NUMERIC(10,2))
- After: `amount_pence = 9900` → `amount_gbp = 99.0000` (NUMERIC(12,4))
- Display: Still shows `£99.00` (2 decimals)

### No Functional Changes

- Revenue calculations work the same
- Refund processing unchanged
- Currency conversion logic unchanged
- All existing refunds remain valid

---

## Testing Checklist

After migration, verify:

- [ ] `refunds.amount_gbp` column shows `NUMERIC(12,4)` precision
- [ ] Existing refunds display correctly
- [ ] Revenue summary calculations work
- [ ] Net revenue (revenue - refunds) calculates correctly
- [ ] Manual refund recording works
- [ ] Stripe refund processing works
- [ ] Refund amounts display with 2 decimals (user-facing)

---

## Recommendation

**Action**: **UPDATE MIGRATION FILES**

1. ✅ Add `refunds.amount_gbp` update to main migration
2. ✅ Add `refunds.amount_gbp` update to rollback migration
3. ✅ Test refund calculations after migration
4. ✅ Verify revenue summary reports

**Priority**: **MEDIUM** - Not critical but recommended for consistency

**Risk**: **LOW** - Safe to update, no data loss risk

---

## Code References

- **Refunds table**: `supabase/migrations/20250322_refunds_table.sql`
- **Revenue function**: `supabase/migrations/20250128_update_revenue_summary_subtract_refunds.sql`
- **Refund system docs**: `docs/REFUND_SYSTEM_IMPROVEMENTS.md`

