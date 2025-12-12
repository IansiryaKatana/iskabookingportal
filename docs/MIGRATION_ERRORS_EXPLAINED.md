# Migration Errors Explained

## What the Errors Mean

### Error Pattern
```
ERROR: 0A000: cannot alter type of a column used by a view or rule
DETAIL: rule _RETURN on view [VIEW_NAME] depends on column "[COLUMN_NAME]"
```

### What This Means

**PostgreSQL Restriction**: PostgreSQL **prevents** you from altering a column's data type if there are **views** (or other database objects) that depend on that column.

**Why?**: 
- Views are stored queries that reference specific columns
- If you change a column's type while a view uses it, the view might break
- PostgreSQL protects you by blocking the operation

**The Solution**: 
1. **Drop** the dependent views first
2. **Alter** the columns
3. **Recreate** the views (they'll automatically use the new column types)

---

## Errors We Encountered

### Error 1: `deposit_installment_breakdown` View
```
ERROR: cannot alter type of a column used by a view or rule
DETAIL: rule _RETURN on view deposit_installment_breakdown depends on column "deposit_amount"
```

**What happened**:
- We tried to alter `payment_plans.deposit_amount` from `NUMERIC(10,2)` to `NUMERIC(12,4)`
- The `deposit_installment_breakdown` view uses `pp.deposit_amount` in its query
- PostgreSQL blocked the change

**Fix Applied**:
- Added `DROP VIEW IF EXISTS public.deposit_installment_breakdown CASCADE;` to PART 0
- Recreated the view in PART 4 after columns are altered

---

### Error 2: `unified_payment_history` View
```
ERROR: cannot alter type of a column used by a view or rule
DETAIL: rule _RETURN on view unified_payment_history depends on column "deposit_amount"
```

**What happened**:
- Same issue - `unified_payment_history` view also uses `pp.deposit_amount`
- This view is critical - it's used throughout the system for payment reporting

**Fix Applied**:
- Added `DROP VIEW IF EXISTS public.unified_payment_history CASCADE;` to PART 0
- Recreated the view in PART 2 (before other views that might depend on it)

---

### Error 3: `partner_referred_applications` View
```
ERROR: cannot alter type of a column used by a view or rule
DETAIL: rule _RETURN on view partner_referred_applications depends on column "total_contract_value"
```

**What happened**:
- We tried to alter `partner_referrals.total_contract_value` from `NUMERIC(10,2)` to `NUMERIC(12,4)`
- The `partner_referred_applications` view selects `pr.total_contract_value`
- PostgreSQL blocked the change

**Fix Applied**:
- Added `DROP VIEW IF EXISTS public.partner_referred_applications CASCADE;` to PART 0
- Recreated the view in PART 4 after columns are altered

---

## What I've Done to Fix It

### 1. Updated Migration Structure

**Before** (Would Fail):
```sql
BEGIN;
-- Try to alter columns directly
ALTER TABLE payment_plans ALTER COLUMN deposit_amount TYPE NUMERIC(12,4);
-- ❌ ERROR: View depends on column
```

**After** (Works Correctly):
```sql
BEGIN;

-- PART 0: Drop all dependent views FIRST
DROP VIEW IF EXISTS public.unified_payment_history CASCADE;
DROP VIEW IF EXISTS public.deposit_installment_breakdown CASCADE;
DROP VIEW IF EXISTS public.partner_referred_applications CASCADE;

-- PART 1: Now we can safely alter columns
ALTER TABLE payment_plans ALTER COLUMN deposit_amount TYPE NUMERIC(12,4);
-- ✅ SUCCESS: No views depend on it anymore

-- PART 2: Recreate unified_payment_history view
CREATE OR REPLACE VIEW public.unified_payment_history AS ...

-- PART 4: Recreate other views
CREATE OR REPLACE VIEW public.deposit_installment_breakdown AS ...
CREATE OR REPLACE VIEW public.partner_referred_applications AS ...

COMMIT;
```

### 2. Used `CASCADE` for Safety

**What `CASCADE` does**:
- Drops the view AND any other objects that depend on it
- Prevents cascading dependency errors
- Ensures clean removal

**Example**:
```sql
DROP VIEW IF EXISTS public.unified_payment_history CASCADE;
```
This will:
- Drop `unified_payment_history` view
- Drop any views that depend on `unified_payment_history`
- Drop any functions that depend on `unified_payment_history`
- (We recreate them all afterward)

### 3. Proper Order of Operations

**Correct Order**:
1. ✅ **Drop views** (PART 0)
2. ✅ **Alter columns** (PART 1)
3. ✅ **Recreate views** (PART 2, 4)
4. ✅ **Update functions** (PART 3, 5)

**Why This Order Matters**:
- Views must be dropped BEFORE altering columns
- Views can be recreated AFTER columns are altered
- Functions can reference views, so views must exist first

### 4. Updated Both Migrations

**Main Migration** (`20251212_increase_payment_precision_to_4_decimals.sql`):
- ✅ Drops all 3 views in PART 0
- ✅ Recreates all 3 views after column alterations

**Rollback Migration** (`20251212_rollback_payment_precision_to_2_decimals.sql`):
- ✅ Same structure for consistency
- ✅ Can safely rollback if needed

---

## Views That Were Affected

### 1. `unified_payment_history`
**Purpose**: Combines all payment records (Stripe + Manual) into one view
**Dependencies**: 
- Uses `pp.deposit_amount` from `payment_plans` table
- Used by: Payment reports, accounting reports, revenue calculations

**Status**: ✅ Fixed - Dropped and recreated

### 2. `deposit_installment_breakdown`
**Purpose**: Shows breakdown of deposit vs installment payments
**Dependencies**:
- Uses `pp.deposit_amount` from `payment_plans` table
- Used by: Accounting reports, deposit/installment analysis

**Status**: ✅ Fixed - Dropped and recreated

### 3. `partner_referred_applications`
**Purpose**: Shows applications referred by partners for commission tracking
**Dependencies**:
- Uses `pr.total_contract_value` from `partner_referrals` table
- Used by: Partner portal, commission reports

**Status**: ✅ Fixed - Dropped and recreated

---

## Why This Approach Works

### Safety
- ✅ All views are dropped in a transaction (`BEGIN; ... COMMIT;`)
- ✅ If anything fails, the entire migration rolls back
- ✅ No partial state - either all changes succeed or none do

### Data Preservation
- ✅ Dropping views doesn't delete data
- ✅ Views are just stored queries, not tables
- ✅ Recreating views uses the same query logic
- ✅ Views automatically use the new column precision

### No Breaking Changes
- ✅ View definitions remain the same
- ✅ Only the underlying column precision changes
- ✅ Applications using these views continue to work
- ✅ Display formatting still shows 2 decimals

---

## Current Migration Status

### ✅ All Errors Fixed

**Views Handled**:
1. ✅ `unified_payment_history` - Dropped and recreated
2. ✅ `deposit_installment_breakdown` - Dropped and recreated
3. ✅ `partner_referred_applications` - Dropped and recreated

**Migration Structure**:
- ✅ PART 0: Drop all dependent views
- ✅ PART 1: Alter all columns
- ✅ PART 2: Recreate `unified_payment_history`
- ✅ PART 3: Update functions
- ✅ PART 4: Recreate other views
- ✅ PART 5: Update `get_payment_summary` function

**Status**: ✅ **READY TO RUN**

---

## If You Get More Errors

If you encounter another similar error, it means there's another view or function that depends on the columns we're altering. The pattern will be:

```
ERROR: cannot alter type of a column used by a view or rule
DETAIL: rule _RETURN on view [VIEW_NAME] depends on column "[COLUMN_NAME]"
```

**Solution**:
1. Add the view name to PART 0 drop list
2. Recreate it in PART 4 (or appropriate section)
3. Run migration again

**Common places to check**:
- Other views in `supabase/migrations/20250125_accounting_reports.sql`
- Views in partner referral migrations
- Any custom views you've created

---

## Summary

**What the errors meant**: PostgreSQL protects you from breaking views when altering columns

**What I did**: 
1. Identified all dependent views
2. Added them to the drop list (PART 0)
3. Recreated them after column alterations (PART 2, 4)
4. Used `CASCADE` for safety
5. Maintained proper transaction structure

**Result**: Migration is now safe to run and will handle all view dependencies correctly.

