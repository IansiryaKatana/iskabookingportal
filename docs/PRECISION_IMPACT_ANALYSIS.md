# Impact Analysis: Increasing Decimal Precision to NUMERIC(12,4)

## Executive Summary

**Overall Risk: LOW** ✅

Increasing precision from `NUMERIC(10,2)` to `NUMERIC(12,4)` is **SAFE** and will **NOT break** existing functionality. All systems are designed to handle numeric values flexibly.

---

## Detailed Impact Analysis

### ✅ SAFE - No Changes Needed

#### 1. **Stripe Integration** ✅
**Status**: Fully compatible

**How it works**:
- Stripe uses **pence** (amount × 100)
- Code: `Math.round(amount * 100)` 
- Example: £2,619.3381 → 261,934 pence (rounded)

**Impact**: 
- ✅ Works perfectly with 4 decimals
- ✅ `Math.round()` handles the conversion correctly
- ✅ Stripe only accepts integers (pence), so rounding is expected

**Files**:
- `supabase/functions/create-payment/index.ts` (line 200)
- `src/pages/portal/Payments.tsx` (line 795)
- `src/pages/portal/ApplicationWizard.tsx` (line 3708)

---

#### 2. **Display Formatting** ✅
**Status**: Fully compatible

**How it works**:
- All display uses `toFixed(2)` or `minimumFractionDigits: 2`
- Example: `£2,619.3381.toFixed(2)` → `"£2,619.34"`

**Impact**:
- ✅ All formatting functions round to 2 decimals for display
- ✅ Users still see 2 decimal places
- ✅ Internal calculations use 4 decimals, display uses 2

**Files**:
- `src/lib/utils.ts` - `formatCurrency()` function
- All pages using `toLocaleString("en-GB", { minimumFractionDigits: 2 })`
- 54+ instances across codebase

---

#### 3. **Database Functions** ✅
**Status**: Fully compatible

**How it works**:
- Functions return `NUMERIC` (no precision specified)
- PostgreSQL automatically uses column precision
- Calculations preserve precision

**Impact**:
- ✅ `get_payment_summary()` returns `NUMERIC` - will use 4 decimals
- ✅ All calculations maintain precision
- ✅ No function signature changes needed

**Functions**:
- `get_payment_summary(UUID)` - Returns NUMERIC (uses column precision)
- `get_revenue_summary()` - Returns NUMERIC
- All RPC functions - Use NUMERIC variables

---

#### 4. **Views** ✅
**Status**: Mostly compatible (1 minor fix needed)

**How it works**:
- Views select from tables directly
- Most use `sp.amount AS amount_paid` (inherits precision)

**Impact**:
- ✅ Most views automatically inherit new precision
- ⚠️ **ONE VIEW** has explicit cast: `unified_payment_history` line 64

**Fix Required**:
```sql
-- Line 64 in unified_payment_history.sql
-- OLD:
)::NUMERIC(10,2) AS amount_paid,

-- NEW:
)::NUMERIC(12,4) AS amount_paid,
```

**Files**:
- `supabase/migrations/20251118_unified_payment_history.sql` (line 64)
- `supabase/migrations/20250124_fix_unified_payment_history_include_payment_type.sql` (line 85)

---

#### 5. **Frontend Calculations** ✅
**Status**: Fully compatible

**How it works**:
- JavaScript `Number()` handles any precision
- Calculations: `(remainingBalance * 33.33) / 100`
- TypeScript types are `number` (not limited to 2 decimals)

**Impact**:
- ✅ JavaScript numbers are IEEE 754 doubles (15-17 decimal precision)
- ✅ All calculations work with 4 decimals
- ✅ No type changes needed

**Files**:
- `src/hooks/useStudentPayments.ts` (line 121)
- `src/pages/portal/Payments.tsx` (line 750)
- All calculation logic

---

#### 6. **Edge Functions** ✅
**Status**: Fully compatible

**How it works**:
- TypeScript/Deno uses JavaScript number type
- Stripe API accepts pence (integers)
- Conversion: `Math.round(amount * 100)`

**Impact**:
- ✅ All edge functions work with 4 decimals
- ✅ Stripe conversion handles rounding correctly

