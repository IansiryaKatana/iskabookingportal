# Urban Hub Booking Portal - Comprehensive Roadmap & Recommendations

## Table of Contents
1. [Improvements Made Beyond Spec](#improvements-made-beyond-spec)
2. [Scalability Assessment](#scalability-assessment)
3. [Post-Confirmation Workflow (Student Management)](#post-confirmation-workflow)
4. [Finance Department Features](#finance-department-features)
5. [Payment Options Enhancement](#payment-options-enhancement)
6. [In-Person Deposit Handling](#in-person-deposit-handling)
7. [Reporting & Analytics](#reporting--analytics)
8. [Communication System](#communication-system)
9. [Implementation Priority Matrix](#implementation-priority-matrix)
10. [Database Schema Additions](#database-schema-additions)

---

## 1. Improvements Made Beyond Spec

### ✅ **1.1 Step 6: Agreement & Signing (Not in Original Spec)**
**Original Spec**: 5-step journey ending at payment plan selection
**Implementation**: Added 6th step for DocuSign agreement signing
- **Features**:
  - Real-time envelope status display
  - Auto-polling of DocuSign status every 30 seconds
  - "Sign tenancy agreement" button with popup blocker handling
  - "Open DocuSign again" functionality
  - Progress bar turns green at 100% when all signatures complete
  - Separate handling for tenancy and guarantor agreements
- **Impact**: Better UX for signature workflow, reduces confusion

### ✅ **1.2 Multiple Payment Plans Per Contract (Enhanced)**
**Original Spec**: Contract linked to single payment plan
**Implementation**: `contract_payment_plans` junction table allowing multiple plans per contract
- **Features**:
  - Students can choose from multiple payment plan options per contract
  - Admin can associate multiple plans (3-instalment, 4-instalment, 10-instalment) with same contract
  - Dynamic plan selection in Step 5
- **Impact**: More flexibility for students, better business model support

### ✅ **1.3 Enhanced Document Management**
**Original Spec**: Basic document upload
**Implementation**: 
- Document sync functionality
- Document metadata stored in `student_documents` table
- Document verification status tracking
- Re-upload capability for rejected documents
- Document preview with thumbnails
- Progress indicators during upload
- **Impact**: Better document lifecycle management

### ✅ **1.4 Payment Status Tracking**
**Original Spec**: Basic payment intent creation
**Implementation**:
- `check-payment-status` Edge Function
- Real-time payment status updates
- Payment history tracking
- Automatic status refresh on Payments page
- Deposit vs instalment payment distinction
- **Impact**: Better financial tracking and transparency

### ✅ **1.5 Studio Catalog as Landing Page**
**Original Spec**: Generic landing page
**Implementation**: Studio catalog is now the default route (`/`)
- Hero section with background image
- Auto-advancing image carousel (5-second intervals)
- "5 Room Grades to Choose From" headline
- **Impact**: Better user engagement, direct access to studio options

### ✅ **1.6 Skeleton Loaders Throughout**
**Original Spec**: Basic loading states
**Implementation**: Component-specific skeleton loaders on all pages
- Matches component structure
- Better perceived performance
- Consistent UX across portal
- **Impact**: Professional loading experience

### ✅ **1.7 Fixed Sidebar Navigation**
**Original Spec**: Standard sidebar
**Implementation**: Fixed-height, scrollable sidebar with fixed header/footer
- Sign out button always visible
- Better navigation on long pages
- Applied to both student and admin portals
- **Impact**: Improved navigation UX

### ✅ **1.8 Dynamic Page Titles**
**Original Spec**: Static page titles
**Implementation**: Dynamic titles based on route and content
- Studio pages show studio name
- Format: "{Page Name} | Urban Hub Booking Portal"
- **Impact**: Better SEO and browser tab identification

### ✅ **1.9 Enhanced Error Handling**
**Original Spec**: Basic error handling
**Implementation**:
- Global error handlers for Stripe postMessage errors
- Specific error messages for different failure scenarios
- Retry mechanisms for failed operations
- **Impact**: Better error recovery and user experience

### ✅ **1.10 Payment Plan Selection Persistence**

### ✅ **1.11 Contracts Page Enhancements (2025-01-25)**
**Implementation**: Major improvements to contract management interface
- **Academic Year Context Toggle**: Added filter dropdown to view contracts by academic year, defaults to active year
- **Editable Contract Names**: Contract names can now be edited after creation (previously only during creation)
- **Payment Plan Order Persistence**: Payment plan display order now persists correctly when reopening edit dialog (previously reset to alphabetical)
- **Default Payment Plan Order**: Implemented sensible default order (Pay in Full, 3 Instalments, 4 Instalments, 10 Instalments) with 1-based indexing (1,2,3,4) instead of 0-based
- **Weeks Calculation Accuracy**: Changed from Math.ceil() to Math.round() for accurate contract duration (e.g., 45.14 weeks now rounds to 45 instead of 46)
- **Automatic Weeks Recalculation**: Weeks value is automatically recalculated and saved when contract dates are modified
- **Impact**: Improved contract management workflow, accurate calculations, better user experience

---

### ✅ **1.12 Payment Plan Selection Persistence**
**Original Spec**: Basic plan selection
**Implementation**:
- RPC function `set_selected_payment_plan` to handle PostgREST cache issues
- Immediate UI updates on plan selection
- Persistent selection across page reloads
- **Impact**: Reliable plan selection workflow

---

## 2. Scalability Assessment

### ✅ **2.1 Multiple Academic Years - CURRENTLY SUPPORTED**

**Database Design**:
- `academic_years` table with `is_active` flag
- All pricing, contracts, and payment plans linked to `academic_year_id`
- Applications inherit academic year through contract relationship

**Current Implementation**:
```sql
-- Contracts linked to academic year
contracts.academic_year_id → academic_years.id

-- Payment plans per academic year
payment_plans.academic_year_id → academic_years.id

-- Pricing per academic year + grade
studio_grade_prices.academic_year_id → academic_years.id
```

**Scalability Status**: ✅ **FULLY SCALABLE**
- System can handle unlimited academic years
- Data is properly partitioned by academic year
- No hardcoded year references
- Admin can activate/deactivate years

**Recommendations**:
1. ✅ Already implemented - no changes needed
2. Consider adding academic year filter to admin dashboard
3. Add "Archive" functionality for old academic years (keep data, hide from active views)

### ⚠️ **2.2 Potential Scalability Concerns**

#### **2.2.1 Query Performance**
- **Issue**: Some queries may slow down with thousands of applications
- **Solution**: 
  - Add database indexes on frequently queried fields
  - Implement pagination for application lists
  - Use database views for common queries

#### **2.2.2 Storage Growth**
- **Issue**: Document storage will grow over time
- **Solution**:
  - Implement storage lifecycle policies (archive old documents)
  - Consider S3 lifecycle rules for old contracts
  - Regular cleanup of temporary files

#### **2.2.3 Real-time Updates**
- **Issue**: Polling every 30 seconds for DocuSign status may not scale
- **Solution**:
  - Implement DocuSign webhooks (already planned)
  - Use Supabase Realtime for status updates
  - Reduce polling frequency or make it on-demand

---

## 3. Post-Confirmation Workflow (Student Management)

### 🎯 **3.1 Student Record Creation**

**Current State**: When application is `confirmed`, it becomes a student record
**Required Implementation**:

#### **3.1.1 Student Records View**
- **Route**: `/admin/students`
- **Features**:
  - List all confirmed applications (students)
  - Search by name, email, student ID, UCAS ID
  - Filter by:
    - Academic year
    - Studio grade
    - Contract type
    - Payment plan
    - Studio assignment
    - Status (active, completed, cancelled)
  - Sort by: name, application date, contract start date
  - Pagination (50 per page)

#### **3.1.2 Student Detail View**
- **Route**: `/admin/students/:id`
- **Features**:
  - Full application history
  - Contact information
  - Contract details
  - Payment history
  - Document status
  - Studio assignment
  - Communication history
  - Notes/comments section

### 🎯 **3.2 Student Search & Filter**

**Implementation**:
```typescript
// Search functionality
- Full-text search: name, email, UCAS ID, phone
- Advanced filters:
  * Academic year dropdown
  * Studio grade multi-select
  * Payment plan filter
  * Payment status (up-to-date, overdue, partial)
  * Document status (all verified, pending)
  * Studio status (assigned, unassigned)
  * Contract dates (date range picker)
```

### 🎯 **3.3 Reports & CSV Exports**

#### **3.3.1 Awaiting Signatures Report**
- **Query**: Applications with status `awaiting_signature` where envelopes not completed
- **Columns**: Name, Email, Phone, Contract, Days Waiting, Last Contact
- **Action**: Export to CSV

#### **3.3.2 Awaiting Deposit Report**
- **Query**: Applications with status `awaiting_deposit`
- **Columns**: Name, Email, Phone, Contract, Deposit Amount, Days Waiting
- **Action**: Export to CSV

#### **3.3.3 Overdue Payments Report**
- **Query**: Instalments with `due_date < today` and status not "paid"
- **Columns**: Name, Email, Phone, Instalment Label, Due Date, Amount, Days Overdue
- **Action**: Export to CSV

#### **3.3.4 Debtors Report**
- **Query**: Students with any unpaid instalments
- **Columns**: Name, Email, Phone, Total Owed, Oldest Overdue Date, Number of Overdue Payments
- **Action**: Export to CSV

#### **3.3.5 Occupancy Report**
- **Query**: Studio assignments by grade, floor, building
- **Columns**: Studio Number, Grade, Floor, Student Name, Contract Start, Contract End, Status
- **Action**: Export to CSV

#### **3.3.6 Revenue Report**
- **Query**: Total bookings by contract, payment plan, academic year
- **Columns**: Contract, Payment Plan, Number of Bookings, Total Revenue, Average Booking Value
- **Action**: Export to CSV

### 🎯 **3.4 Bulk Messaging System**

#### **3.4.1 Message Creation**
- **Route**: `/admin/communications/bulk-message`
- **Features**:
  - Select recipients:
    * All students
    * Filtered list (by status, grade, etc.)
    * Custom selection
  - Choose template or write custom message
  - Preview message
  - Schedule send time (optional)
  - Send immediately or schedule

#### **3.4.2 Notification System**
- **Student Portal**: Notification bell with unread count
- **Notification Center**: List of all notifications
- **Email Integration**: Send email copy to registered email
- **Read/Unread Status**: Track which notifications are read

#### **3.4.3 Email Templates**
- **Route**: `/admin/communications/templates`
- **Template Types**:
  - Welcome email (after confirmation)
  - Payment reminder
  - Payment overdue
  - Document request
  - Contract renewal
  - Maintenance notice
  - Custom template
- **Features**:
  - Template editor with variables ({{student_name}}, {{contract_name}}, etc.)
  - Preview with sample data
  - Test send
  - Version history

---

## 4. Finance Department Features

### 🎯 **4.1 Financial Calculations**

#### **4.1.1 Current State Analysis**
**Question**: Do we compute booking valuations?
**Answer**: ⚠️ **PARTIALLY**

**What's Calculated**:
- Weekly price × weeks = Total contract value (implicitly)
- Payment plan instalments (percentages of total)
- Deposit amounts

**What's Missing**:
- Explicit `total_contract_value` field on applications
- Revenue projections
- Outstanding balance calculations
- Payment history summaries

#### **4.1.2 Required Calculations**

```sql
-- Total Contract Value
total_contract_value = (
  COALESCE(contract.weekly_price_override, studio_grade_prices.weekly_price) 
  * contract.weeks
)

-- Outstanding Balance
outstanding_balance = total_contract_value - (
  deposit_paid + SUM(paid_instalments)
)

-- Revenue Projection
revenue_projection = SUM(total_contract_value) 
  WHERE status IN ('confirmed', 'awaiting_signature', 'awaiting_verification')
```

### 🎯 **4.2 Finance Dashboard**

**Route**: `/admin/finance` (or `/admin` with finance role filter)

**Key Metrics**:
1. **Total Revenue** (confirmed bookings)
2. **Outstanding Receivables** (unpaid instalments)
3. **Overdue Amount** (past due instalments)
4. **This Month's Collections** (payments received this month)
5. **Upcoming Payments** (next 30 days)
6. **Collection Rate** (paid vs total due)

**Charts**:
- Revenue by month (line chart)
- Payment status breakdown (pie chart)
- Overdue by days (bar chart)
- Payment plan distribution (bar chart)

### 🎯 **4.3 Financial Reports**

#### **4.3.1 Payment Register**
- All payments received (deposits + instalments)
- Date, Student, Amount, Payment Method, Reference
- Export to CSV

#### **4.3.2 Aged Debt Report**
- Outstanding balances grouped by age (0-30, 31-60, 61-90, 90+ days)
- Export to CSV

#### **4.3.3 Revenue by Contract Type**
- Total revenue grouped by contract (45-week, 51-week)
- Export to CSV

#### **4.3.4 Payment Plan Performance**
- Revenue by payment plan type
- Average payment time
- Default rates
- Export to CSV

### 🎯 **4.4 Finance-Specific Features**

1. **Manual Payment Recording**
   - Record in-person/cash payments
   - Link to instalment
   - Add receipt reference
   - Mark as paid

2. **Refund Management**
   - Process refunds
   - Link to original payment
   - Track refund reason
   - Export refund report

3. **Payment Reconciliation**
   - Match Stripe payments to instalments
   - Flag discrepancies
   - Manual adjustment capability

4. **Invoice Generation**
   - Generate invoices for payments
   - PDF download
   - Email to student
   - Bulk invoice generation

---

## 5. Payment Options Enhancement

### 🎯 **5.1 Full Payment Option (Pay-in-Full)**

#### **5.1.1 Current State**
- Spec mentions "5-step journey" with payment plan selection
- Current implementation: Multiple payment plans (3, 4, 10 instalments)
- **Missing**: Pay-in-full option

#### **5.1.2 Implementation Plan**

**Database Changes**:
```sql
-- Add pay_in_full flag to payment_plans
ALTER TABLE payment_plans 
ADD COLUMN is_pay_in_full BOOLEAN DEFAULT FALSE;

-- Or create a special "Pay in Full" payment plan
-- with no installments (just deposit)
```

**UI Changes**:
1. **Step 5 - Payment Plan Selection**:
   - Add "Pay in Full" option alongside instalment plans
   - Show total amount if pay-in-full selected
   - Hide guarantor section (not needed for pay-in-full)
   - Show witness section (needed for tenancy agreement)

2. **Payment Flow**:
   - If pay-in-full selected:
     * Deposit payment (same as current)
     * After deposit: Show "Pay Remaining Balance" button
     * Single payment for (total - deposit)
     * No instalment schedule created

**Code Changes**:
```typescript
// In ApplicationWizard Step 5
const isPayInFull = selectedPlan?.is_pay_in_full ?? false;

// After deposit payment
if (isPayInFull) {
  // Show "Pay Remaining Balance" option
  // Calculate: total_contract_value - deposit_amount
  // Create single payment intent for remaining amount
}
```

### 🎯 **5.2 Contract Configuration**

**Admin Interface**:
- When creating/editing contracts
- Add checkbox: "Allow Pay-in-Full"
- If checked, create/associate a "Pay in Full" payment plan
- This plan has:
  - Deposit amount (same as other plans)
  - No installments
  - `is_pay_in_full = true`

---

## 6. In-Person Deposit Handling

### 🎯 **6.1 Problem Statement**
Student pays deposit in person (cash/card at office), but needs to complete booking journey online.

### 🎯 **6.2 Solution Options**

#### **Option A: Admin Mark Deposit as Paid (Recommended)**
**Implementation**:
1. Admin goes to application detail page
2. Click "Mark Deposit as Paid" button
3. Enter payment details:
   - Payment method (cash, card, bank transfer)
   - Payment reference/receipt number
   - Payment date
   - Amount (defaults to deposit amount, can override)
4. System updates:
   - `deposit_payment_intent_id` = "manual-{receipt_number}"
   - `deposit_paid` flag in Step 5 payload = true
   - Application status → `awaiting_signature` (if Step 5 complete)
5. Student can now proceed to Step 6 (signing)

**UI Flow**:
```
Admin Application Detail Page
  → Payment Section
    → "Record Manual Deposit Payment" button
      → Modal form:
        - Payment Method (dropdown)
        - Receipt/Reference Number
        - Payment Date
        - Amount
        - Notes
      → Save
```

#### **Option B: Student Self-Service with Code**
**Implementation**:
1. Admin generates payment verification code
2. Student enters code in Step 5
3. System verifies code and marks deposit as paid

**Pros**: Student can self-serve
**Cons**: More complex, code management overhead

#### **Option C: Payment Link Generation**
**Implementation**:
1. Admin generates unique payment link
2. Link pre-fills deposit amount
3. Student pays via link (even if in person, staff can use link)

**Pros**: All payments go through Stripe
**Cons**: Requires Stripe terminal or manual entry

### 🎯 **6.3 Recommended Implementation (Option A)**

**Database Changes**:
```sql
-- Add manual payment tracking
CREATE TABLE manual_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES student_applications(id),
  payment_type TEXT NOT NULL, -- 'deposit', 'instalment'
  amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL, -- 'cash', 'card', 'bank_transfer'
  receipt_number TEXT,
  payment_date DATE NOT NULL,
  recorded_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Admin UI**:
- Application detail page → Payments tab
- "Record Manual Payment" button
- Form to enter payment details
- Updates application status accordingly

**Student Experience**:
- Step 5 shows "Deposit Received" if manually recorded
- Can proceed to Step 6 immediately
- No payment form shown if deposit already paid

---

## 7. Reporting & Analytics

### 🎯 **7.1 Report Generation System**

**Architecture**:
- Reports page: `/admin/reports`
- Each report type has:
  - Filter options
  - Preview table
  - Export to CSV button
  - Schedule export (future)

**Report Types**:

1. **Awaiting Signatures**
   ```sql
   SELECT 
     a.id,
     p.first_name || ' ' || p.last_name AS student_name,
     p.email,
     p.phone,
     c.name AS contract_name,
     a.created_at,
     NOW() - a.created_at AS days_waiting
   FROM student_applications a
   JOIN profiles p ON a.student_id = p.id
   JOIN contracts c ON a.contract_id = c.id
   WHERE a.status = 'awaiting_signature'
     AND EXISTS (
       SELECT 1 FROM docusign_envelopes de
       WHERE de.application_id = a.id
         AND de.status != 'completed'
     )
   ORDER BY a.created_at ASC;
   ```

2. **Awaiting Deposit**
   ```sql
   SELECT 
     a.id,
     p.first_name || ' ' || p.last_name AS student_name,
     p.email,
     p.phone,
     c.name AS contract_name,
     COALESCE(c.deposit_override, pp.deposit_amount) AS deposit_amount,
     a.created_at,
     NOW() - a.created_at AS days_waiting
   FROM student_applications a
   JOIN profiles p ON a.student_id = p.id
   JOIN contracts c ON a.contract_id = c.id
   LEFT JOIN payment_plans pp ON a.selected_payment_plan_id = pp.id
   WHERE a.status = 'awaiting_deposit'
   ORDER BY a.created_at ASC;
   ```

3. **Overdue Payments**
   ```sql
   SELECT 
     a.id AS application_id,
     p.first_name || ' ' || p.last_name AS student_name,
     p.email,
     p.phone,
     cps.label AS instalment_label,
     cps.due_date,
     cps.amount,
     NOW()::date - cps.due_date AS days_overdue
   FROM contract_payment_schedule cps
   JOIN student_applications a ON cps.contract_id = a.contract_id
   JOIN profiles p ON a.student_id = p.id
   WHERE cps.due_date < NOW()::date
     AND cps.id NOT IN (
       SELECT instalment_id 
       FROM payments 
       WHERE status = 'paid'
     )
     AND a.status = 'confirmed'
   ORDER BY days_overdue DESC;
   ```

4. **Debtors Report**
   ```sql
   SELECT 
     a.id,
     p.first_name || ' ' || p.last_name AS student_name,
     p.email,
     p.phone,
     SUM(cps.amount) AS total_owed,
     MIN(cps.due_date) AS oldest_overdue_date,
     COUNT(*) AS overdue_count
   FROM student_applications a
   JOIN profiles p ON a.student_id = p.id
   JOIN contract_payment_schedule cps ON a.contract_id = cps.contract_id
   WHERE cps.due_date < NOW()::date
     AND cps.id NOT IN (
       SELECT instalment_id FROM payments WHERE status = 'paid'
     )
     AND a.status = 'confirmed'
   GROUP BY a.id, p.first_name, p.last_name, p.email, p.phone
   ORDER BY total_owed DESC;
   ```

5. **Occupancy Report**
   ```sql
   SELECT 
     s.studio_number,
     sg.name AS studio_grade,
     s.floor,
     s.building,
     p.first_name || ' ' || p.last_name AS student_name,
     c.contract_start,
     c.contract_end,
     a.status
   FROM studios s
   LEFT JOIN student_applications a ON s.id = a.assigned_studio_id
   LEFT JOIN profiles p ON a.student_id = p.id
   LEFT JOIN contracts c ON a.contract_id = c.id
   JOIN studio_grades sg ON s.studio_grade_id = sg.id
   WHERE a.status = 'confirmed'
   ORDER BY sg.name, s.floor, s.studio_number;
   ```

### 🎯 **7.2 CSV Export Implementation**

**Edge Function**: `export-report`
- Accepts report type and filters
- Generates CSV
- Returns download URL or streams response

**Frontend**:
```typescript
const exportReport = async (reportType: string, filters: ReportFilters) => {
  const { data, error } = await supabase.functions.invoke('export-report', {
    body: { reportType, filters }
  });
  
  if (data?.csvUrl) {
    window.open(data.csvUrl, '_blank');
  }
};
```

---

## 8. Communication System

### 🎯 **8.1 Notification System**

#### **8.1.1 Database Schema**
```sql
-- Already exists: notifications table
-- Enhance with:
ALTER TABLE notifications ADD COLUMN notification_type TEXT;
ALTER TABLE notifications ADD COLUMN metadata JSONB;
ALTER TABLE notifications ADD COLUMN action_url TEXT;
```

#### **8.1.2 Notification Types**
- `payment_due` - Instalment due soon
- `payment_overdue` - Payment past due
- `document_request` - Document verification needed
- `signature_required` - Agreement signing needed
- `application_update` - Status change
- `bulk_message` - Admin broadcast
- `maintenance_notice` - Facility maintenance

#### **8.1.3 Student Portal Integration**
- Notification bell in header (unread count badge)
- Notification center dropdown
- Mark as read functionality
- Link to relevant page (payments, documents, etc.)

### 🎯 **8.2 Email Template System**

#### **8.2.1 Database Schema**
```sql
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  template_type TEXT NOT NULL,
  variables JSONB, -- Available variables: {{student_name}}, {{contract_name}}, etc.
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES email_templates(id),
  recipient_id UUID REFERENCES auth.users(id),
  application_id UUID REFERENCES student_applications(id),
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT, -- 'sent', 'failed', 'bounced'
  error_message TEXT
);
```

#### **8.2.2 Template Variables**
- `{{student_name}}` - Full name
- `{{first_name}}` - First name
- `{{contract_name}}` - Contract name
- `{{studio_grade}}` - Studio grade name
- `{{deposit_amount}}` - Deposit amount
- `{{total_amount}}` - Total contract value
- `{{due_date}}` - Payment due date
- `{{overdue_amount}}` - Overdue amount
- `{{payment_link}}` - Link to payment page

#### **8.2.3 Template Editor**
- Rich text editor (TinyMCE or similar)
- Variable picker dropdown
- Preview with sample data
- Test send functionality

### 🎯 **8.3 Bulk Messaging**

**Implementation**:
1. Select recipients (filter or custom list)
2. Choose template or write custom
3. Preview message
4. Send immediately or schedule
5. Track delivery status
6. Create notification + send email

**Edge Function**: `send-bulk-message`
- Accepts recipient list, message, template ID
- Creates notifications for all recipients
- Sends emails via Resend/SendGrid
- Returns delivery status

---

## 9. Implementation Priority Matrix

### 🔴 **Phase 1: Critical (Weeks 1-2)**
1. ✅ Fix confirmed status reversion (DONE)
2. Student Management - List & Search
3. Financial Calculations - Total contract value
4. Manual Deposit Recording
5. Basic Reports (Awaiting Signatures, Awaiting Deposit)

### 🟡 **Phase 2: High Priority (Weeks 3-4)**
6. Overdue Payments Report
7. Debtors Report
8. Occupancy Report
9. CSV Export functionality
10. Notification System (basic)
11. Email Template System (basic)

### 🟢 **Phase 3: Medium Priority (Weeks 5-6)**
12. Pay-in-Full Option
13. Bulk Messaging
14. Finance Dashboard
15. Revenue Reports
16. Payment Reconciliation

### ⚪ **Phase 4: Enhancements (Weeks 7-8)**
17. Advanced Analytics
18. Scheduled Reports
19. Email Template Editor (advanced)
20. Communication History
21. Automated Payment Reminders

---

## 10. Database Schema Additions

### **10.1 Required New Tables**

```sql
-- Manual Payments
CREATE TABLE manual_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES student_applications(id),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('deposit', 'instalment')),
  instalment_id UUID REFERENCES contract_payment_schedule(id),
  amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'cheque')),
  receipt_number TEXT,
  payment_date DATE NOT NULL,
  recorded_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email Templates
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  template_type TEXT NOT NULL,
  variables JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email Sends (Audit Trail)
CREATE TABLE email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES email_templates(id),
  recipient_id UUID REFERENCES auth.users(id),
  application_id UUID REFERENCES student_applications(id),
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT CHECK (status IN ('sent', 'failed', 'bounced')),
  error_message TEXT,
  external_id TEXT -- Email service message ID
);

-- Payment Plan Enhancement
ALTER TABLE payment_plans 
ADD COLUMN is_pay_in_full BOOLEAN DEFAULT FALSE;

-- Application Enhancement
ALTER TABLE student_applications
ADD COLUMN total_contract_value NUMERIC(10,2);

-- Payments Tracking (if not exists)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES student_applications(id),
  instalment_id UUID REFERENCES contract_payment_schedule(id),
  amount NUMERIC(10,2) NOT NULL,
  payment_intent_id TEXT,
  payment_method TEXT,
  status TEXT CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### **10.2 Indexes for Performance**

```sql
-- Student search
CREATE INDEX idx_profiles_name ON profiles(first_name, last_name);
CREATE INDEX idx_profiles_email ON profiles(email);

-- Application queries
CREATE INDEX idx_applications_status ON student_applications(status);
CREATE INDEX idx_applications_student_status ON student_applications(student_id, status);

-- Payment queries
CREATE INDEX idx_payments_application ON payments(application_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_schedule_due_date ON contract_payment_schedule(due_date);

-- Notification queries
CREATE INDEX idx_notifications_user_read ON notifications(user_id, read_at);
```

---

## 11. Next Steps & Recommendations

### **Immediate Actions**:
1. ✅ Document all improvements made
2. ✅ Assess scalability (DONE - fully scalable)
3. Create student management module
4. Implement financial calculations
5. Add manual deposit recording

### **Architecture Decisions Needed**:
1. **Email Service**: Resend vs SendGrid? (Recommend Resend for simplicity)
2. **Report Generation**: Edge Function vs Database Function? (Recommend Edge Function for CSV)
3. **Notification Delivery**: Real-time vs Polling? (Recommend Supabase Realtime)
4. **Payment Tracking**: Separate table vs contract_payment_schedule? (Recommend separate `payments` table)

### **Risk Mitigation**:
- All new features should be additive (don't break existing)
- Use feature flags for gradual rollout
- Comprehensive testing before production
- Backup strategy for financial data

---

## Conclusion

The system is **well-architected and scalable** for multiple academic years. The main gaps are in:
1. **Post-confirmation student management**
2. **Financial reporting and calculations**
3. **Communication systems**
4. **Payment flexibility (pay-in-full, manual payments)**

All recommended features can be implemented incrementally without breaking existing functionality. The database schema is solid and can accommodate all proposed enhancements.

**Estimated Timeline**: 6-8 weeks for full implementation of all features.

