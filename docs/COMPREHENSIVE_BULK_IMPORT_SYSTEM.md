# Comprehensive Bulk Import System for Client Onboarding

## Executive Summary

This document outlines a complete bulk import system for the Urban Hub Booking Portal SaaS platform. The system enables new client organizations (student accommodation providers) to migrate all their historical data when adopting the platform.

**Business Context**: You're building a SaaS product where student accommodation providers will need to bulk upload their data from previous years when they purchase your system.

## Key Understanding: Studio Data Model

**Critical Insight**: Studios are uploaded **once** and remain constant across all academic years. Only **availability changes** based on applications for each academic year. This means:
- Studios are shared across all academic years
- Studio status/allocation is tracked per academic year (via views/functions)
- No need to re-import studios for each new academic year

## Entities Requiring Bulk Import

### 1. Foundation Entities (Import First)
- **Academic Years** - Academic year definitions
- **Studio Grades** - Studio tier/type definitions
- **Studios** - Individual studio units (upload once, reusable)

### 2. Academic Year-Specific Entities
- **Studio Grade Prices** - Pricing per academic year + grade
- **Payment Plans** - Payment plan definitions per academic year
- **Payment Plan Installments** - Installment schedules
- **Contracts** - Contract templates per academic year + grade

### 3. Operational Entities
- **Partners** - Partner referral organizations
- **Cashback Campaigns** - Promotional campaigns
- **Applications** - Student applications (historical data)

### 4. Related Data (Supporting)
- **Studio Grade Media** - Images/videos for grades
- **Amenities** - Amenity catalog
- **Studio Grade Amenities** - Grade-to-amenity mappings

## Import Dependency Hierarchy

```
LEVEL 1 (Foundation - No Dependencies)
├─ Academic Years
├─ Studio Grades
├─ Amenities
└─ Studios (references Studio Grades)

LEVEL 2 (Requires Level 1)
├─ Studio Grade Prices (requires Academic Year + Studio Grade)
├─ Studio Grade Media (requires Studio Grade)
├─ Studio Grade Amenities (requires Studio Grade + Amenity)
└─ Partners (standalone)

LEVEL 3 (Requires Level 2)
├─ Payment Plans (requires Academic Year)
├─ Payment Plan Installments (requires Payment Plan)
└─ Cashback Campaigns (standalone)

LEVEL 4 (Requires Level 3)
├─ Contracts (requires Academic Year + Studio Grade + Payment Plan)
└─ Contract Payment Plans (junction - requires Contract + Payment Plan)

LEVEL 5 (Requires Level 4)
└─ Applications (requires Contract + Studio Grade + Student User)

LEVEL 6 (Requires Level 5)
├─ Application Steps (requires Application)
├─ Documents (requires Application)
├─ Payments (requires Application)
├─ Partner Referrals (requires Application + Partner)
└─ Application Cashbacks (requires Application + Cashback Campaign)
```

## Import Order Strategy

### Phase 1: Foundation Setup
1. Import Academic Years
2. Import Studio Grades
3. Import Amenities
4. Import Studios (with Studio Grade references)
5. Link Studio Grade Amenities

### Phase 2: Academic Year Configuration
1. Import Studio Grade Prices (per academic year)
2. Import Studio Grade Media
3. Import Payment Plans (per academic year)
4. Import Payment Plan Installments

### Phase 3: Contract Setup
1. Import Contracts (per academic year + grade)
2. Link Contract Payment Plans

### Phase 4: Operational Setup
1. Import Partners
2. Import Cashback Campaigns

### Phase 5: Historical Data
1. Import Applications
2. Import Application Steps
3. Import Documents
4. Import Payments
5. Link Partner Referrals
6. Link Application Cashbacks

## Individual Entity Import Specifications

### 1. Academic Years Import

**CSV Template**:
```csv
name,start_date,end_date,is_active
2025/2026,2025-09-01,2026-08-31,false
2026/2027,2026-09-01,2027-08-31,true
2027/2028,2027-09-01,2028-08-31,false
```

