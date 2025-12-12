# Refund System Improvements - Implementation Documentation

**Date**: January 28, 2025  
**Status**: ✅ Complete

## Overview

This document describes the comprehensive improvements made to the refund system to support both Stripe and manual payment refunds, fix manual payment amount display issues, and ensure accurate revenue calculations.

---

## Problems Solved

### 1. Manual Payment Amounts Not Displaying
**Issue**: When deposit records were imported or added as manual payments, the refunds page showed a dash (—) instead of the payment amount in the Amount column.

**Root Cause**: The refunds page only attempted to fetch payment details from Stripe API. Manual payments have `deposit_payment_intent_id` values like `manual-{id}`, which are not valid Stripe payment intent IDs, causing the Stripe API call to fail and defaulting the amount to 0.

**Solution**: Implemented hybrid payment fetching that:
- Detects manual payments by checking if `deposit_payment_intent_id` starts with "manual-"
- Fetches amounts from the `manual_payments` table for manual payments
- Continues using Stripe API for Stripe payments
- Handles both ID formats: `manual-{payment_id}` and `manual-{application_id}`

### 2. Stripe Refunds Not Subtracted from Revenue
**Issue**: Revenue calculations showed gross revenue only, not accounting for refunds. This inflated revenue reports and made financial forecasting inaccurate.

**Solution**: Modified `get_revenue_summary` function to:
- Calculate total refunds for each period
- Subtract refunds from revenue to show net revenue
- Include both Stripe and manual refunds in calculations

### 3. Manual Refunds Not Supported
**Issue**: Manual payments (bank transfers, cash, etc.) could not be refunded through the system. Staff had to process refunds outside the system with no way to record them for accounting purposes.

**Solution**: Implemented manual refund recording system that:
- Allows staff to record refunds processed outside the system
- Updates accounting records automatically
- Sends notifications to students
- Maintains audit trail with reference numbers

---

## Implementation Details

### Database Schema Changes

#### Migration: `20250128_extend_refunds_for_manual_refunds.sql`

**Changes to `refunds` table:**

1. **Added `refund_source` column**
   - Type: `TEXT`
   - Values: `'stripe'` | `'manual'`
   - Default: `'stripe'`
   - Purpose: Distinguishes between Stripe API refunds and manually recorded refunds

2. **Made `stripe_refund_id` optional**
   - Changed from `NOT NULL` to nullable
   - Purpose: Manual refunds don't have Stripe refund IDs

3. **Added `manual_refund_reference` column**
   - Type: `TEXT`
   - Purpose: Stores bank transfer reference, receipt number, or other external refund identifier

4. **Added constraints**
   - Stripe refunds: Must have `stripe_refund_id`
   - Manual refunds: Must have `manual_refund_reference` and `stripe_refund_id` must be NULL
   - Unique constraint on `stripe_refund_id` (only when not NULL)

5. **Added indexes**
   - Index on `manual_refund_reference` for quick lookups
   - Index on `refund_source` for filtering

#### Migration: `20250128_update_revenue_summary_subtract_refunds.sql`

**Changes to `get_revenue_summary` function:**

1. **Added return columns**
   - `total_refunds`: Total refunds for the period (NUMERIC)
   - `net_revenue`: Revenue minus refunds (NUMERIC)

2. **Refund calculation logic**
   - Queries `refunds` table for succeeded refunds in the date range
   - Groups refunds by period (month/quarter) matching payment periods
   - Sums `amount_gbp` for all refunds (both Stripe and manual)

3. **Net revenue calculation**
   - Formula: `net_revenue = total_revenue - total_refunds`
   - Ensures accurate financial reporting

---

## Code Changes

### 1. Refunds Page (`src/pages/admin/Refunds.tsx`)

#### Payment Fetching Logic

**Before:**
```typescript
// Only fetched from Stripe
const { data: paymentDetails } = await supabase.functions.invoke(
  "get-payment-intent-details",
  { body: { payment_intent_id: app.deposit_payment_intent_id } }
);
```

**After:**
```typescript
// Detects manual vs Stripe payments
const isManualPayment = app.deposit_payment_intent_id.startsWith("manual-");

if (isManualPayment) {
  // Fetch from manual_payments table
  const manualPayment = await supabase
    .from("manual_payments")
    .select("*")
    .eq("id", manualId)
    .eq("payment_type", "deposit")
    .single();
  
  // Convert GBP to pence
  const amountPence = Math.round(Number(manualPayment.amount) * 100);
} else {
  // Fetch from Stripe API (existing logic)
}
```

