# Comprehensive Bulk Application Import Assessment
## Complete Requirements for Successful Student Portal Access

**Date:** December 2024  
**Purpose:** Identify ALL missing components for successful bulk application import where students can immediately use the system

---

## 🚨 CRITICAL BUGS (Will Break Import)

### 1. **Manual Payments Insert Error** ⚠️ **CRITICAL**

**Location:** `supabase/migrations/20251125_bulk_import_applications.sql` lines 392-408

**Issue:**
```sql
INSERT INTO public.manual_payments (
  application_id,
  amount,
  payment_date,
  payment_type,
  description,    -- ❌ WRONG: Column doesn't exist
  created_by      -- ❌ WRONG: Column doesn't exist
)
```

**Actual Schema:**
```sql
CREATE TABLE public.manual_payments (
  ...
  notes TEXT,           -- ✅ Should be 'notes', not 'description'
  recorded_by UUID,     -- ✅ Should be 'recorded_by', not 'created_by'
  payment_method TEXT,  -- ❌ MISSING: Required field
  ...
);
```

**Impact:** Import will FAIL when trying to insert deposit payments

**Fix Required:**
```sql
INSERT INTO public.manual_payments (
  application_id,
  amount,
  payment_date,
  payment_type,
  payment_method,  -- ADD: Required field
  notes,           -- FIX: Change from 'description'
  recorded_by      -- FIX: Change from 'created_by'
)
VALUES (
  v_record_id,
  v_deposit_amount,
  COALESCE(v_deposit_paid_date, v_submitted_at::DATE, CURRENT_DATE),
  'deposit',
  'bank_transfer',  -- ADD: Default payment method for historical
  'Historical deposit payment (imported)',
  p_imported_by
)
```

---

### 2. **Missing `selected_payment_plan_id` Assignment** ⚠️ **CRITICAL**

**Location:** `supabase/migrations/20251125_bulk_import_applications.sql`

**Issue:**
- Function looks up `v_payment_plan_id` (line 125-132)
- Stores it in Step 5 payload as `selected_plan_id` (line 199)
- **BUT:** Never sets `student_applications.selected_payment_plan_id` column

**Impact:**
- Payment portal won't work (requires `selected_payment_plan_id`)
- Payment schedule generation will fail
- Students can't see payment schedule
- Payment calculations will be incorrect

**Fix Required:**
```sql
-- After creating application (line 241)
UPDATE public.student_applications
SET selected_payment_plan_id = v_payment_plan_id
WHERE id = v_record_id;
```

**OR** add to INSERT:
```sql
INSERT INTO public.student_applications (
  student_id,
  studio_grade_id,
  contract_id,
  assigned_studio_id,
  status,
  submitted_at,
  reserved_studio_expires_at,
  selected_payment_plan_id  -- ADD THIS
)
VALUES (
  ...
  v_payment_plan_id  -- ADD THIS
)
```

---

## 📋 MISSING FIELDS IN BULK IMPORT

### 3. **Payment Plan Name Not Extracted from Step 5**

**Current:** Function looks up payment plan by name from CSV `payment_plan_name` column

**Issue:** If payment plan name is in Step 5 payload but not in CSV, it won't be found

**Recommendation:** Also check Step 5 payload for `selected_plan_id` if CSV doesn't have `payment_plan_name`

---

### 4. **Missing Cashback Amount** (Optional but Recommended)

**Current:** Not imported, relies on auto-apply trigger

**Impact:** If cashback was applied historically, it won't be in the system

**Fix:** Add `cashback_amount` column to CSV and set it during import

---

### 5. **Missing Rebooking Fields** (If Applicable)

**Current:** Not imported

**Fields Missing:**
- `is_rebooking`
- `previous_application_id`
- `rebooking_reason`

**Impact:** Rebooking applications won't be marked correctly

**Fix:** Add to CSV template and import function

---

## 🔧 MISSING DATA REQUIREMENTS

### 6. **Contract Payment Schedule Must Exist** ⚠️ **CRITICAL**

**Issue:** Payment portal requires `contract_payment_schedule` entries to display payment schedule

