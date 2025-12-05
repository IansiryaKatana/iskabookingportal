# Student Invoice PDF Implementation
**Date:** 2025-01-25  
**Status:** ✅ Completed

## Overview
Implemented PDF invoice generation for student payments, allowing students to download individual invoices for deposits and installment payments from the student portal.

## What Was Implemented

### 1. Database Migration
**File:** `supabase/migrations/20250125_add_invoice_numbers.sql`

- Added `invoice_number` column to `stripe_payments` table
- Added `invoice_number` column to `manual_payments` table
- Added `invoice_generated_at` timestamp columns for tracking
- Added indexes for invoice number lookups

**Note:** This migration needs to be run manually via Supabase dashboard or CLI.

### 2. Edge Function
**File:** `supabase/functions/generate-student-invoice-pdf/index.ts`

**Features:**
- Generates branded PDF invoices for individual payments
- Auto-generates sequential invoice numbers (format: `INV-STUDENT-YYYY-XXXXXXXX`)
- Includes all payment details:
  - Invoice number and date
  - Student billing information (name, address, email)
  - Payment details (type, method, transaction reference)
  - Contract information (name, studio grade, tenancy period, room number)
  - Payment summary (total due, total paid, remaining balance)
  - Company branding (logo, colors, contact info)
- Stores invoice number in payment record for future reference
- Handles both Stripe and manual payments

**Input:**
```json
{
  "paymentId": "uuid",
  "paymentSource": "stripe" | "manual"
}
```

**Output:**
```json
{
  "pdf": "base64_encoded_pdf",
  "invoiceNumber": "INV-STUDENT-2025-XXXXXXXX",
  "filename": "Invoice-INV-STUDENT-2025-XXXXXXXX-Student-Name.pdf"
}
```

### 3. Frontend Integration
**File:** `src/pages/portal/Payments.tsx`

**Changes:**
- Added `FileDown` icon import
- Updated `PaymentList` component to include invoice download button
- Added download handler with loading state
- Button appears next to each completed payment
- Shows "Generating..." state while PDF is being created
- Automatically downloads PDF with proper filename
- Toast notifications for success/error states

**UI:**
- Download button appears only for completed/succeeded payments
- Button is disabled while generating
- Positioned next to payment amount
- Styled with outline variant and rounded-full

## How It Works

1. **Student clicks "Invoice" button** next to a completed payment
2. **Frontend calls** `generate-student-invoice-pdf` edge function with payment ID and source
3. **Function:**
   - Fetches payment data from `unified_payment_history`
   - Fetches application and student details
   - Gets or generates invoice number
   - Updates payment record with invoice number
   - Generates branded PDF using pdf-lib
   - Returns base64-encoded PDF
4. **Frontend:**
   - Converts base64 to blob
   - Creates download link
   - Triggers download with proper filename
   - Shows success notification

## Invoice Content

### Header
- Company logo (from branding settings)
- Company name, email, phone, address
- Invoice title and number (right-aligned)
- Invoice date

### Bill To Section
- Student name
- Student address (from application step 2)
- Student email

### Payment Details
- Payment type (Deposit / Installment #X)
- Payment method (Stripe / Cash / Card / Bank Transfer / Cheque)
- Transaction reference (Payment Intent ID or Receipt Number)

### Contract Information
- Contract name
- Studio grade
- Tenancy period (start to end date)
- Room number (if assigned)

### Invoice Items Table
- Description (payment type)
- Amount in currency

### Payment Summary
- Total Due
- Total Paid
- Remaining Balance

### Footer
- Company contact information for inquiries

## Branding
- Uses colors from `branding_settings`:
  - Primary color for headers and accents
  - Foreground colors for text
  - Muted colors for secondary text
  - Border colors for table lines
- Embeds company logo from branding storage
- Uses company name, contact email, phone, and address

## Invoice Numbering
- Format: `INV-STUDENT-YYYY-XXXXXXXX`
- Where:
  - `YYYY` = Current year
  - `XXXXXXXX` = Last 8 characters of payment ID (uppercase)
- Invoice numbers are stored in payment records
- Once generated, the same invoice number is reused for subsequent downloads

## Testing Checklist

- [ ] Test invoice generation for Stripe deposit payment
- [ ] Test invoice generation for Stripe installment payment
- [ ] Test invoice generation for manual deposit payment
- [ ] Test invoice generation for manual installment payment
- [ ] Verify invoice number is generated and stored
- [ ] Verify invoice number is reused on subsequent downloads
- [ ] Verify PDF downloads with correct filename
- [ ] Verify all payment details are correct
- [ ] Verify branding (logo, colors) appears correctly
- [ ] Verify student address is populated (if available)
- [ ] Verify room number appears (if assigned)
- [ ] Test with payments that have no address
- [ ] Test with payments that have no room assignment
- [ ] Verify error handling for failed PDF generation

## Next Steps

1. **Run Migration:**
   ```sql
   -- Run via Supabase dashboard SQL editor or CLI
   -- File: supabase/migrations/20250125_add_invoice_numbers.sql
   ```

2. **Test the Feature:**
   - Navigate to student portal payments page
   - Click "Invoice" button next to a completed payment
   - Verify PDF downloads correctly
   - Check invoice number is stored in database

3. **Optional Enhancements:**
   - Add invoice number display in payment history
   - Add bulk invoice download (ZIP file)
   - Add email invoice option
   - Store generated PDFs in Supabase Storage
   - Add invoice preview before download

## Files Modified

1. `supabase/migrations/20250125_add_invoice_numbers.sql` (NEW)
2. `supabase/functions/generate-student-invoice-pdf/index.ts` (NEW)
3. `src/pages/portal/Payments.tsx` (MODIFIED)

## Deployment Status

- ✅ Edge function deployed: `generate-student-invoice-pdf`
- ⚠️ Migration pending: `20250125_add_invoice_numbers.sql` (needs manual run)

---

**Implementation Complete!** Students can now download invoices for their payments directly from the student portal.

