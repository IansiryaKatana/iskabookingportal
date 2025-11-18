# Clarifying Questions - Answers & Recommendations

Based on intimate knowledge of the Urban Hub Booking Portal system and database schema.

---

## 1. Studio Availability Questions

### Q1.1: Should "reserved" studios count as available or unavailable?

**My Recommendation:** ✅ **Count as UNAVAILABLE**

**Reasoning:**
- Your system has `reserved_studio_expires_at` and a `release-expired-reservations` Edge Function
- Reservations are temporary holds (typically 24-48 hours based on industry standards)
- A reserved studio is effectively "taken" until the reservation expires or is confirmed
- Counting reserved as unavailable prevents double-booking and shows accurate real-time availability
- Students see accurate availability, reducing frustration from "just booked" scenarios

**Implementation:**
```sql
-- Available studios = status = 'available' AND (reservation_expires_at IS NULL OR reservation_expires_at < NOW())
-- Unavailable = status IN ('reserved', 'occupied', 'maintenance')
```

### Q1.2: How long should a reservation last before being released?

**My Recommendation:** ✅ **24 hours (configurable)**

**Reasoning:**
- Your `release-expired-reservations` function already exists and runs periodically
- 24 hours is standard for student accommodation (gives time to complete application)
- Should be configurable per academic year or contract type
- Can be extended if student is actively completing application (track last activity)

**Implementation:**
- Add `reservation_duration_hours` to `contracts` table (default: 24)
- Update reservation logic to use contract-specific duration
- Consider extending if student is on step 5-6 of application

### Q1.3: Should "maintenance" studios count in total capacity?

**My Recommendation:** ✅ **NO - Exclude from total capacity**

**Reasoning:**
- Maintenance studios are temporarily unavailable for booking
- They shouldn't inflate "total studios" count
- Only count `is_active = true` studios in capacity calculations
- Maintenance is temporary, so it's not a permanent reduction

**Implementation:**
```sql
-- Total capacity = COUNT(*) WHERE studio_grade_id = X AND is_active = true AND status != 'maintenance'
-- Available = COUNT(*) WHERE status = 'available' AND is_active = true
```

### Q1.4: What are the exact thresholds for each tag?

**My Recommendation:**
- **"Going Fast"**: When < 20% available (e.g., 20/100 left, 15/75 left)
- **"X Left"**: When ≤ 5 studios available (show exact number: "5 Left", "4 Left", etc.)
- **"2 Left"**: When exactly 2 available
- **"1 Left"**: When exactly 1 available
- **"Fully Booked"**: When 0 available

**Reasoning:**
- Creates urgency without being misleading
- Exact numbers for very low availability create maximum urgency
- Percentage-based for higher availability (more flexible)
- Industry standard approach

### Q1.5: Should tags update in real-time or on page load?

**My Recommendation:** ✅ **On page load with periodic refresh (every 30 seconds)**

**Reasoning:**
- Real-time WebSocket updates are overkill for this use case
- Page load is sufficient for most users
- Periodic refresh (30s) handles active browsing sessions
- Reduces server load while maintaining reasonable accuracy
- Can add manual refresh button for power users

### Q1.6: Should we show exact numbers (e.g., "15 Left") or ranges?

**My Recommendation:** ✅ **Exact numbers when ≤ 5, percentage when > 5**

**Reasoning:**
- Exact numbers create urgency when availability is very low
- Percentage is cleaner for higher availability
- Matches industry best practices
- Example: "15 Left" (if ≤ 5), "20% Available" (if > 5)

### Q1.7: Should availability be per academic year or global?

**My Recommendation:** ✅ **Per Academic Year (via Contract)**

**Reasoning:**
- Your `contracts` table is already linked to `academic_year_id`
- Studios are assigned via `student_applications` which link to `contracts`
- Availability should be calculated per contract (which implies academic year)
- A studio can be available for 2026/27 but occupied for 2025/26
- This matches your data model perfectly

**Implementation:**
```sql
-- Calculate availability per contract (which includes academic_year)
-- Filter by: contract_id, studio_grade_id, academic_year_id
```

---

## 2. Rebooking Questions

### Q2.1: Should returning students go through full application again or simplified?

**My Recommendation:** ✅ **Simplified with Pre-fill + Required Updates**

**Reasoning:**
- Your `student_application_steps` stores all data as JSON payloads
- Can easily pre-fill from previous application
- Some data may be outdated (address, phone, documents)
- Balance between convenience and data accuracy

**Implementation:**
- Pre-fill all fields from previous application
- Mark certain fields as "needs verification" (documents, address)
- Allow students to update any field
- Require re-verification of critical documents (passport, visa if expired)