**Files**:
- `supabase/functions/create-payment/index.ts`
- `supabase/functions/sync-payment-from-stripe/index.ts`
- `supabase/functions/docusign-envelopes/index.ts`

---

### ⚠️ MINOR FIXES REQUIRED

#### 1. **View Explicit Casts** (7 files)
**Files with `::NUMERIC(10,2)` casts that need updating**:
- `supabase/migrations/20251118_unified_payment_history.sql` (line 64)
- `supabase/migrations/20250124_fix_unified_payment_history_include_payment_type.sql` (line 85)
- `supabase/migrations/20250124_update_unified_payment_history_for_installments.sql` (line 86)
- `supabase/migrations/20250125_fix_remaining_balance_calculation.sql` (line 87)
- `supabase/migrations/20250125_fix_remaining_balance_final.sql` (line 92)
- `supabase/migrations/20250125_fix_payments_not_counted.sql` (line 125)
- `supabase/migrations/20250125_force_fix_payments_metadata.sql` (line 108)

**Change**:
```sql
-- Change from:
)::NUMERIC(10,2) AS amount_paid,

-- To:
)::NUMERIC(12,4) AS amount_paid,
```

**Risk**: LOW - Only affects view/function definitions, not data

**Note**: These are in older migrations. The current active view is likely the latest one. We should update the current view definition, not all historical migrations.

---

#### 2. **Bulk Import Functions** (1 file)
**File**: `supabase/migrations/20251124_bulk_import_functions.sql`

**Lines with `::NUMERIC(10,2)` casts**:
- Line 310: `weekly_price`
- Line 311: `deposit_amount_override`
- Line 383: `deposit_amount`
- Line 401: `deposit_amount`
- Line 474: `amount_value`
- Line 587: `weekly_price_override`
- Line 588: `deposit_override`
- Line 752: `cashback_amount`

**Change**:
```sql
-- Change from:
(v_row->>'weekly_price')::NUMERIC(10,2)

-- To:
(v_row->>'weekly_price')::NUMERIC(12,4)
```

**Risk**: LOW - Only affects data import parsing, not existing data

---

#### 3. **Financial Forecasts Function** (1 file)
**File**: `supabase/migrations/20250317_financial_forecasts.sql`

**Lines**:
- Line 34-35: Table column definitions
- Line 64: Column addition
- Line 70-71: Function return type and variable

**Change**:
```sql
-- Change from:
RETURNS NUMERIC(10,2) AS $$
DECLARE
  v_weekly_price NUMERIC(10,2);

-- To:
RETURNS NUMERIC(12,4) AS $$
DECLARE
  v_weekly_price NUMERIC(12,4);
```

**Risk**: LOW - Function will return more precise values

---

#### 4. **Partner Referral & Cashback Tables** (1 file)
**File**: `supabase/migrations/20251118_partner_referral_and_cashback_system.sql`

**Lines**:
- Line 29: `total_contract_value NUMERIC(10,2)`
- Line 30: `commission_amount NUMERIC(10,2)`
- Line 53: `cashback_amount NUMERIC(10,2)`
- Line 72: `cashback_amount NUMERIC(10,2)`
- Line 83: `cashback_amount NUMERIC(10,2)`

**Change**: Update table column definitions to `NUMERIC(12,4)`

**Risk**: LOW - These are snapshot values, can store with higher precision

---

#### 5. **Stripe Payments & Manual Payments Tables** (2 files)
**Files**:
- `supabase/migrations/20251118_create_stripe_payments_table.sql` (line 9)
- `supabase/migrations/20250318_manual_payments.sql` (line 8)

**Change**: Update `amount NUMERIC(10,2)` to `NUMERIC(12,4)`

**Risk**: LOW - These are the main payment tables, should match other amount columns

---

#### 2. **Seed Data Script** (1 file)
**File**: `scripts/seed-data.mjs`

**Current**:
```javascript
const currency = (amount) =>
  Math.round((amount + Number.EPSILON) * 100) / 100;
```

**Impact**: 
- ⚠️ This rounds to 2 decimals for seed data
- ✅ Can keep as-is (seed data will be 2 decimals, which is fine)
- ✅ OR update to round to 4 decimals for consistency

