# Manual Payment Entry System - Implementation Complete

**Date:** 2025-01-28  
**Status:** ✅ Implemented and Tested

---

## Overview

The Manual Payment Entry System allows accountants to record payments made outside the system (cash, card, bank transfer, cheque) before student applications exist. Students can then verify these payments using receipt/cheque numbers in Step 5 of the application wizard, enabling them to submit applications without needing to pay the deposit online.

---

## Implementation Summary

### Database Changes

**Migration:** `20250128_manual_payment_entry_system.sql`

1. **Made `application_id` nullable** in `manual_payments` table
   - Allows payments to be recorded before applications exist
   - Payments with `application_id = NULL` are "orphaned" until linked

2. **Added unique index on `receipt_number`**
   - Ensures receipt numbers are unique across all payments
   - Enables fast lookup for verification
   - Only applies where `receipt_number IS NOT NULL`

3. **Added index for orphaned payments**
   - Optimizes queries for unlinked payments
   - Index on `(receipt_number, payment_date, payment_type) WHERE application_id IS NULL`

4. **Created RPC Functions:**
   - `verify_payment_by_receipt(p_receipt_number TEXT)` – Verifies payment by receipt number, returns payment details and linking status
   - `link_payment_to_application(p_receipt_number TEXT, p_application_id UUID)` – Links unlinked payment to application, updates deposit status

### Frontend Implementation

#### 1. Admin Manual Payment Entry Page
**Location:** `/admin/manual-payment-entry`  
**File:** `src/pages/admin/ManualPaymentEntry.tsx`

**Features:**
- Form to create orphaned payments (no application_id required)
- Required fields: Payment type, amount, payment method, receipt number (unique), payment date
- Optional fields: Notes
- List view of unlinked payments with search functionality
- Shows payment details: amount, method, receipt number, dates

**Navigation:**
- Added to Finance section in AdminLayout
- Accessible to staff and superadmin roles

#### 2. Payment Verification Hook
**File:** `src/hooks/useVerifyPayment.ts`

- Real-time validation similar to referral code validation
- Returns payment details including:
  - Payment type (deposit/instalment)
  - Amount
  - Payment method
  - Payment date
  - Linking status (is_linked)
- Caching: 30 seconds stale time

#### 3. Updated Manual Payment Hook
**File:** `src/hooks/useManualPayment.ts`

**Changes:**
- `applicationId` is now optional in `CreateManualPaymentInput`
- Added `useLinkPaymentToApplication()` hook for linking payments
- Automatically updates deposit status when deposit payment is linked
- Updates Step 5 payload to mark deposit as paid

#### 4. Step 5 Integration
**File:** `src/pages/portal/ApplicationWizard.tsx`

**New Features:**
- "I've already paid the deposit" checkbox
- Receipt/cheque number input field (shown when checkbox is checked)
- Real-time validation with visual indicators:
  - ✓ Green checkmark for valid unlinked payment
  - ✗ Red X for invalid/already linked payment
  - Spinner while validating
- Shows payment details when verified:
  - Amount, date, payment method
  - Success message: "Payment verified: £X paid on [date] via [method]"
- Payment linking happens automatically on Step 5 submission
- Updated `depositPaid` logic to include verified payments
- Submit button enabled when payment is verified (even if not yet linked)

**Schema Updates:**
- Added `already_paid_deposit: boolean` to payment schema
- Added `receipt_number: string` to payment schema
- Added `deposit_paid: boolean` to payment schema (for tracking)

---

## User Flows

### Flow 1: Accountant Records Payment

1. Accountant navigates to `/admin/manual-payment-entry`
2. Clicks "New Payment" button
3. Fills in form:
   - Payment Type: Deposit
   - Amount: £500 (exact amount paid)
   - Payment Method: Cheque
   - Receipt/Cheque Number: CHEQUE123 (required, must be unique)
   - Payment Date: [date]
   - Notes: [optional]
4. Clicks "Record Payment"
5. Payment is saved with `application_id = NULL`
6. Payment appears in "Unlinked Payments" list

### Flow 2: Student Verifies Payment

1. Student reaches Step 5 (Payment & Guarantor)
2. Sees deposit amount and "Pay deposit online" button
3. Checks "I've already paid the deposit" checkbox
4. Receipt number input field appears
5. Student enters receipt number: "CHEQUE123"
6. System validates in real-time:
   - Shows spinner while validating
   - Shows ✓ and payment details if valid
   - Shows ✗ and error if invalid/already linked
7. If valid, student can proceed to submit Step 5
8. On submission:
   - Payment is automatically linked to application
   - Deposit status is updated
   - Application can be submitted without online payment

---

## Security & Validation

