# Bulk Application Import System - Comprehensive Proposal

## Executive Summary

This document outlines a comprehensive solution for bulk importing student applications into the Urban Hub Booking Portal system. The proposal covers all aspects of the application workflow, data dependencies, implementation options, and best practices.

## 1. System Architecture Understanding

### 1.1 Core Application Tables

#### Primary Tables
- **`student_applications`** - Main application record
  - `id` (UUID, primary key)
  - `student_id` (UUID, references auth.users)
  - `studio_grade_id` (UUID, references studio_grades)
  - `contract_id` (UUID, references contracts)
  - `assigned_studio_id` (UUID, optional, references studios)
  - `status` (enum: draft, awaiting_deposit, awaiting_signature, awaiting_verification, confirmed, cancelled, expired)
  - `stripe_customer_id` (text, optional)
  - `deposit_payment_intent_id` (text, optional)
  - `reserved_studio_expires_at` (timestamptz, optional)
  - `submitted_at` (timestamptz, optional)
  - `cancelled_at` (timestamptz, optional)
  - `is_rebooking` (boolean, optional)
  - `previous_application_id` (UUID, optional)

- **`student_application_steps`** - Form step data (JSONB payloads)
  - `application_id` (UUID, references student_applications)
  - `step_number` (smallint, 1-6)
  - `payload` (JSONB) - Contains all form data for each step
  - `is_complete` (boolean)

#### Related Tables (Linked Data)
- **`student_documents`** - Document uploads
  - Links to storage bucket: `documents/{student_id}/{application_id}/{type}/{uuid}`
  - Types: passport, visa, utility_bill, id_document, bank_statement

- **`student_signatures`** - Signature records (DocuSign integration)
- **`partner_referrals`** - Partner referral tracking
- **`application_cashbacks`** - Cashback campaign applications
- **`docusign_envelopes`** - DocuSign envelope tracking
- **`stripe_payments`** - Stripe payment records
- **`manual_payments`** - Manual payment records

### 1.2 Application Steps Structure

Each application has 6 steps with specific JSONB payload structures:

#### Step 1: Personal Details
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
  "referral_code": "PARTNER123" // Optional
}
```

#### Step 2: Contact Information
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

#### Step 3: Academic & Additional Info
```json
{
  "year_of_study": "1st Year",
  "field_of_study": "Computer Science",
  "disabled": "yes" | "no",
  "smoker": "yes" | "no",
  "medical_requirements": "None",
  "entry_into_uk": "UK Citizen"
}
```

#### Step 4: Documentation
```json
{
  "uk_citizen": "yes" | "no",
  "passport_document": "path/to/passport.pdf", // Storage path
  "visa_document": "path/to/visa.pdf" // Storage path (if not UK citizen)
}
```

#### Step 5: Payment Plan & Guarantor
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
  "utility_bill": "path/to/utility.pdf",
  "id_document": "path/to/id.pdf",
  "bank_statement": "path/to/bank.pdf",
  "consent": true
}
```

#### Step 6: Agreement & Signing
```json
{
  // DocuSign integration - usually empty on import
  // Populated by system during signing workflow
}
```

### 1.3 Data Dependencies & Validations

#### Required Dependencies (Must Exist Before Import)
1. **Auth User** (`auth.users`)
   - User must be created in Supabase Auth
   - Email must be unique
   - Profile record auto-created via trigger

2. **Academic Year** (`academic_years`)
   - Must exist and be active
   - Used to validate contract

3. **Studio Grade** (`studio_grades`)
   - Must exist and be active
   - Used to link application

4. **Contract** (`contracts`)
   - Must exist and be active
   - Must belong to specified academic year
   - Must belong to specified studio grade

5. **Studio** (`studios`) - Optional
   - Must exist if `assigned_studio_id` provided
   - Must belong to specified studio grade
   - Status should be validated

6. **Payment Plan** (`payment_plans`) - Optional
   - Must exist if step 5 includes `selected_plan_id`
   - Must belong to same academic year as contract

