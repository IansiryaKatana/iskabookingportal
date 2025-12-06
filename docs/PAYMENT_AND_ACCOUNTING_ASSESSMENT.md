# Payment & Accounting System Assessment
**Date:** 2025-01-25  
**Purpose:** Comprehensive assessment of payment flows, accounting needs, and system gaps

---

## 1. Manual Payment Implementation

### Current Implementation ✅

**Location:** `src/components/admin/ManualPaymentDialog.tsx`

**How it works:**
1. Staff opens dialog from Applications or ApplicationDetail page
2. Selects payment type: `deposit` or `instalment`
3. For instalments: Selects specific instalment from `contract_payment_schedule`
4. Enters:
   - Amount (auto-filled from deposit/instalment amount)
   - Payment method: `cash`, `card`, `bank_transfer`, or `cheque`
   - Receipt number (optional)
   - Payment date (defaults to today)
   - Notes (optional)
5. Creates record in `manual_payments` table

**Database Table:** `manual_payments`
- `payment_type`: 'deposit' | 'instalment'
- `payment_method`: 'cash' | 'card' | 'bank_transfer' | 'cheque'
- `instalment_id`: Links to `contract_payment_schedule` if instalment
- `amount`, `receipt_number`, `payment_date`, `notes`
- `recorded_by`: Staff user ID

**Integration:**
- Included in `unified_payment_history` view (combines Stripe + manual payments)
- Visible in Payment History admin page
- Counted in payment summaries and fully paid calculations

---

## 2. Bank Transfer Payments

### Current Implementation ✅

**Bank transfers are logged as manual payments:**
- When staff records a payment, they select `payment_method = 'bank_transfer'`
- This creates a record in `manual_payments` table with:
  - `payment_method: 'bank_transfer'`
  - `payment_type: 'deposit'` or `'instalment'`
  - All other payment details (amount, date, receipt number, notes)

**Status:** ✅ Fully implemented - bank transfers are just a payment method option in manual payment recording.

---

## 3. Deposit Logging at Application Time

### Current Implementation ✅

**When a student pays deposit during application:**

1. **Stripe Payment Flow:**
   - Student creates payment intent via `create-payment` edge function
   - Payment processed through Stripe
   - **Webhook handler** (`stripe-webhook/index.ts`) automatically:
     - Creates record in `stripe_payments` table
     - Updates `student_applications.status` to `'awaiting_signature'`
     - Stores `deposit_payment_intent_id` in application
     - Sends email notifications

2. **Manual Payment Flow:**
   - Staff can record deposit manually via `ManualPaymentDialog`
   - Creates record in `manual_payments` table
   - Links to application via `application_id`

**Both flows are logged:**
- Stripe payments → `stripe_payments` table
- Manual payments → `manual_payments` table
- Both appear in `unified_payment_history` view

**Status:** ✅ Fully implemented - deposits are automatically logged via webhook or manually by staff.

---

## 4. Installment Payments Not Showing Without Sync Button ❌

### Problem Identified

**Current Issue:**
- Installment payments made through Stripe don't appear in payment history until "Sync Missing Payments" button is clicked
- This happens because:
  1. Webhook creates `stripe_payments` record ✅
  2. But `unified_payment_history` view may not immediately reflect it
  3. Frontend cache may not refresh automatically

**Root Cause Analysis:**

1. **Webhook Handler** (`stripe-webhook/index.ts` lines 126-164):
   - ✅ Creates `stripe_payments` record for installments
   - ✅ Includes `instalment_id` in metadata
   - ❌ **Does NOT invalidate frontend cache**

2. **Frontend** (`src/pages/portal/Payments.tsx`):
   - Uses `useUnifiedPayments` hook to fetch payment history
   - React Query caches the data
   - ❌ **No automatic refetch after webhook processes payment**

3. **Sync Function** (`sync-payment-from-stripe/index.ts`):
   - Manually syncs payments from Stripe API
   - Only called when button is clicked

### Recommended Fix

**Option 1: Auto-sync on Payment Success (Recommended)**
- After successful Stripe payment, immediately call sync function
- Update `handlePaymentSuccess` in `Payments.tsx` to trigger sync

