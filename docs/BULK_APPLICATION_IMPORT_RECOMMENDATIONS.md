# Bulk Application Import - Recommendations & Implementation Guide

## 📍 Where to Bulk Import Applications

### Current Status
**Applications are NOT yet included in the bulk import system.** The existing `/admin/data-import` page handles:
- ✅ Academic Years
- ✅ Studio Grades  
- ✅ Studios
- ✅ Studio Grade Prices
- ✅ Payment Plans
- ✅ Payment Plan Installments
- ✅ Contracts
- ✅ Partners
- ✅ Cashback Campaigns

### Recommendation: Add Applications to Existing Import Page

**Location**: Add "Applications" as a new import type on `/admin/data-import`

**Why?**
- ✅ Consistent user experience
- ✅ All bulk imports in one place
- ✅ Reuses existing UI/UX patterns
- ✅ Same dependency checking system

**Implementation**: Add applications to the existing DataImport page alongside other entity types.

---

## 📄 Document Upload Strategy for Historical Applications

### Your Question
> "Since bulk upload for applications signifies previous applications so for the document signing should just be doc uploads for those right?"

### Recommendation: **YES - Document Uploads Only (No DocuSign)**

For **historical/previously completed applications**, you're absolutely correct:

1. **No DocuSign Needed**
   - Historical applications are already signed/completed
   - Skip DocuSign workflow entirely
   - Set status directly to `confirmed` or `awaiting_verification`

2. **Document Upload Approach**
   - Pre-upload documents to Supabase Storage
   - Reference storage paths in CSV
   - System creates `student_documents` records with `status = 'approved'`

3. **Signed Contract PDFs**
   - Upload signed contract PDFs directly to storage
   - Store in `contracts/{application_id}/signed-{timestamp}.pdf`
   - Skip `docusign_envelopes` table entirely

---

## 🎯 Recommended Document Upload Process

### Option 1: Two-Phase Import (Recommended for Large Imports)

#### Phase 1: Pre-Upload Documents
1. **Organize documents** by student email or application ID
   - Create folder structure: `historical-docs/{student-email}/`
   - Include all documents: passport, visa, signed contracts, etc.

2. **Bulk upload to Supabase Storage**
   - Use Supabase Dashboard or Storage API
   - Upload to: `documents/{student_id}/{application_id}/{type}/{filename}`
   - Keep a manifest file of upload paths

3. **Prepare CSV with document paths**
   - Add columns: `passport_path`, `visa_path`, `contract_pdf_path`, etc.
   - Reference the storage paths from step 2

#### Phase 2: Import Applications
1. CSV includes document storage paths
2. System creates `student_documents` records
3. Links documents to applications
4. Sets document status to `approved` (since already verified)

**Advantages:**
- ✅ Fast application import (no file processing)
- ✅ Documents already verified/approved
- ✅ Clear separation of concerns
- ✅ Can re-upload documents independently if needed

### Option 2: ZIP File Upload with CSV (For Smaller Imports)

1. **Create ZIP structure**:
   ```
   import-package/
   ├── applications.csv
   └── documents/
       ├── john.doe@example.com/
       │   ├── passport.pdf
       │   ├── visa.pdf
       │   └── signed-contract.pdf
       └── jane.smith@example.com/
           └── ...
   ```

2. **Upload ZIP to Edge Function**
   - Function extracts ZIP
   - Uploads documents to storage
   - Processes CSV with document paths
   - Creates applications

**Advantages:**
- ✅ Single file upload
- ✅ Self-contained package
- ✅ Documents automatically linked

**Disadvantages:**
- ⚠️ Slower for large imports
- ⚠️ ZIP size limitations
- ⚠️ More complex processing

### Option 3: Separate Document Import (For Flexibility)

1. **Import applications first** (without documents)
2. **Import documents separately** via:
   - Document upload UI per application
   - Bulk document mapping CSV
   - Drag-and-drop interface

**Advantages:**
- ✅ Maximum flexibility
- ✅ Can review applications first
- ✅ Document verification workflow

**Disadvantages:**
- ⚠️ Two-step process
- ⚠️ More manual work

---

## 📋 Recommended CSV Template Structure

### Minimal Template (Quick Import)

```csv
email,first_name,last_name,date_of_birth,mobile,
contract_slug,studio_number,status,
passport_path,visa_path,contract_pdf_path
```

### Complete Template (Full Historical Data)

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

### Document Path Format

**Storage paths should be relative to bucket root:**
```
documents/{student_id}/{application_id}/passport/{filename}.pdf
documents/{student_id}/{application_id}/visa/{filename}.pdf
contracts/{application_id}/signed-{timestamp}.pdf
```

**Or absolute paths:**
```
documents/abc123-def456-ghi789/jkl012-mno345-pqr678/passport/passport-john-doe.pdf
```

---

## 🔐 User Creation Strategy for Historical Applications

### Recommendation: Auto-Create Users with Password Reset

**Process:**
1. **Check if user exists** (by email, case-insensitive)
   - If exists: Use existing user ID
   - If not: Create new user