### Q2.2: Should previous documents be reused?

**My Recommendation:** ✅ **YES, with Expiration Check**

**Reasoning:**
- Documents are stored in Supabase Storage with metadata
- Passports/visas have expiration dates
- Reuse valid documents, require new ones if expired
- Reduces friction for returning students

**Implementation:**
- Check document expiration dates from `student_documents` metadata
- Auto-approve if still valid
- Flag for re-upload if expired
- Show "Document reused from [previous year]" badge

### Q2.3: Should payment history carry over?

**My Recommendation:** ✅ **YES - Show but Don't Apply**

**Reasoning:**
- Payment history is important for finance department
- Previous payments don't apply to new contract
- Show for reference but start fresh payment schedule
- Helps with loyalty/referral programs

**Implementation:**
- Display previous payment history in rebooking view
- Show "Previous Year Payment History" section
- New contract gets fresh payment schedule
- Link via `previous_application_id`

### Q2.4: What special handling do returning students need?

**My Recommendation:**
- **Loyalty Discounts**: Optional discount field in contracts for returning students
- **Priority Allocation**: Consider returning students first for studio assignment
- **Simplified Verification**: Faster document approval if previous year was clean
- **Communication**: Special email template for returning students

**Reasoning:**
- Encourages retention
- Rewards loyalty
- Streamlines process for known-good students

### Q2.5: How should outstanding balances from previous years be handled?

**My Recommendation:** ✅ **Block Rebooking Until Resolved**

**Reasoning:**
- Your system tracks payments and can calculate outstanding balances
- Finance department needs to resolve before new booking
- Prevents debt accumulation
- Clear business rule

**Implementation:**
- Check payment status of previous application
- If outstanding balance exists, show "Outstanding Balance" message
- Link to payment page or contact finance
- Allow rebooking only after balance cleared

### Q2.6: How long should we retain previous application data?

**My Recommendation:** ✅ **Indefinitely (with Archival Flag)**

**Reasoning:**
- Your data is already retained (no deletion in schema)
- Compliance may require long-term retention
- Historical analysis valuable
- Storage is cheap, data is valuable

**Implementation:**
- Add `is_archived` boolean to `student_applications`
- Archive when academic year ends
- Keep all data, just mark as archived
- Filter archived records in active views

---

## 3. Payment Tracking Questions

### Q3.1: Should we show all payments (Stripe + manual) in one view?

**My Recommendation:** ✅ **YES - Unified View with Source Indicator**

**Reasoning:**
- Your `manual_payments` table exists alongside Stripe payments
- Finance department needs complete picture
- Students should see all payments regardless of method
- Unified view reduces confusion

**Implementation:**
- Create view: `unified_payment_history`
- Include: Stripe payments + manual payments
- Add `payment_source` column: 'stripe' | 'manual'
- Sort by date, show all in chronological order

### Q3.2: How should we handle refunds in payment history?

**My Recommendation:** ✅ **Show as Negative Entries with Refund Badge**

**Reasoning:**
- Your `refunds` table exists and tracks refunds
- Refunds are part of payment history
- Show as negative amount with clear "REFUND" badge
- Maintains complete financial picture

**Implementation:**
- Join `refunds` table in unified view
- Show refunds as negative amounts
- Add `type` column: 'payment' | 'refund'
- Clear visual distinction (red color, refund icon)

### Q3.3: Should payment history be visible to students?

**My Recommendation:** ✅ **YES - Students Should See Their Own Payment History**

**Reasoning:**
- Transparency builds trust
- Students need to track their payments
- Reduces support queries
- Your RLS policies already support this (students can view their own data)

**Implementation:**
- Add payment history section to student portal
- Show in Payments page (already exists, just needs enhancement)
- Filter by application/contract
- Show status: Paid, Pending, Overdue, Refunded

### Q3.4: What defines "fully paid"?

**My Recommendation:** ✅ **All Installments + Deposit Paid, No Outstanding Balance**

**Reasoning:**
- Your `contract_payment_schedule` defines all required payments
- Deposit is separate from installments
- Must account for both Stripe and manual payments
- Calculate: (Sum of all payments) >= (Total contract value)

**Implementation:**
```sql
-- Fully paid = 
--   deposit_paid = true AND
--   SUM(all_payments) >= SUM(contract_payment_schedule.amount)
--   AND no overdue payments
```

### Q3.5: Should we track partial payments?

**My Recommendation:** ✅ **YES - Track Partial Payments with Percentage**