**Option 2: Real-time Updates**
- Use Supabase Realtime subscriptions to listen for new `stripe_payments` records
- Automatically refresh payment history when new payment is detected

**Option 3: Polling**
- Increase polling frequency in `Payments.tsx` (currently 60 seconds)
- Reduce to 10-15 seconds for faster updates

**Implementation Priority:** 🔴 HIGH - This is a UX issue affecting student experience.

---

## 5. DocuSign Tenancy Agreement - Application Info Not Loading ❌

### Problem Identified

**Current Implementation:**
- DocuSign envelope creation in `docusign-envelopes/index.ts`
- Template roles and text tabs are populated
- **BUT:** The document template itself may not have the correct field mappings

**What's Currently Populated:**
```typescript
// Lines 678-688 in docusign-envelopes/index.ts
const textTabs = [
  { tabLabel: "student_phone", value: studentPhone },
  { tabLabel: "academic_year", value: academicYear },
  { tabLabel: "tenant_name", value: tenantNameForDoc },
  { tabLabel: "room_number", value: roomNumber },
  { tabLabel: "tenancy_period", value: tenancyPeriod },
  { tabLabel: "total_rent", value: totalRent },
  { tabLabel: "plan_summary", value: planSummary },
];
```

**What's Missing (Based on Image):**
- ✅ Tenant Name (Dua Akhtar) - **Present**
- ✅ Room/Flat Number - **Present** (but may show "To Be Advise" if studio not assigned)
- ✅ Tenancy Period - **Present**
- ✅ Weekly Rate - **MISSING** ❌
- ✅ Deposit Amount - **MISSING** ❌
- ✅ Total Rent - **Present** (but may be incorrect if percentage-based)
- ✅ Payment Schedule (3 installments with dates) - **Partially present** (plan_summary)

### Required Fixes

1. **Add Weekly Rate:**
   ```typescript
   const weeklyRate = application.contract?.weekly_price || 
                      (application.contract?.studio_grade?.weekly_price);
   // Add to textTabs: { tabLabel: "weekly_rate", value: formatGBP(weeklyRate * 100) }
   ```

2. **Add Deposit Amount:**
   ```typescript
   const depositAmount = application.contract?.deposit_override || 
                         application.contract?.payment_plan?.deposit_amount || 
                         99;
   // Add to textTabs: { tabLabel: "deposit_amount", value: formatGBP(depositAmount * 100) }
   ```

3. **Fix Payment Schedule:**
   - Currently shows percentages, but should show actual amounts
   - Need to calculate actual installment amounts from contract total
   - Format as: "22nd August 2026: £3,075; 1st January 2027: £3,075; 1st April 2027: £3,075"

4. **Verify DocuSign Template Field Names:**
   - Ensure DocuSign template has fields matching these `tabLabel` values:
     - `tenant_name`
     - `room_number`
     - `tenancy_period`
     - `weekly_rate` (NEW)
     - `deposit_amount` (NEW)
     - `total_rent`
     - `payment_schedule` (or `plan_summary`)

**Implementation Priority:** 🔴 HIGH - Legal document must be accurate.

---

## 6. Accounting Needs Assessment

### What Accountants Typically Need

**1. Financial Reports:**
- ✅ **Payment History Report** - Available in admin
- ✅ **Weekly Payment Report** - Available (`WeeklyPaymentReport.tsx`)
- ❌ **Monthly/Quarterly Revenue Reports** - NOT IMPLEMENTED
- ❌ **Accounts Receivable (AR) Report** - NOT IMPLEMENTED
- ❌ **Outstanding Balances Report** - NOT IMPLEMENTED
- ❌ **Deposit vs Installment Breakdown** - NOT IMPLEMENTED

**2. Export Capabilities:**
- ✅ CSV export for Fully Paid Students
- ✅ CSV export for Payment History
- ❌ **Excel export with formulas** - NOT IMPLEMENTED
- ❌ **PDF financial statements** - NOT IMPLEMENTED
- ❌ **Bank reconciliation exports** - NOT IMPLEMENTED