**Recommendation**: Keep as-is (seed data doesn't need 4 decimals)

---

### ✅ NO IMPACT - These Work Automatically

#### 1. **Database Migrations**
- `ALTER TABLE` automatically preserves existing data
- Values like `£2,619.34` become `£2,619.3400` (same value, more precision)
- No data loss

#### 2. **API Responses**
- Supabase client returns JavaScript numbers
- JSON serialization handles any precision
- Frontend receives numbers, formats for display

#### 3. **TypeScript Types**
- All types use `number` (not limited precision)
- No type changes needed

#### 4. **RLS Policies**
- No impact - policies don't check precision

#### 5. **Indexes**
- No impact - indexes work with any NUMERIC precision

---

## Migration Safety

### Data Preservation ✅
- **Existing values**: `£2,619.34` → `£2,619.3400` (same value)
- **No data loss**: All existing amounts preserved
- **Backward compatible**: Can still display as 2 decimals

### Rollback Plan ✅
- Can rollback by changing back to `NUMERIC(10,2)`
- Values will round to 2 decimals (e.g., `£2,619.3400` → `£2,619.34`)
- No data corruption risk

---

## Testing Checklist

After migration, test:

1. ✅ **Payment Creation**
   - Create payment intent with 4-decimal amount
   - Verify Stripe receives correct pence amount

2. ✅ **Payment Display**
   - Verify amounts display with 2 decimals
   - Check all payment pages

3. ✅ **Calculations**
   - Verify installment calculations use 4 decimals
   - Check remaining balance calculations

4. ✅ **Reports**
   - Verify accounting reports show correct totals
   - Check revenue summaries

5. ✅ **Database Functions**
   - Test `get_payment_summary()` returns correct values
   - Verify all RPC functions work

---

## Summary

### ✅ SAFE TO IMPLEMENT

**What will work automatically** (No changes needed):
- ✅ Stripe integration (pence conversion)
- ✅ Display formatting (2 decimals)
- ✅ Database functions (NUMERIC precision)
- ✅ Frontend calculations (JavaScript numbers)
- ✅ Edge functions (TypeScript numbers)
- ✅ API responses (JSON serialization)
- ✅ Main schema tables (via ALTER TABLE)

**What needs minor fixes** (12 files total):
- ⚠️ 7 view/function definitions (explicit `::NUMERIC(10,2)` casts)
- ⚠️ 1 bulk import function (8 casts in parsing logic)
- ⚠️ 1 financial forecasts function (return type + variables)
- ⚠️ 1 partner referral table (5 column definitions)
- ⚠️ 2 payment tables (stripe_payments, manual_payments)
- ⚠️ Seed data script (optional - can keep as-is)

**Risk Level**: **LOW** ✅
- No breaking changes
- No data loss
- Backward compatible
- Easy rollback
- All fixes are straightforward (find/replace `NUMERIC(10,2)` → `NUMERIC(12,4)`)

**Recommendation**: **PROCEED** with migration. The benefits (eliminating rounding errors) far outweigh the minimal risk. All fixes are simple and low-risk.

---

## Migration Strategy

### Phase 1: Update Table Definitions
```sql
-- Main payment tables
ALTER TABLE contract_payment_schedule ALTER COLUMN amount TYPE NUMERIC(12,4);
ALTER TABLE payment_plan_installments ALTER COLUMN amount_value TYPE NUMERIC(12,4);
ALTER TABLE stripe_payments ALTER COLUMN amount TYPE NUMERIC(12,4);
ALTER TABLE manual_payments ALTER COLUMN amount TYPE NUMERIC(12,4);
-- ... (all other amount columns)
```

### Phase 2: Update Views & Functions
- Update all `::NUMERIC(10,2)` casts to `::NUMERIC(12,4)`
- Update function return types and variables
- Test all views and functions

### Phase 3: Update Application Code (Optional)
- Update seed data script (optional)
- No frontend changes needed (already handles any precision)

### Phase 4: Testing
- Test payment creation
- Test calculations
- Test display formatting
- Test reports