**Database Table**: `academic_years`
- `name` (unique) - Format: "YYYY/YYYY"
- `start_date` - Date
- `end_date` - Date
- `is_active` - Boolean

**Validation**:
- Name format validation
- Date range validation (start < end)
- Unique name check

### 2. Studio Grades Import

**CSV Template**:
```csv
slug,name,short_description,long_description,max_occupancy,display_order,is_active
silver,Silver Studio,Compact 19-20m² studio with smart storage,The Silver Studio delivers great value...,1,1,true
gold,Gold Studio,Enhanced layout with larger workspace,Gold Studios add extra floor space...,1,2,true
```

**Database Table**: `studio_grades`
- `slug` (unique) - URL-friendly identifier
- `name` (unique) - Display name
- `short_description` - Brief description
- `long_description` - Detailed description
- `max_occupancy` - Integer
- `display_order` - Integer
- `is_active` - Boolean

**Validation**:
- Slug format validation
- Unique slug/name check

### 3. Studios Import (One-Time Upload)

**CSV Template**:
```csv
studio_number,studio_grade_slug,floor,status,allocation,is_active
101,silver,1,available,,true
102,silver,1,available,,true
201,gold,2,occupied,Student,true
```

**Database Table**: `studios`
- `studio_number` (unique) - Studio identifier
- `studio_grade_id` - References studio_grades (lookup by slug)
- `floor` - Text
- `status` - Enum: available, reserved, occupied, maintenance
- `allocation` - Text (NULL, 'Student', 'OTA', 'Keyworkers', or UUID)
- `is_active` - Boolean

**Key Points**:
- ✅ Upload **once** - studios are shared across all academic years
- ✅ Status/allocation can be updated manually or via applications
- ✅ Studio availability per academic year is calculated dynamically

**Validation**:
- Studio number uniqueness
- Studio grade slug exists
- Status enum validation

### 4. Studio Grade Prices Import (Per Academic Year)

**CSV Template**:
```csv
academic_year_name,studio_grade_slug,weekly_price,deposit_amount_override,currency_code,is_active
2026/2027,silver,165.00,99.00,GBP,true
2026/2027,gold,179.00,99.00,GBP,true
2027/2028,silver,170.00,99.00,GBP,true
```

**Database Table**: `studio_grade_prices`
- Unique constraint on `(academic_year_id, studio_grade_id)`

**Validation**:
- Academic year exists
- Studio grade exists
- Price > 0
- Currency code format

### 5. Payment Plans Import (Per Academic Year)

**CSV Template** (Main Plans):
```csv
academic_year_name,name,description,deposit_amount,is_active
2026/2027,3 Instalments,Deposit on booking followed by three evenly split instalments,99.00,true
2026/2027,4 Instalments,Deposit on booking and four quarterly instalments,99.00,true
2026/2027,10 Instalments,Deposit on booking followed by ten monthly instalments,99.00,true
```

**CSV Template** (Installments):
```csv
payment_plan_name,sequence,label,due_date_offset_days,amount_type,amount_value
3 Instalments,1,Deposit,0,fixed,99.00
3 Instalments,2,Instalment 1,90,percentage,33.33
3 Instalments,3,Instalment 2,180,percentage,33.33
3 Instalments,4,Instalment 3,270,percentage,33.34
```

**Database Tables**: 
- `payment_plans` - Main plan definitions
- `payment_plan_installments` - Installment schedules

**Validation**:
- Academic year exists
- Installment percentages sum to 100%
- Sequence ordering
- Amount type validation (percentage 0-100, fixed > 0)

### 6. Contracts Import (Per Academic Year + Grade)

**CSV Template**:
```csv
slug,academic_year_name,studio_grade_slug,payment_plan_name,contract_start,contract_end,weeks,weekly_price_override,deposit_override,name,summary,cta_label,display_order,is_active
silver-45-week-2026-27,2026/2027,silver,3 Instalments,2026-09-06,2027-07-18,45,165.00,99.00,Silver Studio · 45 Weeks,Secure a 45-week tenancy...,Enquire,1,true
silver-51-week-2026-27,2026/2027,silver,4 Instalments,2026-09-06,2027-08-29,51,165.00,99.00,Silver Studio · 51 Weeks,Extend your stay through summer...,Enquire,2,true
```