2. **For new users:**
   - Create auth user with **temporary random password**
   - Set profile: `role = 'student'`, sync name from CSV
   - **Send password reset email** (user sets password on first login)
   - Mark email as verified (since historical)

3. **For existing users:**
   - Link application to existing account
   - Don't modify existing profile data

**Why this approach?**
- ✅ Secure (no default passwords)
- ✅ User-friendly (password reset email)
- ✅ Works for both new and existing students
- ✅ Historical users can access their data

---

## 📊 Status Handling for Historical Applications

### Recommended Status Mapping

| Historical Status | System Status | Notes |
|------------------|---------------|-------|
| Completed/Confirmed | `confirmed` | Fully processed application |
| Pending Verification | `awaiting_verification` | Documents need staff review |
| Deposit Paid | `awaiting_signature` | Skip if contract already signed |
| Draft/Incomplete | `draft` | If data is incomplete |

### Special Considerations

1. **Skip DocuSign Workflow**
   - Set status directly to `confirmed` if contract signed
   - Don't create `docusign_envelopes` records
   - Upload signed PDF directly

2. **Document Status**
   - Set all imported documents to `approved`
   - Set `verified_by` to importing staff member
   - Set `uploaded_at` to historical date (from CSV)

3. **Payment Status**
   - If deposit paid: Create `manual_payments` record
   - Set `deposit_payment_intent_id` to `manual-{uuid}`
   - Record payment date and amount from CSV

---

## 🚀 Implementation Recommendations

### Phase 1: Add Applications to Import Page (Week 1)

**Tasks:**
1. ✅ Add "Applications" to `IMPORT_TYPES` in DataImport page
2. ✅ Create CSV template generator for applications
3. ✅ Create database function: `bulk_import_student_applications`
4. ✅ Update Edge Function to handle applications
5. ✅ Add dependency checking (contracts, studios, etc.)

**Priority:** HIGH - This enables the core functionality

### Phase 2: Document Upload System (Week 2)

**Tasks:**
1. ✅ Create document upload Edge Function
2. ✅ Support bulk document ZIP upload
3. ✅ Document path mapping in CSV
4. ✅ Auto-create `student_documents` records
5. ✅ Handle signed contract PDFs

**Priority:** HIGH - Essential for historical imports

### Phase 3: User Creation & Linking (Week 2)

**Tasks:**
1. ✅ Auto-create users with password reset
2. ✅ Link to existing users
3. ✅ Sync profile data
4. ✅ Email verification for historical users

**Priority:** MEDIUM - Important for usability

### Phase 4: Payment Import (Week 3)

**Tasks:**
1. ✅ Import deposit payments as manual payments
2. ✅ Import installment payments
3. ✅ Link to payment schedule
4. ✅ Payment history tracking

**Priority:** MEDIUM - Nice to have

---

## 📝 CSV Template Example

```csv
email,first_name,last_name,date_of_birth,mobile,address_line_1,postcode,town,
contract_slug,studio_number,status,submitted_at,
passport_path,visa_path,contract_pdf_path,deposit_amount,deposit_paid_date
john.doe@example.com,John,Doe,2000-01-15,+44 7700 900123,123 Main St,SW1A 1AA,London,
silver-45-week-2024-25,101,confirmed,2024-09-01 10:00:00,
documents/abc123/app123/passport/passport.pdf,documents/abc123/app123/visa/visa.pdf,
contracts/app123/signed-2024-09-01.pdf,99.00,2024-09-02
```

---

## ✅ Key Decisions Summary

### 1. Import Location
**✅ Recommendation**: Add to existing `/admin/data-import` page

### 2. Document Strategy
**✅ Recommendation**: Pre-upload documents, reference paths in CSV

### 3. DocuSign for Historical
**✅ Recommendation**: Skip DocuSign entirely, upload signed PDFs directly

### 4. User Creation
**✅ Recommendation**: Auto-create with password reset email

### 5. Document Status
**✅ Recommendation**: Set all to `approved` (pre-verified)

### 6. Payment Handling
**✅ Recommendation**: Import as manual payments with historical dates

---

## 🔧 Next Steps

1. **Review these recommendations** and confirm approach
2. **Implement Phase 1** - Add applications to import page
3. **Set up document upload workflow** - Decide on ZIP vs pre-upload
4. **Test with sample data** - Validate the entire flow
5. **Document the process** - Create user guide for staff

---

## 📚 Additional Resources

- **Full Proposal**: See `docs/BULK_APPLICATION_IMPORT_PROPOSAL.md`
- **Existing Import System**: See `/admin/data-import` page
- **Database Schema**: See `supabase/migrations/20250209_dynamic_portal_schema.sql`

---

## ❓ Questions to Consider

1. **How many historical applications** do you need to import?
   - < 100: ZIP file approach works well
   - 100-1000: Pre-upload documents recommended
   - > 1000: Consider phased import

2. **Do you have signed contracts** for all historical applications?
   - Yes: Upload directly
   - No: Mark as `awaiting_signature` or skip

3. **Payment history available**?
   - Yes: Import as manual payments
   - No: Set status without payment records

4. **Document verification status**?
   - All verified: Set to `approved`
   - Needs review: Set to `pending` for staff verification