### Receipt Number Validation
- ✅ Must be unique (database constraint)
- ✅ Only unlinked payments can be linked
- ✅ Only deposit payments can be used for deposit verification
- ✅ Prevents duplicate linking attempts
- ✅ Real-time validation prevents invalid submissions

### RLS Policies
- ✅ Staff can view and manage all payments (including orphaned)
- ✅ Students can only view payments linked to their applications
- ✅ Students cannot see orphaned payments (security by design)
- ✅ RPC functions use `SECURITY DEFINER` for proper access control

### Error Handling
- Payment not found: Shows error message
- Payment already linked: Shows error, prevents linking
- Invalid payment type: Shows error if trying to use instalment payment for deposit
- Duplicate receipt number: Database constraint prevents creation

---

## Database Schema

### `manual_payments` Table

```sql
CREATE TABLE public.manual_payments (
  id UUID PRIMARY KEY,
  application_id UUID REFERENCES student_applications(id) ON DELETE CASCADE, -- NULLABLE
  payment_type TEXT CHECK (payment_type IN ('deposit', 'instalment')),
  instalment_id UUID REFERENCES contract_payment_schedule(id),
  amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'cheque')),
  receipt_number TEXT, -- UNIQUE (where not null)
  payment_date DATE NOT NULL,
  recorded_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```

### Indexes

- `idx_manual_payments_receipt_number_unique` – Unique index on `receipt_number` (where not null)
- `idx_manual_payments_orphaned` – Index on `(receipt_number, payment_date, payment_type)` where `application_id IS NULL`
- `idx_manual_payments_application` – Index on `application_id` (existing)
- `idx_manual_payments_instalment` – Index on `instalment_id` (existing)
- `idx_manual_payments_date` – Index on `payment_date` (existing)

### RPC Functions

**`verify_payment_by_receipt(p_receipt_number TEXT)`**
- Returns payment details if found
- Includes `is_linked` boolean flag
- Returns NULL if payment not found
- Uses `SECURITY DEFINER` for access control

**`link_payment_to_application(p_receipt_number TEXT, p_application_id UUID)`**
- Links unlinked payment to application
- Only works if payment is not already linked
- Returns payment ID on success
- Raises exception if payment not found or already linked
- Uses `SECURITY DEFINER` for access control

---

## API & Hooks

### `useVerifyPayment(receiptNumber: string | null | undefined)`

**Returns:**
```typescript
{
  id: string;
  payment_type: "deposit" | "instalment";
  amount: number;
  payment_method: "cash" | "card" | "bank_transfer" | "cheque";
  payment_date: string;
  is_linked: boolean;
  application_id: string | null;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
} | null
```

**Features:**
- Real-time validation
- 30-second cache
- Enabled only when receipt number is provided

### `useLinkPaymentToApplication()`

**Mutation:**
```typescript
mutateAsync({
  receiptNumber: string;
  applicationId: string;
})
```

**Actions:**
- Links payment to application
- Updates `deposit_payment_intent_id` to `manual-{payment_id}`
- Updates Step 5 payload to mark deposit as paid
- Updates application status if needed
- Logs activity for audit trail

---

## UI/UX Features

### Admin Page
- Clean form interface matching existing admin pages
- Collapsible form (show/hide)
- Search functionality for unlinked payments
- Payment cards showing all relevant details
- Mobile-responsive layout

### Student Step 5
- Checkbox toggle for "I've already paid the deposit"
- Smooth reveal of receipt number input
- Real-time validation with visual feedback
- Payment details display when verified
- Clear error messages for invalid/already linked payments
- Helper text explaining the process

---

## Testing Checklist

- [x] Accountant can create orphaned payment
- [x] Receipt number uniqueness enforced
- [x] Student can verify payment by receipt number
- [x] Real-time validation works correctly
- [x] Payment linking happens on Step 5 submission
- [x] Deposit status updates correctly
- [x] Application can be submitted after payment verification
- [x] Already linked payments show error
- [x] Invalid receipt numbers show error
- [x] RLS policies prevent unauthorized access
- [x] Search functionality works on admin page
- [x] Mobile responsive design

---

## Future Enhancements (Optional)

1. **Email Matching** – Add optional email field for additional security
2. **Payment Amount Validation** – Warn if payment amount doesn't match deposit requirement
3. **Bulk Payment Import** – CSV import for multiple payments
4. **Payment History for Orphaned Payments** – Show linking history
5. **Auto-link on Application Creation** – If receipt number stored in Step 1 (future feature)

---

## Related Documentation

- `docs/MANUAL_PAYMENT_ENTRY_RECOMMENDATIONS.md` – Original assessment and recommendations
- `docs/architecture-spec.md` – System architecture specification
- `supabase/migrations/20250128_manual_payment_entry_system.sql` – Database migration

---

**Implementation Status:** ✅ Complete and Tested  
**Last Updated:** 2025-01-28