**3. Audit Trail:**
- ✅ Payment records in `stripe_payments` and `manual_payments`
- ✅ `staff_activity_logs` for admin actions
- ❌ **Payment modification history** - NOT IMPLEMENTED
- ❌ **Refund audit trail** - Partially implemented (refunds table exists)

**4. Reconciliation:**
- ❌ **Stripe reconciliation report** - NOT IMPLEMENTED
- ❌ **Manual payment reconciliation** - NOT IMPLEMENTED
- ❌ **Bank statement import/matching** - NOT IMPLEMENTED

**5. Tax & Compliance:**
- ❌ **VAT reports** - NOT IMPLEMENTED
- ❌ **Invoice numbering system** - NOT IMPLEMENTED
- ❌ **Tax year summaries** - NOT IMPLEMENTED

**6. Partner Payments:**
- ✅ Commission tracking in `partner_referrals`
- ❌ **Partner payment invoices** - NOT IMPLEMENTED (see section 8)
- ❌ **Commission payment history** - NOT IMPLEMENTED

---

## 7. Missing Reports for Your Use Case

### Recommended Reports to Implement

**1. Accounts Receivable (AR) Report** 🔴 HIGH PRIORITY
- **Purpose:** Track all outstanding balances
- **Columns:**
  - Student Name, Email
  - Application ID
  - Contract Total
  - Total Paid
  - Outstanding Balance
  - Next Payment Due Date
  - Days Overdue
- **Filters:** Academic Year, Contract, Payment Status, Overdue Status

**2. Revenue Summary Report** 🔴 HIGH PRIORITY
- **Purpose:** Monthly/Quarterly revenue breakdown
- **Sections:**
  - Total Revenue (Deposits + Installments)
  - Revenue by Payment Method (Stripe vs Manual)
  - Revenue by Contract Type
  - Revenue by Studio Grade
  - Revenue Trends (Month-over-Month)
- **Export:** Excel with charts

**3. Outstanding Balances Report** 🟡 MEDIUM PRIORITY
- **Purpose:** Identify students with unpaid installments
- **Columns:**
  - Student Name
  - Application ID
  - Total Due
  - Paid
  - Outstanding
  - Overdue Installments Count
  - Last Payment Date
- **Filters:** Overdue only, Payment plan, Academic year

**4. Deposit vs Installment Breakdown** 🟡 MEDIUM PRIORITY
- **Purpose:** Understand payment distribution
- **Metrics:**
  - Total Deposits Collected
  - Total Installments Collected
  - Average Deposit Amount
  - Average Installment Amount
  - Deposit Collection Rate
  - Installment Collection Rate

**5. Bank Reconciliation Report** 🟡 MEDIUM PRIORITY
- **Purpose:** Match system payments with bank statements
- **Columns:**
  - Payment Date
  - Payment Method
  - Amount
  - Reference Number (Receipt/Transaction ID)
  - Status (Matched/Unmatched)
  - Bank Statement Line Item

**6. Partner Commission Report** 🟢 LOW PRIORITY
- **Purpose:** Track partner payouts
- **Columns:**
  - Partner Name
  - Referrals Count
  - Total Commission Earned
  - Paid Commission
  - Pending Commission
  - Payment Status

---

## 8. Partner Payment Invoice PDF ❌ NOT IMPLEMENTED

### Current State

**What Exists:**
- ✅ Partner commission tracking in `partner_referrals` table
- ✅ Commission amount calculation
- ✅ Commission status tracking (pending, approved, paid, cancelled)
- ✅ Partner dashboard showing commissions
- ❌ **No PDF invoice generation for partner payments**

### Required Implementation

**1. Create Edge Function:** `generate-partner-invoice-pdf`
- Similar to `generate-payment-history-pdf`
- Input: `partner_id`, `commission_perferral_id` (or date range)
- Output: Branded PDF invoice

