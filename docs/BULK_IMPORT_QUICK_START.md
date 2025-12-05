# Bulk Application Import - Quick Start Guide

## Overview

This guide provides a quick reference for implementing bulk application import functionality in the Urban Hub Booking Portal.

## Recommended Approach: CSV Import System

### Why CSV?
- ✅ Easy for staff to prepare and validate
- ✅ Supports large volumes (1000+ records)
- ✅ Familiar format
- ✅ Can be validated before import
- ✅ Progressive enhancement possible

## Core Components Needed

### 1. Admin UI Page
**Location**: `/admin/bulk-import`

**Features**:
- File upload component
- Template download button
- Preview/validation before import
- Progress bar during import
- Detailed import report after completion

### 2. Edge Function
**Location**: `supabase/functions/bulk-import-applications/index.ts`

**Responsibilities**:
- Parse CSV file
- Validate all data
- Create/find auth users
- Create applications with steps
- Handle documents (optional)
- Return detailed report

### 3. Database Helper Functions
**Location**: `supabase/migrations/YYYYMMDD_bulk_import_functions.sql`

**Functions**:
- `create_bulk_application()` - Creates application with all steps
- `validate_application_dependencies()` - Validates contracts, studios, etc.
- `find_or_create_student()` - Finds or creates auth user

## CSV Template Structure

### Minimal Template (Required Fields)
```csv
email,first_name,last_name,date_of_birth,mobile,address_line_1,postcode,town,contract_slug,status
john.doe@example.com,John,Doe,2000-01-15,+44 7700 900123,123 Main St,SW1A 1AA,London,silver-45-week-2026-27,confirmed
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
status,referral_code,is_rebooking
```

## Data Dependencies Checklist

Before importing, ensure these exist:

- ✅ **Academic Year** - Must be active
- ✅ **Studio Grade** - Must be active  
- ✅ **Contract** - Must exist and match `contract_slug`
- ✅ **Studio** (optional) - If `studio_number` provided, must exist
- ✅ **Payment Plan** (optional) - If `payment_plan_name` provided, must exist
- ✅ **Partner** (optional) - If `referral_code` provided, must exist

## Import Workflow

```
1. Staff prepares CSV file
   ↓
2. Upload CSV to /admin/bulk-import
   ↓
3. System validates CSV structure
   ↓
4. Preview validation results
   ↓
5. Confirm import
   ↓
6. Edge function processes each row:
   - Create/find auth user
   - Validate dependencies
   - Create application
   - Create all 6 steps
   - Handle documents (if provided)
   - Link partner referrals (if applicable)
   ↓
7. Return import report:
   - Total rows processed
   - Success count
   - Failure count
   - Errors per row
```

## Application Steps Data Structure