**Database Table**: `contracts`
- `slug` (unique) - URL-friendly identifier
- Links to academic year, studio grade, payment plan

**Validation**:
- Academic year exists
- Studio grade exists
- Payment plan exists
- Date range validation
- Weeks calculation matches dates

### 7. Partners Import

**CSV Template**:
```csv
name,email,phone,referral_code,commission_rate,is_active
ABC Agency,contact@abcagency.com,+44 20 1234 5678,ABC2025,5.00,true
XYZ Consultancy,info@xyzconsult.com,+44 20 9876 5432,XYZ2025,5.00,true
```

**Database Table**: `partners`
- `referral_code` (unique) - Partner referral identifier

**Validation**:
- Referral code uniqueness
- Commission rate 0-100%
- Email format

### 8. Cashback Campaigns Import

**CSV Template**:
```csv
name,amount,applies_to,start_date,end_date,max_uses,is_active
Welcome Bonus 2026,50.00,all,2026-01-01,2026-12-31,1000,true
Rebooking Incentive 2026,25.00,rebooking,2026-06-01,2026-08-31,500,true
```

**Database Table**: `cashback_campaigns`
- `applies_to` - Enum: all, new, rebooking

**Validation**:
- Date range validation
- Amount > 0
- Applies_to enum validation

### 9. Applications Import

**See**: `docs/BULK_APPLICATION_IMPORT_PROPOSAL.md` and `docs/BULK_APPLICATION_IMPORT_RECOMMENDATIONS.md` for detailed specifications.

**CSV Template** (Historical Applications):
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

**Key Points**:
- Requires contracts, studios, and student users (auto-created if needed)
- Includes 6 application steps (JSONB payloads)
- Documents: Pre-upload to storage, reference paths in CSV
- Historical applications: Skip DocuSign, upload signed PDFs directly
- User creation: Auto-create with password reset email
- Status: Set to `confirmed` for completed historical applications
- Documents: Set status to `approved` (pre-verified)

**Dependencies**:
- Contracts (must exist)
- Studio Grades (via contracts)
- Studios (optional - for assigned studio)
- Payment Plans (optional - via step 5)
- Partners (optional - via referral_code)

## Implementation Architecture

### Unified Bulk Import System

**Single Admin Interface**: `/admin/data-import`

**Features**:
- Multi-step wizard for import order
- Dependency checking
- Progress tracking
- Error reporting
- Import history

### Import Module Structure

```
/admin/data-import
├─ Step 1: Foundation (Academic Years, Studio Grades, Studios)
├─ Step 2: Academic Year Config (Prices, Media, Payment Plans)
├─ Step 3: Contracts
├─ Step 4: Operational (Partners, Cashbacks)
└─ Step 5: Historical Data (Applications)
```

### Edge Function: `bulk-import-data`

**Location**: `supabase/functions/bulk-import-data/index.ts`

**Capabilities**:
- Handles all entity types
- Respects dependency order
- Validates all relationships
- Returns comprehensive reports

**Input Structure**:
```typescript
{
  import_type: 'academic_years' | 'studio_grades' | 'studios' | 
               'studio_grade_prices' | 'payment_plans' | 'contracts' |
               'partners' | 'cashback_campaigns' | 'applications',
  file: File, // CSV file
  options: {
    validate_only: boolean,
    skip_duplicates: boolean,
    dry_run: boolean
  }
}
```

## Studio Data Model Clarification

### How Studios Work Across Academic Years

1. **Studios Uploaded Once**:
   - Studios are physical units that don't change
   - Uploaded once during initial setup
   - Shared across all academic years

2. **Availability Per Academic Year**:
   - Studio status per academic year tracked via views
   - System uses `studio_status_by_academic_year` view
   - Availability calculated based on applications

