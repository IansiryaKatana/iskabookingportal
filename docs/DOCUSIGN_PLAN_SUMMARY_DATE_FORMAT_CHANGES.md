# DocuSign Plan Summary Date Format Changes

## Date: 2025-01-31

## Summary
Updated the DocuSign envelope creation function to:
1. Calculate payment plan installment due dates from `due_date_offset_days` when `due_date` is null
2. Format plan summary with HTML line breaks (`<br>\n`) instead of semicolons for better readability

## Files Changed
- `supabase/functions/docusign-envelopes/index.ts`

## Changes Made

### 1. Added `due_date_offset_days` to Query (Line 685)
**Before:**
```typescript
.select("amount_value, amount_type, due_date, sequence, label")
```

**After:**
```typescript
.select("amount_value, amount_type, due_date, due_date_offset_days, sequence, label")
```

### 2. Added Date Calculation Logic (Lines 721-737)
**Before:**
```typescript
const due = it.due_date ? formatGbDate(it.due_date) : "";
```

**After:**
```typescript
// Calculate actual due date: use due_date if available, otherwise calculate from contract_start + offset
let actualDueDate: string | null = null;
if (it.due_date) {
  actualDueDate = it.due_date;
} else if (it.due_date_offset_days !== null && contract?.contract_start) {
  // Calculate: contract_start + offset_days
  try {
    const contractStart = new Date(contract.contract_start);
    const calculatedDate = new Date(contractStart);
    calculatedDate.setDate(calculatedDate.getDate() + it.due_date_offset_days);
    actualDueDate = calculatedDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
  } catch (dateError) {
    console.error("Error calculating due date from offset:", dateError);
    // Fall back to empty date if calculation fails
    actualDueDate = null;
  }
}

const due = actualDueDate ? formatGbDate(actualDueDate) : "";
```

### 3. Changed Plan Summary Join Format (Line 744)
**Before:**
```typescript
planSummary = scheduleItems.join("; ");
```

**After:**
```typescript
planSummary = scheduleItems.join("<br>\n");
```

## Impact

### Before
- Plan summary format: `"Installment 1: £3,075.00; Installment 2: £3,075.00; Installment 3: £3,075.00"`
- Dates only shown if `due_date` field is populated in database
- All installments on one line separated by semicolons

### After
- Plan summary format: `"Installment 1: £3,075.00 22 Aug 2026<br>\nInstallment 2: £3,075.00 1 Jan 2027<br>\nInstallment 3: £3,075.00 1 Apr 2027"`
- Dates calculated from `due_date_offset_days` + `contract_start` when `due_date` is null
- Each installment on a new line with HTML line break

## Rollback Instructions

To rollback these changes, revert the three modifications above:

1. **Revert query** (Line 685):
   ```typescript
   .select("amount_value, amount_type, due_date, sequence, label")
   ```

2. **Revert date calculation** (Lines 721-737):
   ```typescript
   const due = it.due_date ? formatGbDate(it.due_date) : "";
   ```

3. **Revert join format** (Line 744):
   ```typescript
   planSummary = scheduleItems.join("; ");
   ```

## Testing Recommendations

1. Test with payment plans that have:
   - Fixed `due_date` values (should work as before)
   - `due_date_offset_days` only (should now calculate dates)
   - Both fields populated (should prefer `due_date`)

2. Verify DocuSign template renders:
   - HTML `<br>` tags as line breaks (if template supports HTML)
   - Fallback to newline characters if HTML not supported

3. Check error handling:
   - Invalid contract_start dates
   - Invalid offset values
   - Missing contract data

## Safety Notes

- ✅ Error handling in place (try-catch around date calculation)
- ✅ Falls back to empty date if calculation fails
- ✅ No breaking changes to existing functionality
- ✅ Backward compatible (still works with fixed `due_date` values)
- ⚠️ HTML formatting depends on DocuSign template configuration