**Current Behavior:**
- If schedule exists → Works
- If schedule doesn't exist → Falls back to generating from `payment_plan_installments` (requires `selected_payment_plan_id`)

**Problem:**
- Many contracts may not have payment schedules generated
- Bulk import doesn't create payment schedules
- Students won't see payment schedule in portal

**Solutions:**

**Option A: Pre-generate Payment Schedules** (Recommended)
- Before bulk import, ensure all contracts have `contract_payment_schedule` entries
- Use existing seed script logic or create migration
- Generate schedules for all contracts based on their payment plans

**Option B: Auto-generate During Import**
- Add logic to bulk import function to create payment schedule if missing
- Calculate from payment plan installments
- Insert into `contract_payment_schedule` table

**Option C: Generate On-Demand** (Current Fallback)
- Portal generates schedule from `payment_plan_installments` if schedule missing
- Requires `selected_payment_plan_id` to be set (see Bug #2)

**Recommendation:** Implement Option A + Option B for safety

---

### 7. **Contract Payment Plans Junction Table**

**Current:** System supports multiple payment plans per contract via `contract_payment_plans` table

**Issue:** If contract uses `contract_payment_plans` (not legacy `contracts.payment_plan_id`), bulk import needs to:
1. Find payment plan in `contract_payment_plans` junction table
2. Or create entry if payment plan exists but not linked

**Current Code:** Only checks `contracts.payment_plan_id` (legacy) and direct lookup

**Fix:** Also check `contract_payment_plans` table:
```sql
-- After finding contract (line 103-110)
-- Also check contract_payment_plans junction table
IF v_payment_plan_id IS NULL AND v_row->>'payment_plan_name' IS NOT NULL THEN
  SELECT cpp.payment_plan_id INTO v_payment_plan_id
  FROM public.contract_payment_plans cpp
  INNER JOIN public.payment_plans pp ON pp.id = cpp.payment_plan_id
  WHERE cpp.contract_id = v_contract_id
    AND pp.name = v_row->>'payment_plan_name'
  LIMIT 1;
END IF;
```

---

## 💳 PAYMENT FUNCTIONALITY REQUIREMENTS

### 8. **Installment Payment Import Missing** ⚠️ **HIGH PRIORITY**

**Current:** Only deposit payments are imported

**Missing:**
- Installment payment import
- Payment allocation to specific installments
- Overpayment handling

**Impact:**
- Students won't see their payment history
- Payment schedule will show all installments as unpaid
- Remaining balance calculations will be incorrect

**Required Implementation:**
- Add installment payment columns to CSV
- Create `manual_payments` records with `instalment_id` linked to `contract_payment_schedule`
- Handle overpayments (allocate to next installment or flag for manual review)

---

### 9. **Stripe Customer ID** (Not Required for Import)

**Current:** Created automatically on first Stripe payment

**Status:** ✅ OK - No action needed
- Stripe customer created when student makes first online payment
- Not needed for historical imports

---

## 🔐 ACCOUNT CREATION & EMAIL

### 10. **Email Template Customization** (Enhancement)

**Current:** Uses Supabase default password reset email

**Missing:**
- Custom welcome email template
- Explanation of account creation
- Portal access instructions

**Impact:** Students receive generic email, may be confused

**Recommendation:** Create custom email template (see previous recommendations)

---

### 11. **Email Delivery Tracking** (Enhancement)

**Current:** No tracking of email delivery status

**Missing:**
- Email sent/failed status
- Resend functionality
- Login tracking

**Impact:** Can't identify students who didn't receive emails

**Recommendation:** Implement email tracking table (see previous recommendations)

---

## 🎯 PORTAL ACCESS REQUIREMENTS

### 12. **RLS Policies** ✅ **VERIFIED**

**Status:** ✅ All RLS policies exist
- Students can view own applications
- Students can view own documents
- Students can view own payments
- Students can view own signatures

**No Action Needed**

---

### 13. **Application Status Requirements**

**For Portal Access:**
- **Dashboard:** Shows all applications (any status)
- **Payments Page:** Only shows `confirmed` applications
- **Documents Page:** Shows all applications

**Current Import:** Sets status from CSV (defaults to `confirmed`)

**Status:** ✅ OK - No action needed

---

### 14. **Payment Schedule Display Requirements**

**For Payments Page to Work:**
1. ✅ Application must be `confirmed` status
2. ❌ **MISSING:** `contract_payment_schedule` must exist OR `selected_payment_plan_id` must be set
3. ✅ Contract must exist
4. ✅ Payment plan installments must exist (if using fallback)

**Current State:**
- ✅ #1: Status set correctly
- ❌ #2: `selected_payment_plan_id` NOT set (Bug #2)
- ✅ #3: Contract validated
- ✅ #4: Payment plan installments exist (if payment plan found)

**Fix:** Resolve Bug #2 (set `selected_payment_plan_id`)

---

## 📊 DATA VALIDATION REQUIREMENTS

### 15. **Age Calculation Missing**

**Current:** Accepts `age` from CSV but doesn't calculate from `date_of_birth`

**Impact:** Low - Can be provided in CSV

**Enhancement:** Auto-calculate if missing:
```sql
-- In Step 1 payload building
'age', CASE 
  WHEN v_row->>'age' IS NOT NULL AND v_row->>'age' != '' 
    THEN v_row->>'age'
  WHEN v_row->>'date_of_birth' IS NOT NULL 
    THEN EXTRACT(YEAR FROM AGE((v_row->>'date_of_birth')::DATE))::TEXT
  ELSE NULL
END
```

---

### 16. **Document Path Validation** (Optional)

**Current:** No validation that document paths exist in storage

**Impact:** Medium - May create orphaned document records

**Recommendation:** Add optional validation or document clearly that paths must be pre-uploaded

---

## 🔄 WORKFLOW REQUIREMENTS

### 17. **Payment Schedule Generation Workflow**

**Required Before Students Can Use Portal:**

1. **Contracts Must Have Payment Schedules:**
   - Either `contract_payment_schedule` entries exist
   - OR `selected_payment_plan_id` is set + payment plan has installments

2. **Current Gap:**
   - Bulk import doesn't create payment schedules
   - Bulk import doesn't set `selected_payment_plan_id` (Bug #2)

3. **Solution Options:**

   **Option A: Pre-Generate All Schedules** (Recommended)
   ```sql
   -- Run before bulk import
   -- Generate payment schedules for all contracts
   -- Based on their payment plans
   ```

   **Option B: Auto-Generate During Import**
   - Add to bulk import function
   - After creating application, check if schedule exists
   - If not, generate from payment plan installments
   - Insert into `contract_payment_schedule`

   **Option C: Post-Import Script**
   - After bulk import completes
   - Generate missing payment schedules
   - Set `selected_payment_plan_id` for applications missing it

---

### 18. **Cashback Auto-Apply Trigger**

**Current:** Trigger exists to auto-apply cashback when application status changes to `confirmed`

**Status:** ✅ OK - Will work automatically

**Note:** If importing with `confirmed` status, trigger will fire and apply eligible cashback campaigns

---

### 19. **Partner Referral Auto-Create**

**Current:** Trigger exists to auto-create partner referral when application confirmed

**Status:** ✅ OK - Will work automatically

**Note:** If `referral_code` provided in CSV, creates `partner_referrals` record (line 416-437)

---

## 📝 CSV TEMPLATE REQUIREMENTS

### 20. **Missing CSV Columns** (For Complete Import)

**Current Template Includes:**
- ✅ All application fields
- ✅ All step fields
- ✅ Document paths
- ✅ Deposit payment
- ❌ Installment payments (missing)
- ❌ Payment plan name (exists but may not be populated correctly)

**Recommended Additions:**
```csv
-- Installment payments (new)
installment_1_sequence,installment_1_amount,installment_1_date,
installment_2_sequence,installment_2_amount,installment_2_date,
...

-- OR use JSON structure:
installment_payments
[{"sequence":1,"amount":600,"date":"2024-09-15"},...]

-- Rebooking fields (if applicable)
is_rebooking,previous_application_email,rebooking_reason

-- Cashback (if known)
cashback_amount
```

---

## 🧪 TESTING REQUIREMENTS

### 21. **Pre-Import Validation Checklist**

Before bulk import, verify:

- [ ] All contracts exist with correct `contract_slug`
- [ ] All contracts have payment schedules OR payment plans with installments
- [ ] All studios exist (if `studio_number` provided)
- [ ] All payment plans exist and are linked to contracts
- [ ] All partners exist (if `referral_code` provided)
- [ ] Documents are pre-uploaded to storage (if document paths provided)
- [ ] CSV format matches template exactly
- [ ] Email addresses are valid and unique

---

### 22. **Post-Import Verification Checklist**

After bulk import, verify:

- [ ] All applications created successfully
- [ ] All users created and can log in
- [ ] All applications have `selected_payment_plan_id` set
- [ ] Payment schedules visible in portal
- [ ] Documents visible in portal
- [ ] Payment history accurate
- [ ] Students can access portal
- [ ] Students can view their applications
- [ ] Students can see payment schedule (if confirmed)
- [ ] Students can make payments (if confirmed)

---

## 🎯 PRIORITY FIXES SUMMARY

### **MUST FIX BEFORE IMPORT** (Critical)

1. ✅ **Fix Manual Payments Insert** - Wrong column names (`description` → `notes`, `created_by` → `recorded_by`, add `payment_method`)
2. ✅ **Set `selected_payment_plan_id`** - Required for payment portal to work
3. ✅ **Ensure Payment Schedules Exist** - Either pre-generate or auto-generate during import

### **SHOULD FIX** (High Priority)

4. ⚠️ **Add Installment Payment Import** - Students need to see payment history
5. ⚠️ **Check `contract_payment_plans` Junction Table** - Support multiple payment plans per contract
6. ⚠️ **Add Age Auto-Calculation** - Better data quality

### **NICE TO HAVE** (Enhancements)

7. 📧 **Custom Welcome Email Template** - Better user experience
8. 📊 **Email Delivery Tracking** - Better monitoring
9. 📋 **Add Rebooking Fields** - If rebooking applications exist
10. 💰 **Add Cashback Amount** - If cashback was applied historically

---

## 📋 COMPLETE CHECKLIST FOR SUCCESSFUL BULK IMPORT

### **Pre-Import Setup**

- [ ] Fix Bug #1: Manual payments column names
- [ ] Fix Bug #2: Set `selected_payment_plan_id`
- [ ] Generate payment schedules for all contracts (or implement auto-generation)
- [ ] Verify all dependencies exist (contracts, studios, payment plans, partners)
- [ ] Pre-upload documents to storage (if applicable)
- [ ] Prepare CSV with all required fields
- [ ] Test with 5-10 sample applications first

### **Import Process**

- [ ] Run bulk import
- [ ] Verify all users created
- [ ] Verify all applications created
- [ ] Verify `selected_payment_plan_id` set on all applications
- [ ] Verify payment schedules exist or can be generated
- [ ] Verify documents linked correctly
- [ ] Verify payments recorded correctly

### **Post-Import Verification**

- [ ] Test student login (password reset email received)
- [ ] Test student portal access
- [ ] Test application viewing
- [ ] Test payment schedule display (for confirmed applications)
- [ ] Test payment history display
- [ ] Test document viewing
- [ ] Test payment functionality (if applicable)
- [ ] Verify all data appears correctly in admin portal

---

## 🔍 DETAILED CODE FIXES REQUIRED

### Fix #1: Manual Payments Insert

**File:** `supabase/migrations/20251125_bulk_import_applications.sql`

**Lines:** 392-408

**Current:**
```sql
INSERT INTO public.manual_payments (
  application_id,
  amount,
  payment_date,
  payment_type,
  description,      -- ❌ WRONG
  created_by        -- ❌ WRONG
)
```

**Fixed:**
```sql
INSERT INTO public.manual_payments (
  application_id,
  amount,
  payment_date,
  payment_type,
  payment_method,   -- ✅ ADD: Required field
  notes,            -- ✅ FIX: Change from 'description'
  recorded_by       -- ✅ FIX: Change from 'created_by'
)
VALUES (
  v_record_id,
  v_deposit_amount,
  COALESCE(v_deposit_paid_date, v_submitted_at::DATE, CURRENT_DATE),
  'deposit',
  'bank_transfer',  -- ✅ ADD: Default for historical payments
  'Historical deposit payment (imported)',
  p_imported_by
)
```

---

### Fix #2: Set selected_payment_plan_id

**File:** `supabase/migrations/20251125_bulk_import_applications.sql`

**Location:** After line 241 (after application created)

**Add:**
```sql
-- Set selected_payment_plan_id if payment plan was found
IF v_payment_plan_id IS NOT NULL THEN
  UPDATE public.student_applications
  SET selected_payment_plan_id = v_payment_plan_id
  WHERE id = v_record_id;
END IF;
```

**OR** add to INSERT statement (line 223-240):
```sql
INSERT INTO public.student_applications (
  student_id,
  studio_grade_id,
  contract_id,
  assigned_studio_id,
  status,
  submitted_at,
  reserved_studio_expires_at,
  selected_payment_plan_id  -- ADD THIS
)
VALUES (
  v_student_id,
  v_studio_grade_id,
  v_contract_id,
  v_studio_id,
  v_status::public.application_status,
  COALESCE(v_submitted_at, NOW()),
  NULL,
  v_payment_plan_id  -- ADD THIS
)
```

---

### Fix #3: Check contract_payment_plans Junction Table

**File:** `supabase/migrations/20251125_bulk_import_applications.sql`

**Location:** After line 132 (payment plan lookup)

**Add:**
```sql
-- If payment plan not found via direct lookup, check junction table
IF v_payment_plan_id IS NULL AND v_row->>'payment_plan_name' IS NOT NULL AND v_row->>'payment_plan_name' != '' THEN
  SELECT cpp.payment_plan_id INTO v_payment_plan_id
  FROM public.contract_payment_plans cpp
  INNER JOIN public.payment_plans pp ON pp.id = cpp.payment_plan_id
  WHERE cpp.contract_id = v_contract_id
    AND pp.name = v_row->>'payment_plan_name'
  LIMIT 1;
END IF;
```

---

### Fix #4: Auto-Generate Payment Schedule (Optional Enhancement)

**File:** `supabase/migrations/20251125_bulk_import_applications.sql`

**Location:** After setting `selected_payment_plan_id`

**Add Function:**
```sql
-- Check if payment schedule exists for contract
IF NOT EXISTS (
  SELECT 1 FROM public.contract_payment_schedule 
  WHERE contract_id = v_contract_id
) AND v_payment_plan_id IS NOT NULL THEN
  -- Auto-generate payment schedule from payment plan
  -- (Implementation similar to seed script logic)
  -- Calculate deposit and installments
  -- Insert into contract_payment_schedule
END IF;
```

**OR** create separate migration to pre-generate all schedules.

---

## 📊 COMPLETE FIELD MAPPING

### Student Applications Table Fields

| Field | Source | Status | Notes |
|-------|--------|--------|-------|
| `id` | Auto-generated | ✅ | |
| `student_id` | From email (user created) | ✅ | |
| `studio_grade_id` | From contract lookup | ✅ | |
| `contract_id` | From `contract_slug` | ✅ | |
| `assigned_studio_id` | From `studio_number` | ✅ | |
| `status` | From CSV `status` | ✅ | Defaults to `confirmed` |
| `stripe_customer_id` | Auto-created on first payment | ✅ | Not needed for import |
| `deposit_payment_intent_id` | Set to `manual-{id}` | ✅ | |
| `reserved_studio_expires_at` | NULL for historical | ✅ | |
| `submitted_at` | From CSV `submitted_at` | ✅ | |
| `cancelled_at` | Not set | ✅ | OK for confirmed apps |
| `selected_payment_plan_id` | From `payment_plan_name` | ❌ **MISSING** | **MUST FIX** |
| `cashback_amount` | Auto-applied via trigger | ✅ | Can add to CSV if known |
| `is_rebooking` | Not imported | ⚠️ | Add if needed |
| `previous_application_id` | Not imported | ⚠️ | Add if needed |
| `referred_by_partner_id` | From `referral_code` | ✅ | Via partner_referrals table |

---

## 🎯 STUDENT PORTAL ACCESS REQUIREMENTS

### What Students Need to See Their Data:

1. **Dashboard Page:**
   - ✅ Applications list (any status)
   - ✅ Application details
   - ✅ Contract information
   - ✅ Studio assignment

2. **Payments Page:**
   - ✅ Confirmed applications only
   - ❌ **REQUIRES:** `contract_payment_schedule` OR `selected_payment_plan_id` + payment plan installments
   - ❌ **REQUIRES:** Payment history (manual_payments + stripe_payments)

3. **Documents Page:**
   - ✅ All applications
   - ✅ Document records (from `student_documents` table)
   - ✅ Document status

4. **Profile Page:**
   - ✅ User profile data
   - ✅ Password change

---

## 🔄 COMPLETE IMPORT WORKFLOW

### Step-by-Step Process:

1. **Pre-Import Setup:**
   - ✅ Fix critical bugs (#1, #2)
   - ✅ Generate payment schedules for contracts
   - ✅ Verify all dependencies
   - ✅ Pre-upload documents

2. **Import Execution:**
   - ✅ Create users (Edge Function)
   - ✅ Send password reset emails
   - ✅ Create applications (Database Function)
   - ✅ Create application steps
   - ✅ Create document records
   - ✅ Create payment records
   - ✅ Link partner referrals

3. **Post-Import:**
   - ✅ Verify `selected_payment_plan_id` set
   - ✅ Verify payment schedules exist
   - ✅ Test student login
   - ✅ Test portal access
   - ✅ Test payment viewing
   - ✅ Test document viewing

---

## 📋 FINAL CHECKLIST

### **Before Bulk Import:**

- [ ] **Fix Bug #1:** Manual payments column names
- [ ] **Fix Bug #2:** Set `selected_payment_plan_id`
- [ ] **Fix Bug #3:** Check `contract_payment_plans` junction table
- [ ] **Generate Payment Schedules:** For all contracts (or implement auto-generation)
- [ ] **Test Import:** With 5-10 sample applications
- [ ] **Verify Dependencies:** All contracts, studios, payment plans exist
- [ ] **Pre-Upload Documents:** If using document paths

### **After Bulk Import:**

- [ ] **Verify Applications:** All created successfully
- [ ] **Verify Users:** All created and can log in
- [ ] **Verify Payment Plans:** `selected_payment_plan_id` set on all
- [ ] **Verify Payment Schedules:** Exist or can be generated
- [ ] **Test Portal Access:** Students can log in
- [ ] **Test Payment Viewing:** Payment schedule visible
- [ ] **Test Document Viewing:** Documents visible
- [ ] **Test Payment History:** Historical payments visible

---

## 🎯 SUMMARY

### **Critical Issues (Must Fix):**
1. ❌ Manual payments insert uses wrong column names
2. ❌ `selected_payment_plan_id` not set (breaks payment portal)
3. ❌ Payment schedules may not exist (breaks payment portal)

### **High Priority (Should Fix):**
4. ⚠️ Installment payment import missing
5. ⚠️ `contract_payment_plans` junction table not checked

### **Enhancements (Nice to Have):**
6. 📧 Custom welcome email
7. 📊 Email tracking
8. 📋 Rebooking fields
9. 💰 Cashback amount import

### **Status:**
- ✅ User creation: Working
- ✅ Application creation: Working (with fixes needed)
- ✅ Document handling: Working
- ❌ Payment functionality: **BROKEN** (missing `selected_payment_plan_id`)
- ❌ Payment history: **INCOMPLETE** (no installment import)

---

**Next Steps:**
1. Fix the 3 critical bugs
2. Test with sample data
3. Generate payment schedules
4. Proceed with full import