**2. Invoice Content:**
- Company logo and branding (from `branding_settings`)
- Invoice number (sequential, e.g., INV-PARTNER-2025-001)
- Invoice date
- Partner details (name, contact, address)
- Commission period
- Commission breakdown:
  - Referral date
  - Student name
  - Application ID
  - Contract value
  - Commission rate
  - Commission amount
- Subtotal
- VAT (if applicable)
- Total amount due
- Payment terms
- Bank details for payment

**3. Database Changes:**
- Add `invoice_number` to `partner_referrals` or create `partner_invoices` table
- Track invoice generation date
- Link invoices to commission payments

**4. Admin Interface:**
- Add "Generate Invoice" button in Partner Commissions page
- Allow bulk invoice generation for multiple commissions
- Download/email invoice to partner

**Implementation Priority:** 🟡 MEDIUM - Useful for partner relationships but not critical for operations.

---

## 9. Student Invoice PDF for Deposits/Installments ❌ NOT IMPLEMENTED

### Current State

**What Exists:**
- ✅ Payment History PDF (`generate-payment-history-pdf`) - Shows all payments
- ✅ Payment records in database
- ❌ **No individual invoice PDF for each payment (deposit or installment)**

### Required Implementation

**1. Create Edge Function:** `generate-student-invoice-pdf`
- Input: `payment_id` (from `unified_payment_history` or `stripe_payments`/`manual_payments`)
- Output: Branded PDF invoice for that specific payment

**2. Invoice Content:**
- Company logo and branding
- Invoice number (e.g., INV-STUDENT-2025-001)
- Invoice date (payment date)
- Student details (name, email, address from application)
- Payment details:
  - Payment type (Deposit / Installment #X)
  - Payment method (Stripe / Cash / Bank Transfer / Card / Cheque)
  - Amount paid
  - Payment date
  - Transaction reference (Stripe Payment Intent ID / Receipt Number)
- Contract details:
  - Studio grade
  - Room number (if assigned)
  - Tenancy period
  - Total contract value
- Payment summary:
  - Total due
  - Deposit paid
  - Installments paid
  - Remaining balance
- VAT breakdown (if applicable)
- Payment terms
- Company contact information

**3. Student Portal Integration:**
- Add "Download Invoice" button next to each payment in Payments page
- Show invoice icon for each completed payment
- Allow download of all invoices as ZIP

**4. Database Changes:**
- Add `invoice_number` to `stripe_payments` and `manual_payments` tables
- Track invoice generation timestamp
- Store invoice PDF in Supabase Storage (optional)

**Implementation Priority:** 🔴 HIGH - Students need invoices for their records and potential reimbursement claims.

---

## Summary & Recommendations

### Immediate Fixes (High Priority) 🔴

1. **Fix Installment Payment Visibility**
   - Implement auto-sync after payment success
   - Add real-time updates or reduce polling interval

2. **Fix DocuSign Contract Population**
   - Add weekly rate and deposit amount to text tabs
   - Fix payment schedule to show actual amounts, not percentages
   - Verify template field mappings

3. **Implement Student Invoice PDFs**
   - Create `generate-student-invoice-pdf` edge function
   - Add download buttons in student portal
   - Generate invoices for deposits and installments

### Short-term Enhancements (Medium Priority) 🟡

4. **Implement Partner Invoice PDFs**
   - Create `generate-partner-invoice-pdf` edge function
   - Add invoice generation in admin partner commissions page

5. **Add Accounting Reports**
   - Accounts Receivable Report
   - Revenue Summary Report
   - Outstanding Balances Report

### Long-term Enhancements (Low Priority) 🟢

6. **Advanced Accounting Features**
   - Bank reconciliation
   - VAT reporting
   - Tax year summaries
   - Excel exports with formulas

---

## Implementation Order

1. ✅ **Week 1:** Fix installment payment visibility + DocuSign contract fixes
2. ✅ **Week 2:** Student invoice PDF generation
3. ✅ **Week 3:** Partner invoice PDF generation
4. ✅ **Week 4:** Accounting reports (AR, Revenue, Outstanding)

---

**Next Steps:**
1. Review this assessment
2. Prioritize which items to implement first
3. I'll create detailed implementation plans for each item