Each application requires 6 steps with JSONB payloads:

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
  "disabled": "no",
  "smoker": "no",
  "medical_requirements": "",
  "entry_into_uk": "UK Citizen"
}
```

### Step 4: Documentation
```json
{
  "uk_citizen": "yes",
  "passport_document": "documents/user-id/app-id/passport-uuid.pdf",
  "visa_document": ""
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
  "consent": true
}
```

### Step 6: Agreement & Signing
```json
{
  // Usually empty on import - populated during signing workflow
}
```

## User Creation Strategy

**Recommended Approach**:

1. Check if user exists by email (case-insensitive)
2. If exists:
   - Use existing user ID
   - Update profile if needed
3. If not exists:
   - Create auth user with temporary password
   - Send password reset email
   - Create profile with role='student'
   - Sync first_name and last_name from step 1

## Document Handling Options

### Option 1: Pre-upload Documents (Recommended for Bulk)
- Upload documents to Supabase Storage first
- Reference paths in CSV
- Fast import, no file processing

### Option 2: Defer Document Import
- Create applications without documents
- Import documents separately later
- Two-step process but faster

### Option 3: Base64 in CSV
- Encode documents as base64
- Decode during import
- Single file but large size

## Status Values

Valid application statuses:
- `draft` - Initial state
- `awaiting_deposit` - Waiting for deposit payment
- `awaiting_signature` - Waiting for DocuSign signatures
- `awaiting_verification` - Waiting for document verification
- `confirmed` - Fully confirmed application
- `cancelled` - Cancelled application
- `expired` - Expired application

## Error Handling

### Validation Errors
- Invalid email format
- Missing required fields
- Invalid date formats
- Contract not found
- Studio not found
- Duplicate applications

### Processing Errors
- User creation failed
- Application creation failed
- Step creation failed
- Document upload failed

All errors logged with row number and specific error message.

## Import Report Structure

```typescript
{
  total_rows: 100,
  processed: 100,
  succeeded: 95,
  failed: 5,
  results: [
    {
      row_number: 1,
      email: "john.doe@example.com",
      status: "success",
      application_id: "uuid-here"
    },
    {
      row_number: 5,
      email: "invalid@email",
      status: "error",
      errors: ["Invalid email format", "Contract not found"]
    }
  ],
  summary: {
    users_created: 50,
    users_found: 45,
    applications_created: 95,
    documents_uploaded: 0,
    payments_created: 0
  }
}
```

## Implementation Priority

### Phase 1: Core Functionality (Highest Priority)
1. CSV parsing and validation
2. Database helper functions
3. Basic application creation
4. Step 1-5 data import
5. User creation/finding

### Phase 2: Advanced Features
1. Document handling
2. Payment import
3. Partner referral linking
4. Detailed error reporting

### Phase 3: UI Components
1. Admin import page
2. Template download
3. Preview functionality
4. Progress tracking

## Security Considerations

- ✅ Only staff/superadmin can access import
- ✅ Input validation and sanitization
- ✅ Rate limiting on imports
- ✅ Audit logging of all imports
- ✅ Secure password generation for new users
- ✅ Password reset emails for new accounts

## Performance Tips

1. **Batch Processing**: Process 50-100 rows per batch
2. **Transactions**: Each application in own transaction
3. **Parallel Processing**: Process independent operations in parallel
4. **Progress Updates**: Update progress every batch
5. **Error Recovery**: Continue processing after errors

## Testing Checklist

- [ ] CSV with all fields
- [ ] CSV with minimal fields
- [ ] CSV with invalid data
- [ ] CSV with missing dependencies
- [ ] CSV with duplicate emails
- [ ] CSV with existing users
- [ ] CSV with new users
- [ ] Large CSV (1000+ rows)
- [ ] Document import
- [ ] Payment import
- [ ] Partner referral linking

## Common Use Cases

### Use Case 1: Historical Data Migration
**Scenario**: Import 500 confirmed applications from previous system

**Steps**:
1. Export from old system
2. Transform to CSV format
3. Pre-upload documents
4. Run bulk import
5. Verify results

### Use Case 2: New Academic Year Batch
**Scenario**: Import 200 new applications for upcoming year

**Steps**:
1. Prepare CSV with all data
2. Ensure contracts/payment plans exist
3. Import with status="draft"
4. Staff review and verify
5. Update statuses as needed

### Use Case 3: Partner Referral Batch
**Scenario**: Import 50 applications from partner referrals

**Steps**:
1. Partner provides CSV with referral codes
2. Validate referral codes
3. Import with referral_code column
4. System auto-links to partners
5. Generate commission reports

## Related Documentation

- Full proposal: `BULK_APPLICATION_IMPORT_PROPOSAL.md`
- Database schema: `supabase/migrations/20250209_dynamic_portal_schema.sql`
- Application wizard: `src/pages/portal/ApplicationWizard.tsx`
- Architecture spec: `docs/architecture-spec.md`

## Next Steps

1. Review this quick start guide
2. Review full proposal document
3. Prioritize implementation phases
4. Begin Phase 1 development
5. Create CSV template file
6. Build edge function
7. Build admin UI page
8. Test with sample data
9. Deploy to staging
10. Train staff

## Support & Questions

For questions or clarifications about the bulk import system:
- Check full proposal: `BULK_APPLICATION_IMPORT_PROPOSAL.md`
- Review existing codebase patterns
- Test in development environment first