#### Manual Refund Processing

**New mutation: `processManualRefund`**
- Records refund in database (no Stripe API call)
- Converts GBP to pence automatically
- Creates activity log entry
- Sends notification to student
- Sets status to 'succeeded' immediately

**Key features:**
- Requires manual refund reference (bank transfer reference, receipt number, etc.)
- Links to application via `application_id`
- Stores refund source as 'manual'
- Updates accounting records automatically

#### UI Updates

1. **Payment Source Badges**
   - Shows "Manual" or "Stripe" badge for each payment
   - Helps staff identify payment type at a glance

2. **Warning Indicators**
   - Shows ⚠️ icon if payment record is missing
   - Displays tooltip with warning message
   - Prevents confusion when data is incomplete

3. **Separate Refund Dialogs**
   - Stripe refunds: Uses existing Stripe refund dialog
   - Manual refunds: New dialog with reference field
   - Automatic routing based on payment source

4. **Manual Refund Dialog Fields**
   - Refund Amount (£) - Pre-filled from payment
   - Refund Reference * - Required (bank transfer reference, receipt number)
   - Refund Reason * - Required

### 2. Type Definitions (`src/hooks/useAccountingReports.ts`)

**Updated `RevenueSummaryItem` type:**
```typescript
export type RevenueSummaryItem = {
  // ... existing fields
  total_refunds: number;    // NEW
  net_revenue: number;      // NEW
};
```

---

## Currency Conversion

### Why Conversion is Needed

The system uses different currency formats in different places:

| Location | Format | Example | Type |
|----------|--------|---------|------|
| `manual_payments.amount` | GBP (decimal) | 99.00 | NUMERIC(10,2) |
| `refunds.amount_pence` | Pence (integer) | 9900 | INTEGER |
| Stripe API | Pence (integer) | 9900 | Integer |
| UI Display | GBP (decimal) | £99.00 | Formatted string |

### Conversion Flow

1. **Manual Payment Entry**: User enters 99.00 GBP → Stored as 99.00 GBP (no conversion)

2. **Creating Refund**: Manual payment 99.00 GBP → Convert to pence: `99.00 * 100 = 9900` → Stored as 9900 pence

3. **Displaying Refund**: Refund 9900 pence → Convert to GBP: `9900 / 100 = 99.00` → Display as £99.00

4. **Stripe API**: Always requires pence format (9900), never GBP (99.00)

### Implementation

```typescript
// Converting GBP to pence when creating refund
const amountPence = Math.round(manualPayment.amount * 100);

// Converting pence to GBP when displaying
const formatCurrency = (amount: number | null) => {
  if (!amount) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount / 100); // Convert from pence
};
```

---

## Workflow

### Stripe Refund Workflow

1. Staff clicks "Refund" on a Stripe payment
2. System opens Stripe refund dialog
3. Staff enters refund amount and reason
4. System calls Stripe API to process refund
5. Stripe processes refund to original payment method
6. System records refund in database
7. System sends notification to student
8. Revenue calculations automatically subtract refund

### Manual Refund Workflow

1. Staff processes refund outside system (bank transfer, cash, etc.)
2. Staff clicks "Refund" on a manual payment
3. System opens manual refund dialog
4. Staff enters:
   - Refund amount (pre-filled)
   - Refund reference (bank transfer reference, receipt number, etc.)
   - Refund reason
5. System records refund in database (no Stripe API call)
6. System sends notification to student
7. Revenue calculations automatically subtract refund

---

## Error Handling

### Missing Manual Payment Records

**Scenario**: `deposit_payment_intent_id = 'manual-{id}'` but no matching `manual_payments` record.

**Handling**:
- Tries to find by payment ID first
- Falls back to finding by application ID
- Returns payment object with `warning` flag
- Displays warning icon (⚠️) in UI
- Logs error for monitoring

### Multiple Manual Payments

**Scenario**: Multiple deposit payments recorded for same application.

**Handling**:
- Finds all manual payments for application
- Sums all deposit amounts
- Uses total for display
- Shows indicator if multiple payments exist

### Invalid ID Format

**Scenario**: `deposit_payment_intent_id` format is unexpected.

**Handling**:
- Validates UUID format
- Handles both `manual-{payment_id}` and `manual-{application_id}` formats
- Returns error with clear message if format invalid

---

## Revenue Calculation Updates

### Before