**Reasoning:**
- Students may pay installments partially
- Finance department needs to track progress
- Helps with payment plans and negotiations
- Your system already supports this via payment amounts

**Implementation:**
- Show payment progress: "£500 of £1,000 paid (50%)"
- Track per-installment: "Instalment 1: £200 of £250 (80%)"
- Visual progress bars
- Alert when partial payment received

### Q3.6: What day should weekly reports cover?

**My Recommendation:** ✅ **Monday-Sunday (Standard Business Week)**

**Reasoning:**
- Standard business practice
- Aligns with most finance departments
- Easier to compare week-over-week
- Monday start is intuitive

**Implementation:**
- Default to current week (Monday-Sunday)
- Allow date range selector
- Show week number and dates clearly

### Q3.7: What information should be included in weekly reports?

**My Recommendation:**
- **Summary Metrics:**
  - Total payments received (Stripe + manual)
  - Number of payments
  - Average payment amount
  - Payment method breakdown
- **By Student:**
  - Student name, email
  - Payment amount, date, method
  - Application ID, contract
  - Payment type (deposit/instalment)
- **By Contract Type:**
  - Payments per contract
  - Revenue per studio grade
- **Outstanding:**
  - Overdue payments
  - Expected payments (due this week)

**Reasoning:**
- Comprehensive but not overwhelming
- Actionable for finance department
- Matches your existing report structure
- Exportable to CSV for further analysis

### Q3.8: Who should receive weekly reports?

**My Recommendation:** ✅ **Finance Department + Owner (Optional Auto-Email)**

**Reasoning:**
- Finance department needs it for operations
- Owner may want high-level summary
- Auto-email reduces manual work
- Can be configured per user role

**Implementation:**
- Manual download from Reports page (primary method)
- Optional: Auto-email to finance team every Monday
- Role-based: Only staff/superadmin can access
- Email includes summary + CSV attachment

---

## 4. Historical Data Import Questions

### Q4.1: What format should the CSV be in?

**My Recommendation:** ✅ **Multiple CSV Files (One per Entity Type)**

**Reasoning:**
- Your data model has clear entity separation:
  - Students/Applications
  - Application Steps (JSON payloads)
  - Payments
  - Documents (references)
- Multiple files easier to validate
- Can import in dependency order
- Matches your database structure

**CSV Files Needed:**
1. `students.csv` - Basic student info
2. `applications.csv` - Application records
3. `application_steps.csv` - Step data (JSON payloads)
4. `payments.csv` - Payment records
5. `documents.csv` - Document references
6. `contracts.csv` - Contract assignments

### Q4.2: Should we provide a template?

**My Recommendation:** ✅ **YES - Downloadable Template with Examples**

**Reasoning:**
- Reduces errors
- Shows expected format
- Includes sample data
- Validates before import

**Implementation:**
- "Download Template" button on import page
- Template includes:
  - Column headers
  - Data types
  - Example rows
  - Validation rules
  - Required vs optional fields

### Q4.3: How should we handle missing data?

**My Recommendation:** ✅ **Strict Validation with Clear Error Messages**

**Reasoning:**
- Data integrity is critical
- Missing required fields break relationships
- Better to fail early than import bad data
- Clear errors help fix issues

**Implementation:**
- Validate before import
- Show all errors at once
- Highlight missing required fields
- Allow partial import (skip invalid rows) with warning
- Generate error report CSV

### Q4.4: How should we handle relationships in CSV?

**My Recommendation:** ✅ **Use UUIDs or Temporary IDs with Mapping**

**Reasoning:**
- Your tables use UUIDs as primary keys
- Relationships via foreign keys
- Can use temporary IDs during import, map to real UUIDs
- Or use existing UUIDs if importing from another system

**Implementation:**
- Support both: UUIDs (if available) or temporary IDs
- Create mapping table during import
- Resolve relationships after all data imported
- Validate all foreign keys exist

### Q4.5: Should we support multiple CSV files or one comprehensive file?

**My Recommendation:** ✅ **Multiple Files (as recommended above)**

**Reasoning:**
- Matches database structure
- Easier to validate
- Can import in correct order
- Handles large datasets better
- Can re-import individual files if errors

### Q4.6: What validation rules should we apply?

**My Recommendation:**
- **Required Fields:** All foreign keys, dates, amounts
- **Data Types:** Validate dates, numbers, UUIDs
- **Relationships:** All foreign keys must exist
- **Uniqueness:** Email addresses, application IDs
- **Business Rules:** 
  - Contract dates valid
  - Payment amounts positive
  - Application statuses valid
  - Studio assignments valid