#### Validation Rules
- Email must match auth user email (or be close match)
- Dates must be valid (DOB reasonable age range)
- Status enum must be valid
- Studio allocation rules must be respected
- Contract dates must be valid

## 2. Import Options & Approaches

### 2.1 Option A: CSV/Excel File Import (Recommended for Initial Implementation)

#### Advantages
- ✅ Easy to prepare and validate data
- ✅ Supports bulk operations
- ✅ Familiar format for staff
- ✅ Can handle large volumes (1000+ records)

#### Implementation Approach
1. **Admin UI Page** (`/admin/bulk-import`)
   - File upload component
   - Template download
   - Preview/validation before import
   - Progress tracking

2. **CSV Template Structure**
   ```csv
   email,first_name,last_name,date_of_birth,ethnicity,gender,ucas_id,country,
   mobile,address_line_1,address_line_2,postcode,town,
   year_of_study,field_of_study,disabled,smoker,medical_requirements,entry_into_uk,
   uk_citizen,passport_path,visa_path,
   contract_slug,studio_number,payment_plan_name,
   guarantor_name,guarantor_email,guarantor_phone,guarantor_relationship,guarantor_dob,
   status,referral_code
   ```

3. **Edge Function** (`bulk-import-applications`)
   - Validates CSV structure
   - Creates/finds auth users
   - Validates all dependencies
   - Creates applications with steps
   - Handles documents (if paths provided)
   - Returns import report

### 2.2 Option B: JSON Import via API/Edge Function

#### Advantages
- ✅ More flexible structure
- ✅ Better for programmatic imports
- ✅ Can handle complex nested data
- ✅ Supports document uploads inline

#### Implementation Approach
1. **Edge Function** (`bulk-import-applications-json`)
   - Accepts JSON array of applications
   - Each application object contains full structure
   - Supports batch processing
   - Returns detailed import report

2. **JSON Structure**
   ```json
   {
     "applications": [
       {
         "student": {
           "email": "john.doe@example.com",
           "first_name": "John",
           "last_name": "Doe",
           "password": "temporary-password" // Or null if user exists
         },
         "application": {
           "contract_slug": "silver-45-week-2026-27",
           "studio_number": "101",
           "status": "confirmed"
         },
         "steps": {
           "step1": { /* Personal details */ },
           "step2": { /* Contact info */ },
           "step3": { /* Academic info */ },
           "step4": { /* Documentation */ },
           "step5": { /* Payment & Guarantor */ }
         },
         "documents": {
           "passport": "base64-encoded-file-or-url",
           "visa": "base64-encoded-file-or-url"
         },
         "payments": [
           {
             "type": "manual",
             "amount": 99.00,
             "payment_date": "2025-01-15",
             "description": "Deposit"
           }
         ]
       }
     ]
   }
   ```

### 2.3 Option C: Database Function with Direct SQL Import

#### Advantages
- ✅ Fastest for very large imports
- ✅ Can bypass some validations for historical data
- ✅ Direct database access
- ✅ Transaction support

#### Implementation Approach
1. **Database Function** (`bulk_import_applications`)
   - Accepts JSONB array
   - Uses `SECURITY DEFINER` to bypass RLS
   - Creates applications in transaction
   - Returns import statistics

2. **Usage**
   ```sql
   SELECT * FROM bulk_import_applications(
     '[
       {
         "student_email": "john@example.com",
         "contract_slug": "silver-45-week",
         "steps": { ... }
       }
     ]'::jsonb
   );
   ```

### 2.4 Option D: Hybrid Approach (Recommended)

Combine multiple methods for different use cases:

1. **CSV Import** - For staff manual imports
2. **JSON API** - For system integrations
3. **Database Function** - For large historical data migrations
4. **UI Wizard** - For single application creation with validation

## 3. Recommended Implementation: CSV Bulk Import System

### 3.1 Architecture Overview

```
Admin UI (/admin/bulk-import)
    ↓
File Upload → Parse CSV → Validate Data
    ↓
Edge Function (bulk-import-applications)
    ↓
For Each Row:
  - Create/Find Auth User
  - Validate Dependencies
  - Create Application
  - Create Application Steps (1-6)
  - Handle Documents (if provided)
  - Create Payments (if provided)
  - Link Partner Referrals (if applicable)
    ↓
Return Import Report
```