```sql
-- Only calculated gross revenue
SELECT SUM(amount_paid) AS total_revenue
FROM unified_payment_history
WHERE payment_status = 'succeeded'
```

**Result**: Inflated revenue (didn't account for refunds)

### After

```sql
-- Calculates net revenue (revenue minus refunds)
WITH payment_data AS (
  SELECT SUM(amount_paid) AS total_revenue
  FROM unified_payment_history
  WHERE payment_status = 'succeeded'
),
refund_data AS (
  SELECT SUM(amount_gbp) AS total_refunds
  FROM refunds
  WHERE status = 'succeeded'
)
SELECT 
  total_revenue,
  total_refunds,
  total_revenue - total_refunds AS net_revenue
FROM payment_data, refund_data
```

**Result**: Accurate net revenue accounting for all refunds

---

## Testing Checklist

- [x] Manual payment amounts display correctly in refunds page
- [x] Imported deposit amounts display correctly
- [x] Stripe payment amounts still display correctly
- [x] Manual refund recording works
- [x] Stripe refund processing still works
- [x] Revenue calculations subtract refunds
- [x] Both Stripe and manual refunds appear in refund history
- [x] Student notifications sent for both refund types
- [x] Activity logs created for manual refunds
- [x] Warning indicators show for missing payment records
- [x] Payment source badges display correctly
- [x] Currency conversion works correctly (GBP ↔ pence)

---

## Files Modified

1. **`src/pages/admin/Refunds.tsx`**
   - Updated payment fetching logic
   - Added manual refund processing
   - Added UI for manual refunds
   - Added payment source indicators

2. **`src/hooks/useAccountingReports.ts`**
   - Updated `RevenueSummaryItem` type
   - Added `total_refunds` and `net_revenue` fields

3. **`supabase/migrations/20250128_extend_refunds_for_manual_refunds.sql`**
   - Extended refunds table schema
   - Added refund_source column
   - Made stripe_refund_id optional
   - Added manual_refund_reference column

4. **`supabase/migrations/20250128_update_revenue_summary_subtract_refunds.sql`**
   - Updated get_revenue_summary function
   - Added refund subtraction logic
   - Added net_revenue calculation

---

## Usage Instructions

### Recording a Manual Refund

1. Navigate to **Admin → Refunds**
2. Find the manual payment in the "Refundable Payments" section
3. Click **"Refund"** button
4. The manual refund dialog will open automatically
5. Enter:
   - **Refund Amount**: Pre-filled from payment (can be adjusted)
   - **Refund Reference**: Bank transfer reference, receipt number, or other identifier
   - **Refund Reason**: Reason for the refund
6. Click **"Record Refund"**
7. System will:
   - Record refund in database
   - Update accounting records
   - Send notification to student
   - Create activity log entry

### Viewing Refund Impact on Revenue

1. Navigate to **Admin → Accounting Reports**
2. Select **"Revenue Summary"** tab
3. Revenue report now shows:
   - **Total Revenue**: Gross revenue (payments)
   - **Total Refunds**: All refunds (Stripe + manual)
   - **Net Revenue**: Revenue minus refunds

---

## Benefits

1. **Accurate Financial Reporting**
   - Revenue calculations now show net revenue
   - Accounting reports reflect true financial position

2. **Complete Refund Tracking**
   - All refunds recorded in one place
   - Both Stripe and manual refunds tracked
   - Audit trail maintained

3. **Improved User Experience**
   - Manual payment amounts now display correctly
   - Clear indicators for payment sources
   - Warning system for data issues

4. **Operational Efficiency**
   - Staff can record manual refunds easily
   - Automatic accounting updates
   - Student notifications automated

---

## Future Enhancements

Potential improvements for future consideration:

1. **Refund Approval Workflow**
   - Multi-level approval for large refunds
   - Approval history tracking

2. **Partial Refunds**
   - Support for partial refunds of manual payments
   - Track remaining refundable amount

3. **Refund Analytics**
   - Refund trends and patterns
   - Refund reasons analysis
   - Impact on revenue forecasting

4. **Integration with Accounting Systems**
   - Export refund data to accounting software
   - Automated reconciliation

---

## Support

For issues or questions regarding the refund system:

1. Check error logs in browser console
2. Verify manual payment records exist in database
3. Ensure refunds table has correct schema (run migrations)
4. Check that revenue summary function is updated

---

**Document Version**: 1.0  
**Last Updated**: January 28, 2025  
**Author**: System Implementation Team