3. **Allocation States**:
   - `NULL` - Unallocated
   - `'Student'` - Permanently allocated to students
   - `'OTA'` - Allocated to Online Travel Agency
   - `'Keyworkers'` - Allocated to keyworkers
   - `UUID` - Temporary reservation (student ID)

4. **Import Strategy**:
   - Import studios once with initial status
   - Status updated automatically as applications are imported
   - Manual allocation changes via admin UI

## CSV Template Structure for Each Entity

### Template Files Location
- `/admin/data-import/templates/` - Downloadable templates
- Each template includes:
  - Column headers
  - Example rows
  - Field descriptions
  - Validation rules

### Template Features
- **Excel/CSV Compatible**: Can be opened in Excel, Google Sheets, etc.
- **Validation Helper**: Includes validation rules as comments
- **Example Data**: Includes sample rows showing format
- **Field Descriptions**: Comments explaining each field

## Import Workflow

### Recommended Import Sequence

```
1. SETUP FOUNDATION
   ├─ Import Academic Years
   ├─ Import Studio Grades
   ├─ Import Amenities (optional)
   └─ Import Studios (one-time)
   
2. CONFIGURE ACADEMIC YEARS
   ├─ Import Studio Grade Prices (for each year)
   ├─ Import Studio Grade Media (optional)
   └─ Import Payment Plans (for each year)
       └─ Import Payment Plan Installments
       
3. CREATE CONTRACTS
   ├─ Import Contracts (for each year + grade)
   └─ Link Contract Payment Plans (optional)
   
4. SETUP OPERATIONS
   ├─ Import Partners (optional)
   └─ Import Cashback Campaigns (optional)
   
5. IMPORT HISTORICAL DATA
   ├─ Import Applications
   ├─ Import Documents (separate or with apps)
   ├─ Import Payments (separate or with apps)
   └─ Link Referrals/Cashbacks (if applicable)
```

### Validation & Error Handling

**Pre-Import Validation**:
- CSV structure validation
- Required fields check
- Data type validation
- Relationship validation (dependencies exist)

**During Import**:
- Row-level error tracking
- Transaction boundaries
- Continue on error (or stop on first error - configurable)
- Detailed error reporting

**Post-Import**:
- Summary report
- Error details
- Success statistics
- Import history record

## Implementation Priority

### Phase 1: Foundation Imports (Critical)
1. Academic Years
2. Studio Grades
3. Studios

### Phase 2: Academic Year Setup (Critical)
1. Studio Grade Prices
2. Payment Plans
3. Contracts

### Phase 3: Applications Import (High Priority)
1. Applications (see detailed proposal)
2. Application Steps
3. Documents

### Phase 4: Supporting Features (Medium Priority)
1. Partners
2. Cashback Campaigns
3. Payments Import

### Phase 5: Enhanced Features (Low Priority)
1. Studio Grade Media
2. Amenities
3. Contract Payment Plans

## User Experience

### Admin Import Interface

**Location**: `/admin/data-import`

**Features**:
- **Import Wizard**: Step-by-step guide through import process
- **Dependency Checker**: Shows what must be imported first
- **Template Downloads**: Easy access to CSV templates
- **Progress Tracking**: Real-time import progress
- **Error Review**: Review and fix errors before proceeding
- **Import History**: Track all imports with reports

**UI Flow**:
```
1. Select import type
2. Download template (if needed)
3. Prepare CSV file
4. Upload CSV
5. Preview/validate
6. Review errors (if any)
7. Confirm import
8. View progress
9. Review results
10. Download report
```

## Technical Implementation

### Database Helper Functions

**Location**: `supabase/migrations/YYYYMMDD_bulk_import_functions.sql`

