# Bulk Application Import - Implementation Guide

## Overview

This document provides the complete implementation guide for bulk importing student applications. This is part of the comprehensive bulk import system for onboarding new client organizations.

## Architecture

### Components

1. **Frontend**: `/admin/data-import` page with Applications import type
2. **CSV Template Generator**: Generates template with current application data
3. **Database Function**: `bulk_import_student_applications()` - Handles data insertion
4. **Edge Function**: `bulk-import-data` - Processes CSV and orchestrates import

## Application Step Payload Structure

### Step 1: Personal Details
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "date_of_birth": "2000-01-15",
  "age": "24",
  "ethnicity": "White",
  "gender": "Male",
  "ucas_id": "1234567890",
  "country": "United Kingdom",
  "referral_code": "PARTNER123"
}
```

### Step 2: Contact Information
```json
{
  "email": "john.doe@example.com",
  "mobile": "+44 7700 900123",
  "address_line_1": "123 Main Street",
  "address_line_2": "Apartment 4B",
  "postcode": "SW1A 1AA",
  "town": "London"
}
```

### Step 3: Academic & Additional Info
```json
{
  "year_of_study": "1st Year",
  "field_of_study": "Computer Science",
  "disabled": "yes",
  "smoker": "no",
  "medical_requirements": "None",
  "entry_into_uk": "UK Citizen"
}
```

### Step 4: Documentation
```json
{
  "uk_citizen": "yes",
  "passport_document": "documents/{student_id}/{application_id}/passport/{filename}.pdf",
  "visa_document": "documents/{student_id}/{application_id}/visa/{filename}.pdf"
}
```

### Step 5: Payment Plan & Guarantor
```json
{
  "selected_plan_id": "uuid-of-payment-plan",
  "guarantor_name": "Jane Doe",
  "guarantor_email": "jane.doe@example.com",
  "guarantor_phone": "+44 7700 900456",
  "guarantor_relationship": "Mother",
  "guarantor_dob": "1975-06-20",
  "witness_name": "Bob Smith",
  "witness_email": "bob.smith@example.com",
  "witness_phone": "+44 7700 900789",
  "utility_bill": "documents/{student_id}/{application_id}/utility/{filename}.pdf",
  "id_document": "documents/{student_id}/{application_id}/id/{filename}.pdf",
  "bank_statement": "documents/{student_id}/{application_id}/bank/{filename}.pdf",
  "consent": true
}
```

### Step 6: Agreement & Signing
```json
{
  // For historical imports, this is usually empty or contains signed contract path
  "contract_signed": true,
  "contract_pdf_path": "contracts/{application_id}/signed-{timestamp}.pdf"
}
```

## CSV Template Structure

### Minimal Template (Required Fields)
```csv
email,first_name,last_name,date_of_birth,mobile,contract_slug,studio_number,status
john.doe@example.com,John,Doe,2000-01-15,+44 7700 900123,silver-45-week-2024-25,101,confirmed
```

### Complete Template (All Fields)
```csv
email,first_name,last_name,date_of_birth,ethnicity,gender,ucas_id,country,
mobile,address_line_1,address_line_2,postcode,town,
year_of_study,field_of_study,disabled,smoker,medical_requirements,entry_into_uk,
uk_citizen,
contract_slug,studio_number,payment_plan_name,
guarantor_name,guarantor_email,guarantor_phone,guarantor_relationship,guarantor_dob,
witness_name,witness_email,witness_phone,
status,submitted_at,confirmed_at,
passport_path,visa_path,utility_bill_path,id_document_path,bank_statement_path,
contract_pdf_path,
referral_code,deposit_amount,deposit_paid_date
```

## Implementation Steps

### 1. Add Applications to Import Page

Add to `src/pages/admin/DataImport.tsx`:
```typescript
{
  value: "applications",
  label: "Applications",
  description: "Import historical student applications",
  dependencies: ["contracts", "studios"],
  icon: "📋",
}
```

### 2. Create CSV Template Generator

Location: `src/utils/csvTemplateGenerator.ts`

Function: `generateApplicationsTemplate()`
- Queries existing applications from database
- Flattens step payloads into CSV columns
- Includes document paths
- Returns formatted CSV string

### 3. Create Database Function

Location: `supabase/migrations/YYYYMMDD_bulk_import_applications.sql`

Function: `bulk_import_student_applications(p_data JSONB, p_imported_by UUID)`
- Creates/finds auth users
- Validates dependencies (contracts, studios)
- Creates applications
- Creates application steps (1-6)
- Creates document records
- Creates payment records (if provided)
- Links partner referrals (if applicable)

### 4. Update Edge Function

Location: `supabase/functions/bulk-import-data/index.ts`

Add case for `import_type === 'applications'`:
- Parse CSV with application fields
- Call database function
- Handle user creation
- Handle document paths
- Return detailed results

## User Creation Strategy ✅ IMPLEMENTED

### For Historical Applications (Placeholder Users + Bulk Invitations)

**Phase 1: During Import**
1. **Check if user exists** (by email, case-insensitive) using `listUsers()` and filter
   - If exists: Use existing user ID, update profile if needed
   - If not: Create placeholder user

2. **Create placeholder users**:
   - Generate random secure password
   - Create auth user via Admin API
   - Set profile: `role = 'student'`
   - Sync `first_name` and `last_name` from CSV
   - Mark email as verified (`email_confirm: true`)
   - Set `account_status: 'pending_activation'` in user metadata
   - **NO emails sent during import**

**Phase 2: After Import (Bulk Invitations)**
1. Admin reviews imported applications
2. Admin goes to `/admin/bulk-invitations`
3. Selects applications to invite
4. System sends invitation emails with password reset links
5. Students activate accounts and can access portal

## Document Handling

### Strategy: Pre-upload Documents

1. **Before Import**:
   - Upload documents to Supabase Storage
   - Organize: `documents/{student_id}/{application_id}/{type}/{filename}`
   - Create manifest file with paths

2. **During Import**:
   - CSV includes document storage paths
   - System creates `student_documents` records
   - Sets status to `approved` (pre-verified)
   - Sets `verified_by` to importing staff member

### Document Paths in CSV

- `passport_path`: Full storage path to passport document
- `visa_path`: Full storage path to visa (if applicable)
- `utility_bill_path`: Full storage path to utility bill
- `id_document_path`: Full storage path to ID document
- `bank_statement_path`: Full storage path to bank statement
- `contract_pdf_path`: Full storage path to signed contract PDF

## Status Handling

### For Historical Applications

- **Status**: Set directly to `confirmed` (if completed) or `awaiting_verification`
- **Submitted At**: Use date from CSV or current date
- **Confirmed At**: Use date from CSV if status is confirmed
- **Skip DocuSign**: No DocuSign workflow for historical apps
- **Documents**: Set to `approved` status

## Payment Import

### Historical Payments

If deposit/installments were paid historically:
- Create `manual_payments` records
- Set `deposit_payment_intent_id` to `manual-{uuid}`
- Record payment dates and amounts from CSV
- Link to payment schedule

## Error Handling

### Validation Rules

1. **Required Fields**:
   - email, first_name, last_name, date_of_birth
   - contract_slug, status

2. **Dependency Validation**:
   - Contract must exist
   - Studio must exist (if studio_number provided)
   - Payment plan must exist (if payment_plan_name provided)

3. **Data Validation**:
   - Email format
   - Date formats (YYYY-MM-DD)
   - Status enum values
   - Boolean values (yes/no, true/false)

### Error Reporting

- Row-level error tracking
- Continue on error (don't stop import)
- Detailed error messages per row
- Summary report with counts

## Testing Checklist

- [x] Import single application - ✅ PASSED
- [ ] Import with all fields populated
- [ ] Import with minimal fields
- [ ] Import with existing users
- [ ] Import with new users (placeholder creation)
- [ ] Import with documents
- [ ] Import without documents
- [ ] Import with payments
- [ ] Import with partner referrals
- [ ] Error handling for missing contracts
- [ ] Error handling for invalid data
- [ ] Large batch import (100+ applications)
- [ ] Bulk invitation sending
- [ ] Student account activation

## ✅ Implementation Status

1. ✅ Database function implemented (`bulk_import_student_applications`)
2. ✅ CSV template generator implemented (`generateApplicationsTemplate`)
3. ✅ Edge Function updated (`bulk-import-data`)
4. ✅ Added to import page (`/admin/data-import`)
5. ✅ Bulk invitation system implemented (`bulk-invite-students` Edge Function)
6. ✅ Bulk invitations Admin UI implemented (`/admin/bulk-invitations`)
7. ✅ Tested with single application - ✅ WORKING
8. ✅ Documentation updated

## Next Steps (Optional)

1. Test with larger imports (10+ applications)
2. Create custom email template for invitations
3. Monitor invitation delivery rates
4. Create staff user guide

---

**Note**: This is a comprehensive system. Implement in phases:
- Phase 1: Basic application import (required fields only)
- Phase 2: Full field support
- Phase 3: Document handling
- Phase 4: Payment import
- Phase 5: Partner referrals