### 3.2 CSV Template Design

#### Minimal Template (Required Fields Only)
```csv
email,first_name,last_name,date_of_birth,mobile,address_line_1,postcode,town,
contract_slug,status
```

#### Complete Template (All Fields)
```csv
email,first_name,last_name,date_of_birth,ethnicity,gender,ucas_id,country,
mobile,address_line_1,address_line_2,postcode,town,
year_of_study,field_of_study,disabled,smoker,medical_requirements,entry_into_uk,
uk_citizen,
contract_slug,studio_number,payment_plan_name,
guarantor_name,guarantor_email,guarantor_phone,guarantor_relationship,guarantor_dob,
witness_name,witness_email,witness_phone,
status,referral_code,is_rebooking,previous_application_email
```

#### Template Features
- Headers in first row
- Optional fields can be empty
- Date formats: YYYY-MM-DD
- Boolean fields: yes/no or true/false
- Status: draft, awaiting_deposit, awaiting_signature, awaiting_verification, confirmed

### 3.3 Edge Function Implementation

#### Function: `bulk-import-applications`

**Location**: `supabase/functions/bulk-import-applications/index.ts`

**Responsibilities**:
1. Parse and validate CSV file
2. Create/find auth users for each row
3. Validate all dependencies (contracts, studios, payment plans)
4. Create applications with all steps
5. Handle document uploads (if file paths provided)
6. Create payment records (if applicable)
7. Link partner referrals (if referral_code provided)
8. Return detailed import report

**Input**:
```typescript
{
  file: File, // CSV file
  options: {
    skip_existing_users: boolean, // Skip if user already exists
    create_users: boolean, // Create auth users
    default_password: string, // For new users
    send_welcome_email: boolean,
    dry_run: boolean // Validate only, don't import
  }
}
```

**Output**:
```typescript
{
  total_rows: number,
  processed: number,
  succeeded: number,
  failed: number,
  results: [
    {
      row_number: number,
      email: string,
      status: "success" | "error",
      application_id?: string,
      errors?: string[]
    }
  ],
  summary: {
    users_created: number,
    applications_created: number,
    documents_uploaded: number,
    payments_created: number
  }
}
```

### 3.4 Database Helper Functions

#### Function: `create_bulk_application`
Creates a single application with all steps in a transaction.

```sql
CREATE OR REPLACE FUNCTION public.create_bulk_application(
  p_student_id UUID,
  p_contract_id UUID,
  p_studio_grade_id UUID,
  p_assigned_studio_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT 'draft',
  p_steps JSONB, -- All 6 steps data
  p_is_rebooking BOOLEAN DEFAULT FALSE,
  p_previous_application_id UUID DEFAULT NULL
)
RETURNS UUID -- Returns application_id
```

#### Function: `validate_application_dependencies`
Validates all dependencies before import.

```sql
CREATE OR REPLACE FUNCTION public.validate_application_dependencies(
  p_contract_slug TEXT,
  p_studio_number TEXT DEFAULT NULL,
  p_payment_plan_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  is_valid BOOLEAN,
  contract_id UUID,
  studio_grade_id UUID,
  studio_id UUID,
  payment_plan_id UUID,
  errors TEXT[]
)
```

## 4. Document Handling Strategy

### 4.1 Document Import Options

#### Option 1: Pre-upload Documents to Storage
- Upload documents to Supabase Storage before import
- Reference storage paths in CSV
- **Pros**: Fast import, no file processing during import
- **Cons**: Requires manual upload step

#### Option 2: Base64 Encoded in CSV/JSON
- Encode documents as base64 in import file
- Decode and upload during import
- **Pros**: Single file import
- **Cons**: Large file sizes, slower processing

#### Option 3: URL References
- Documents hosted externally
- Download and re-upload during import
- **Pros**: Flexible source locations
- **Cons**: Network dependencies, slower

#### Option 4: Defer Document Import
- Create applications without documents
- Import documents separately later
- **Pros**: Faster application creation
- **Cons**: Two-step process