**Reasoning:**
- Prevents data corruption
- Maintains referential integrity
- Catches errors before import
- Clear validation messages

---

## 5. Multi-Tenant Questions

### Q5.1: Should organizations be completely isolated?

**My Recommendation:** ✅ **YES - Complete Data Isolation**

**Reasoning:**
- Security and privacy critical
- Prevents data leakage
- Required for compliance (GDPR, etc.)
- Each organization owns their data

**Implementation:**
- `organization_id` on all tables
- RLS policies filter by `organization_id`
- No cross-organization data access
- Superadmin can switch organizations (for support)

### Q5.2: Should there be a "superadmin" that can see all organizations?

**My Recommendation:** ✅ **YES - But Limited to Support/System Admin**

**Reasoning:**
- You (system owner) need to support multiple organizations
- Technical support requires access
- But regular staff should only see their organization
- Audit logging for superadmin access

**Implementation:**
- Superadmin role exists (already in your system)
- Add `can_access_all_organizations` flag
- Organization switcher for superadmin only
- Log all cross-organization access

### Q5.3: How should we handle shared resources (e.g., Stripe account)?

**My Recommendation:** ✅ **Organization-Specific Configuration**

**Reasoning:**
- Each organization may have their own Stripe account
- Or you may provide Stripe as a service
- Configuration per organization
- Flexible business model

**Implementation:**
- `organization_config` table
- Store Stripe keys per organization
- Or use your Stripe account, track charges per org
- Configurable payment methods per organization

### Q5.4: What should be configurable per organization?

**My Recommendation:**
- **Branding:** Name, logo, colors, favicon
- **Payment:** Stripe keys, payment methods
- **Email:** Resend API key, from email, templates
- **DocuSign:** API keys, templates
- **Features:** Enable/disable features
- **Settings:** Reservation duration, payment terms, etc.

**Reasoning:**
- White-labeling requires branding
- Each org may have different payment setup
- Email/DocuSign may be shared or separate
- Feature flags allow customization

### Q5.5: Should email templates be organization-specific?

**My Recommendation:** ✅ **YES - With Default Templates**

**Reasoning:**
- Each organization has different branding
- Different communication style
- But provide defaults to get started
- Can customize per organization

**Implementation:**
- Add `organization_id` to `email_templates`
- Default templates for new organizations
- Allow customization
- Template library per organization

### Q5.6: Should each organization have its own database or shared?

**My Recommendation:** ✅ **Shared Database with Organization ID (Start Here)**

**Reasoning:**
- Easier to manage initially
- Lower costs
- Can migrate to separate databases later if needed
- Your current architecture supports this

**Future Migration Path:**
- Start: Shared database with `organization_id`
- If organization grows large: Migrate to separate database
- Hybrid: Large orgs get own DB, small orgs shared

### Q5.7: How should we handle billing per organization?

**My Recommendation:** ✅ **Usage-Based or Subscription Model**

**Reasoning:**
- Track usage per organization
- Bill based on students, transactions, or flat fee
- Your system can track metrics per organization

**Implementation:**
- `organization_usage` table
- Track: Students, applications, payments, storage
- Generate invoices per organization
- Integration with billing system (Stripe Billing?)

---

## Summary of Key Recommendations

### Studio Availability
- ✅ Reserved = Unavailable
- ✅ 24-hour reservation duration (configurable)
- ✅ Maintenance excluded from capacity
- ✅ Per academic year (via contract)
- ✅ Dynamic tags: "Going Fast" (<20%), exact numbers (≤5), "Fully Booked" (0)

### Rebooking
- ✅ Simplified workflow with pre-fill
- ✅ Reuse valid documents, require new if expired
- ✅ Show payment history but start fresh
- ✅ Block if outstanding balance
- ✅ Indefinite data retention with archival

### Payment Tracking
- ✅ Unified view (Stripe + manual)
- ✅ Refunds as negative entries
- ✅ Students see their own history
- ✅ Fully paid = all installments + deposit, no outstanding
- ✅ Track partial payments
- ✅ Weekly reports: Monday-Sunday
- ✅ Auto-email optional

### Historical Data Import
- ✅ Multiple CSV files (one per entity)
- ✅ Downloadable templates
- ✅ Strict validation
- ✅ UUID or temporary ID mapping

### Multi-Tenant
- ✅ Complete isolation
- ✅ Superadmin can access all (with audit)
- ✅ Organization-specific configuration
- ✅ Shared database initially (can migrate)
- ✅ Usage-based billing

---

**Document Version:** 1.0  
**Date:** November 2025  
**Status:** Recommendations Based on System Analysis

