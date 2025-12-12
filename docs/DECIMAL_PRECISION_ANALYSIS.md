# Decimal Precision Analysis - Payment Calculation Accuracy

## Current State

### Database Precision
All amount-related columns use **`NUMERIC(10,2)`** - only 2 decimal places:
- `contract_payment_schedule.amount`: `numeric(10,2)`
- `payment_plan_installments.amount_value`: `numeric(10,2)`
- `stripe_payments.amount`: `numeric(10,2)`
- `payment_plans.deposit_amount`: `numeric(10,2)`
- `studio_grade_prices.weekly_price`: `numeric(10,2)`
- `contracts.weekly_price_override`: `numeric(10,2)`
- `contracts.deposit_override`: `numeric(10,2)`

### Calculation Rounding
- `currency()` function: `Math.round((amount + Number.EPSILON) * 100) / 100`
- Rounds to 2 decimals at each calculation step
- JavaScript calculations: No explicit precision, but limited by database storage

## The Problem: Rounding Error Accumulation

### Example: 3 Installments at 33.33% Each

**Scenario**:
- Contract Total: £7,956.00
- Deposit: £99.00
- Remaining Balance: £7,857.00
- Payment Plan: 3 installments at 33.33% each

**Current Calculation (2 decimals)**:
```
Instalment 1: £7,857 × 33.33% = £2,619.3381 → £2,619.34 (rounded)
Instalment 2: £7,857 × 33.33% = £2,619.3381 → £2,619.34 (rounded)
Instalment 3: £7,857 × 33.33% = £2,619.3381 → £2,619.34 (rounded)
Sum: £7,858.02 ❌ (over by £1.02)

OR if rounding down:
Instalment 1-3: £2,619.33 each
Sum: £7,857.99 ❌ (under by £0.99)
```

**With 4 Decimal Precision**:
```
Instalment 1: £7,857 × 33.33% = £2,619.3381 (stored as £2,619.3381)
Instalment 2: £7,857 × 33.33% = £2,619.3381 (stored as £2,619.3381)
Instalment 3: £7,857 × 33.33% = £2,619.3381 (stored as £2,619.3381)
Sum: £7,858.0143 (still not exact, but closer)

With last-installment adjustment:
Instalment 1: £2,619.3381
Instalment 2: £2,619.3381
Instalment 3: £7,857.00 - (£2,619.3381 + £2,619.3381) = £2,618.3238
Sum: £7,857.00 ✅ (exact)
```

## Why 4 Decimals?

### Industry Standard
- **Financial systems**: Typically use 4-6 decimal places internally
- **Currency calculations**: Need precision for percentage-based splits
- **Banking systems**: Often use 4 decimals for intermediate calculations

### Mathematical Accuracy
- **2 decimals**: Can accumulate errors up to £0.01 per installment
- **3 installments**: Up to £0.03 error
- **10 installments**: Up to £0.10 error
- **4 decimals**: Errors reduced to £0.0001 per installment
- **With last-installment adjustment**: Zero error

### Real-World Impact
- **Current**: £0.81 discrepancy (visible to users)
- **With 4 decimals**: £0.00-£0.01 discrepancy (within tolerance)
- **With 4 decimals + adjustment**: £0.00 discrepancy (perfect)

## Recommended Precision Levels

### Option A: NUMERIC(12,4) ✅ **RECOMMENDED**
- **Total digits**: 12 (allows up to £999,999,999.9999)
- **Decimal places**: 4
- **Storage**: ~8 bytes per value
- **Range**: Sufficient for all contract values
- **Accuracy**: 0.0001 precision

### Option B: NUMERIC(15,4)
- **Total digits**: 15 (allows up to £999,999,999,999.9999)
- **Decimal places**: 4
- **Storage**: ~9 bytes per value
- **Range**: Overkill for current needs
- **Accuracy**: Same as Option A

### Option C: NUMERIC(10,4)
- **Total digits**: 10 (allows up to £9,999,999.9999)
- **Decimal places**: 4
- **Storage**: ~8 bytes per value
- **Range**: May be limiting for very large contracts
- **Accuracy**: Same as Option A

## Implementation Strategy

### Step 1: Database Migration
```sql
-- Increase precision for all amount columns
ALTER TABLE contract_payment_schedule 
  ALTER COLUMN amount TYPE NUMERIC(12,4);

ALTER TABLE payment_plan_installments 
  ALTER COLUMN amount_value TYPE NUMERIC(12,4);

ALTER TABLE stripe_payments 
  ALTER COLUMN amount TYPE NUMERIC(12,4);

ALTER TABLE payment_plans 
  ALTER COLUMN deposit_amount TYPE NUMERIC(12,4);

ALTER TABLE studio_grade_prices 
  ALTER COLUMN weekly_price TYPE NUMERIC(12,4),
  ALTER COLUMN deposit_amount_override TYPE NUMERIC(12,4);

ALTER TABLE contracts 
  ALTER COLUMN weekly_price_override TYPE NUMERIC(12,4),
  ALTER COLUMN deposit_override TYPE NUMERIC(12,4);

-- Update function variables
-- All NUMERIC variables in get_payment_summary() will automatically use higher precision
```

### Step 2: Calculation Logic
- **Keep full precision** during calculations
- **Round to 2 decimals** only for:
  - Display to users
  - Final storage in some cases (if needed)
  - API responses (for compatibility)

### Step 3: Display Logic
- **Frontend**: Round to 2 decimals for display
- **Backend**: Use full precision in calculations
- **Database**: Store with 4 decimals

## Benefits

1. **Eliminates rounding errors**: Calculations are more accurate
2. **Industry standard**: Matches financial system practices
3. **Future-proof**: Handles larger contracts and more installments
4. **Combines well**: Works perfectly with last-installment adjustment
5. **Backward compatible**: Existing data can be migrated easily

## Risks & Considerations

1. **Migration complexity**: Need to alter multiple tables
2. **Data migration**: Existing amounts need to be preserved (they'll just have .0000 appended)
3. **Display consistency**: Must ensure all UI rounds to 2 decimals
4. **API compatibility**: External systems might expect 2 decimals

## Recommendation

**YES, increase precision to NUMERIC(12,4)** - This is the root cause fix you identified correctly!

Combine with:
- Last-installment adjustment (Option 2) for perfect accuracy
- Increased tolerance to £1.00 as safety net
- Display rounding to 2 decimals for users

This will eliminate the rounding discrepancy issue at its source.