### 4.2 Recommended Approach: Hybrid

1. **For Bulk Historical Imports**: Pre-upload documents, reference paths
2. **For Active Imports**: Defer document import, link later
3. **For Critical Applications**: Inline base64 or URL download

## 5. User Creation Strategy

### 5.1 Options for Creating Users

#### Option 1: Auto-create with Random Password
- Generate random password
- Send password reset email
- User sets password on first login

#### Option 2: Auto-create with Default Password
- Use configurable default password
- Force password change on first login
- **Security Risk**: If password leaked

#### Option 3: Skip Existing Users
- Check if user exists by email
- Skip creation if exists
- Use existing user ID

#### Option 4: Link to Existing Users Only
- Don't create users
- Only import if user exists
- Return error if user not found

### 5.2 Recommended Approach

**Hybrid Strategy**:
- Check if user exists by email (case-insensitive)
- If exists: Use existing user ID
- If not exists: 
  - Create auth user with temporary password
  - Send password reset email
  - Set profile role to 'student'
  - Sync first_name and last_name from step 1

## 6. Payment Import Strategy

### 6.1 Historical Payment Import

For confirmed applications, you may want to import historical payments:

#### Payment CSV Format
```csv
application_email,payment_type,amount,payment_date,description,stripe_payment_intent_id
john.doe@example.com,deposit,99.00,2025-01-15,Deposit Payment,
john.doe@example.com,installment,500.00,2025-02-01,First Installment,
```

#### Payment Types
- `deposit` - Initial deposit payment
- `installment` - Regular installment payment
- `manual` - Manual payment recorded by staff
- `refund` - Refund payment

### 6.2 Integration Points

1. **Stripe Payments** - Record in `stripe_payments` table
2. **Manual Payments** - Record in `manual_payments` table
3. **Payment Schedule** - Auto-generate from contract payment plan

## 7. Partner Referral & Cashback Import

### 7.1 Partner Referral Import

If applications have referral codes:

```csv
email,referral_code
john.doe@example.com,PARTNER123
```

- System will auto-link to partner if referral code valid
- Commission calculated on confirmation
- Can be imported separately or with application

### 7.2 Cashback Import

```csv
application_email,cashback_amount,campaign_name
john.doe@example.com,50.00,Welcome Bonus 2025
```

- Links to cashback campaign
- Applied to application
- Affects payment schedule calculation

## 8. Error Handling & Validation

### 8.1 Pre-Import Validation

1. **CSV Structure Validation**
   - Required headers present
   - Data types correct
   - Date formats valid
   - Email formats valid

2. **Dependency Validation**
   - Contracts exist and are active
   - Studios exist and are available
   - Payment plans exist
   - Academic years exist

3. **Data Validation**
   - Age calculations
   - Status enum values
   - Boolean field values
   - Reference integrity

### 8.2 Import Error Handling

1. **Row-Level Errors**
   - Log error for specific row
   - Continue with next row
   - Return error in import report

2. **Transaction Boundaries**
   - Each application in own transaction
   - Rollback on error
   - Don't create partial applications

3. **Batch Processing**
   - Process in batches of 50-100
   - Progress reporting
   - Resumable on failure

## 9. Import Workflow Examples

### 9.1 Scenario 1: Historical Data Migration

**Goal**: Import 500 confirmed applications from previous system

**Steps**:
1. Export data from old system to CSV
2. Pre-upload documents to Supabase Storage
3. Prepare CSV with document paths
4. Run bulk import
5. Import payments separately
6. Verify import results

### 9.2 Scenario 2: New Academic Year Batch Import

**Goal**: Import 200 new applications for upcoming year

**Steps**:
1. Prepare CSV with all application data
2. Create contracts and payment plans first
3. Run bulk import with status="draft"
4. Staff review and verify
5. Update statuses as needed
6. Send notifications to students

### 9.3 Scenario 3: Partner Referral Batch

**Goal**: Import 50 applications from partner referrals

**Steps**:
1. Partner provides CSV with referral codes
2. Validate referral codes
3. Import applications with referral_code column
4. System auto-links to partners
5. Generate commission reports