**Functions Needed**:
1. `bulk_import_academic_years(csv_data JSONB)` - Import academic years
2. `bulk_import_studio_grades(csv_data JSONB)` - Import studio grades
3. `bulk_import_studios(csv_data JSONB)` - Import studios
4. `bulk_import_studio_grade_prices(csv_data JSONB)` - Import prices
5. `bulk_import_payment_plans(csv_data JSONB)` - Import payment plans
6. `bulk_import_contracts(csv_data JSONB)` - Import contracts
7. `bulk_import_partners(csv_data JSONB)` - Import partners
8. `bulk_import_cashback_campaigns(csv_data JSONB)` - Import campaigns
9. `validate_import_dependencies(...)` - Check dependencies

### Edge Function Structure

**Location**: `supabase/functions/bulk-import-data/index.ts`

**Handles**:
- CSV parsing
- Data validation
- Dependency checking
- Database operations
- Error collection
- Report generation

### Frontend Components

**Location**: `src/pages/admin/DataImport.tsx`

**Components**:
- `ImportWizard` - Step-by-step wizard
- `ImportTypeSelector` - Choose import type
- `FileUpload` - CSV file upload
- `PreviewTable` - Preview imported data
- `ValidationErrors` - Show validation errors
- `ImportProgress` - Progress indicator
- `ImportResults` - Results and report

## Import History & Auditing

### Import History Table

```sql
CREATE TABLE public.import_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by UUID REFERENCES auth.users(id),
  import_type TEXT NOT NULL,
  file_name TEXT,
  total_rows INTEGER,
  succeeded INTEGER,
  failed INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT, -- 'processing', 'completed', 'failed'
  report JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Audit Logging
- All imports logged to `staff_activity_logs`
- Import details stored in `import_history`
- Error details preserved for troubleshooting

## Testing Strategy

### Test Scenarios

1. **Happy Path**: Complete import sequence
2. **Missing Dependencies**: Import with missing references
3. **Invalid Data**: CSV with validation errors
4. **Duplicate Data**: Importing existing records
5. **Large Imports**: 1000+ rows
6. **Partial Failures**: Some rows fail, others succeed
7. **Dependency Order**: Wrong import order

### Test Data
- Sample CSV files for each entity type
- Edge cases (missing fields, invalid formats)
- Large datasets (performance testing)

## Security Considerations

- Staff-only access (RLS enforced)
- Input validation and sanitization
- File size limits
- Rate limiting
- Audit logging
- Transaction safety

## Performance Optimization

- Batch processing (50-100 rows)
- Parallel operations where possible
- Efficient database queries
- Progress updates
- Error recovery

## Documentation

### User Guides
- Step-by-step import guides for each entity
- CSV template documentation
- Common error resolution
- Best practices

### Technical Documentation
- API documentation
- Database function specs
- Edge function architecture
- Error codes reference

## Next Steps

1. **Review & Approve**: Review this comprehensive plan
2. **Prioritize**: Decide implementation order
3. **Design**: Create detailed UI mockups
4. **Implement**: Build foundation imports first
5. **Test**: Comprehensive testing with sample data
6. **Document**: Create user guides and templates
7. **Deploy**: Gradual rollout to production

## Related Documentation

- Application Import: `docs/BULK_APPLICATION_IMPORT_PROPOSAL.md`
- Application Recommendations: `docs/BULK_APPLICATION_IMPORT_RECOMMENDATIONS.md`
- Application Implementation: `docs/BULK_APPLICATION_IMPORT_IMPLEMENTATION.md`
- Application Status: `BULK_APPLICATION_IMPORT_STATUS.md`
- Architecture Spec: `docs/architecture-spec.md`
- Quick Start: `docs/BULK_IMPORT_QUICK_START.md`

## Applications Import Status

**Current Status**: Applications import type added to UI. Full implementation pending.

**See**: `BULK_APPLICATION_IMPORT_STATUS.md` for detailed implementation checklist and next steps.

**Key Features**:
- Historical application import with all 6 steps
- User auto-creation with password reset
- Document path references (pre-uploaded)
- Skip DocuSign workflow for historical apps
- Payment import support
- Partner referral linking

---

**This comprehensive system will enable smooth onboarding of new client organizations with complete data migration capabilities.**