## 10. Implementation Phases

### Phase 1: Core Import Functionality (Week 1-2)
- ✅ CSV parsing and validation
- ✅ Database helper functions
- ✅ Basic application creation
- ✅ Step 1-5 data import
- ✅ User creation/finding

### Phase 2: Advanced Features (Week 3)
- ✅ Document handling
- ✅ Payment import
- ✅ Partner referral linking
- ✅ Error reporting
- ✅ Import history tracking

### Phase 3: UI Components (Week 4)
- ✅ Admin import page
- ✅ Template download
- ✅ Preview functionality
- ✅ Progress tracking
- ✅ Import reports

### Phase 4: Testing & Documentation (Week 5)
- ✅ Comprehensive testing
- ✅ Error scenarios
- ✅ Performance optimization
- ✅ User documentation
- ✅ Admin guide

## 11. Security Considerations

### 11.1 Access Control
- Only staff/superadmin can access import functionality
- RLS policies enforced
- Audit logging of all imports

### 11.2 Data Validation
- Input sanitization
- SQL injection prevention
- File size limits
- Rate limiting

### 11.3 User Creation Security
- Secure password generation
- Password reset emails
- Account verification

## 12. Performance Optimization

### 12.1 Batch Processing
- Process in batches of 50-100 rows
- Parallel processing where possible
- Progress updates every batch

### 12.2 Database Optimization
- Use transactions efficiently
- Batch inserts where possible
- Index optimization
- Connection pooling

### 12.3 Storage Optimization
- Document uploads in parallel
- Compression for large files
- CDN for document serving

## 13. Monitoring & Reporting

### 13.1 Import Tracking Table

```sql
CREATE TABLE public.import_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by UUID REFERENCES auth.users(id),
  import_type TEXT, -- 'csv', 'json', 'api'
  file_name TEXT,
  total_rows INTEGER,
  succeeded INTEGER,
  failed INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT, -- 'processing', 'completed', 'failed'
  report JSONB -- Detailed results
);
```

### 13.2 Import Reports
- Success/failure counts
- Error details per row
- Processing time
- User creation stats
- Application creation stats

## 14. Template Files & Examples

### 14.1 CSV Template Location
- `/admin/bulk-import` page
- "Download Template" button
- Includes example data
- Documented field descriptions

### 14.2 Example CSV
Included in documentation with sample data showing all fields.

## 15. Testing Strategy

### 15.1 Unit Tests
- CSV parsing
- Validation functions
- Data transformation

### 15.2 Integration Tests
- End-to-end import flow
- Error handling
- Edge cases

### 15.3 Load Tests
- Large file imports (1000+ rows)
- Concurrent imports
- Performance benchmarks

## 16. Rollout Plan

### 16.1 Development Environment
- Test with sample data
- Validate all workflows
- Fix issues

### 16.2 Staging Environment
- Import subset of real data
- Staff training
- Feedback collection

### 16.3 Production Deployment
- Gradual rollout
- Monitor closely
- Support staff during transition

## 17. Future Enhancements

### 17.1 API Endpoint
- RESTful API for programmatic imports
- Authentication via API keys
- Rate limiting

### 17.2 Scheduled Imports
- Automatic imports from external systems
- Scheduled jobs
- Webhook integrations

### 17.3 Data Transformation
- Field mapping from external formats
- Data cleansing tools
- Validation rules configuration

## 18. Conclusion

This comprehensive bulk import system will enable efficient migration of historical data and ongoing batch imports. The recommended CSV-based approach provides a balance of ease-of-use, flexibility, and performance.

### Next Steps
1. Review and approve proposal
2. Prioritize implementation phases
3. Assign development resources
4. Begin Phase 1 implementation

## Appendix A: Complete CSV Template

See separate file: `BULK_IMPORT_TEMPLATE.csv`

## Appendix B: Database Schema Reference

See: `supabase/migrations/20250209_dynamic_portal_schema.sql`

## Appendix C: Example Edge Function Code

See: `supabase/functions/bulk-import-applications/` (to be created)

