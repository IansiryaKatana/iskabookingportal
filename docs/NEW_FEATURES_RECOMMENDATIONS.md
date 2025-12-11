# New Features Implementation Recommendations

**Date:** December 2025  
**Status:** Planning & Recommendations

---

## Table of Contents

1. [Maintenance/Request Logging for Students](#1-maintenancerequest-logging-for-students)
2. [Check-in/Check-out Functionality in Booking Calendar](#2-check-incheck-out-functionality-in-booking-calendar)
3. [Utility Payments Tracking in Admin Finance](#3-utility-payments-tracking-in-admin-finance)
4. [Login Dialog for Unread Bulk/Targeted Messages](#4-login-dialog-for-unread-bulktargeted-messages)

---

## 1. Maintenance/Request Logging for Students

### Use Case
Students need to log maintenance requests or general requests from their portal. This allows them to report issues (e.g., broken fixtures, heating problems, cleaning requests) without calling or emailing.

### Current System Analysis
- ✅ Student portal exists with navigation (`/portal`)
- ✅ Portal layout with navigation items
- ✅ Student authentication and profile system
- ✅ Notifications system exists
- ❌ **NO maintenance/request system**
- ❌ **NO request tracking table**

### Recommended Implementation

#### 1.1 Database Schema

**New Table: `maintenance_requests`**

```sql
CREATE TABLE public.maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id UUID REFERENCES public.student_applications(id) ON DELETE SET NULL,
  studio_id UUID REFERENCES public.studios(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('maintenance', 'cleaning', 'general', 'other')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'cancelled')),
  images TEXT[], -- Array of storage paths
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_maintenance_requests_student_id ON public.maintenance_requests(student_id);
CREATE INDEX idx_maintenance_requests_status ON public.maintenance_requests(status);
CREATE INDEX idx_maintenance_requests_created_at ON public.maintenance_requests(created_at DESC);
CREATE INDEX idx_maintenance_requests_application_id ON public.maintenance_requests(application_id);
CREATE INDEX idx_maintenance_requests_studio_id ON public.maintenance_requests(studio_id);
CREATE INDEX idx_maintenance_requests_academic_year_id ON public.maintenance_requests(academic_year_id);

-- RLS Policies
ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;

-- Students can view and create their own requests
CREATE POLICY "Students manage own requests" ON public.maintenance_requests
  FOR ALL USING (auth.uid() = student_id);

-- Staff can view and manage all requests
CREATE POLICY "Staff manage all requests" ON public.maintenance_requests
  FOR ALL USING (public.is_staff());

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_maintenance_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER maintenance_requests_updated_at
  BEFORE UPDATE ON public.maintenance_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_maintenance_requests_updated_at();
```

**Storage Bucket: `maintenance-images`**
- Private bucket for maintenance request images
- Path: `maintenance-images/{request_id}/{uuid}.{ext}`
- RLS: Students can upload to their own requests, staff can view all

#### 1.2 UI Implementation

**New Page: `/portal/maintenance`**

**Location:** `src/pages/portal/Maintenance.tsx`

**Features:**
1. **Request List View**
   - Shows all student's requests with status badges
   - Filter by status (pending, in_progress, resolved, cancelled)
   - Sort by date (newest first)
   - Each request shows: title, type, priority, status, created date, last updated

2. **Create Request Dialog/Form**
   - Request type dropdown (maintenance, cleaning, general, other)
   - Title input (required)
   - Description textarea (required)
   - Priority selector (low, normal, high, urgent)
   - Image upload (multiple images, drag-and-drop)
   - Auto-link to current application/studio (if confirmed)
   - Submit button

3. **Request Detail View**
   - Full request details
   - Image gallery
   - Status timeline
   - Resolution notes (if resolved)
   - Ability to add follow-up comments (future enhancement)

**Navigation Update:**
- Add "Maintenance" to `PortalLayout` nav items
- Icon: `Wrench` or `Tool` from lucide-react

#### 1.3 Admin Implementation

**New Page: `/admin/maintenance`**

**Location:** `src/pages/admin/Maintenance.tsx`

**Features:**
1. **Request Management Dashboard**
   - All requests with filters (status, priority, type, student, studio, academic year)
   - Status update actions (pending → in_progress → resolved)
   - Priority update
   - Resolution notes input
   - Link to student application
   - Link to studio

2. **Statistics Cards**
   - Total pending requests
   - High priority requests
   - Requests by type
   - Average resolution time

3. **Bulk Actions**
   - Mark multiple requests as resolved
   - Assign priority in bulk

#### 1.4 Integration Points

1. **Notifications**
   - When student creates request → notify staff
   - When staff updates status → notify student
   - When request resolved → notify student

2. **Activity Logs**
   - Log request creation, status changes, resolutions

3. **Email Notifications** (Optional)
   - Email staff when urgent request created
   - Email student when request resolved

### Implementation Priority
**HIGH** - Improves student experience and operational efficiency

### Estimated Effort
- Database: 2-3 hours
- Student Portal UI: 4-6 hours
- Admin UI: 4-6 hours
- Integration: 2-3 hours
- **Total: 12-18 hours**

---

## 2. Check-in/Check-out Functionality in Booking Calendar

### Use Case
Track actual student check-in and check-out dates separately from contract dates. For example, contract may start on 10th but student checks in on 11th. This is important for:
- Accurate occupancy tracking
- Billing adjustments (if needed)
- Operational planning
- Historical data

### Current System Analysis
- ✅ Booking calendar exists (`/admin/booking-calendar`)
- ✅ `booking_calendar_data` view shows contract dates
- ✅ `student_applications` table exists
- ✅ Contract dates stored in `contracts` table
- ❌ **NO check-in/check-out date fields**
- ❌ **NO check-in/check-out UI in booking calendar**

### Recommended Implementation

#### 2.1 Database Schema

**Add Fields to `student_applications` Table:**

```sql
-- Add check-in and check-out date fields
ALTER TABLE public.student_applications
  ADD COLUMN IF NOT EXISTS actual_check_in_date DATE,
  ADD COLUMN IF NOT EXISTS actual_check_out_date DATE,
  ADD COLUMN IF NOT EXISTS check_in_notes TEXT,
  ADD COLUMN IF NOT EXISTS check_out_notes TEXT,
  ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_out_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_student_applications_check_in_date 
  ON public.student_applications(actual_check_in_date) 
  WHERE actual_check_in_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_applications_check_out_date 
  ON public.student_applications(actual_check_out_date) 
  WHERE actual_check_out_date IS NOT NULL;

-- Update booking_calendar_data view to include check-in/check-out dates
CREATE OR REPLACE VIEW public.booking_calendar_data AS
SELECT 
  s.id AS studio_id,
  s.studio_number,
  s.studio_grade_id,
  sg.name AS studio_grade_name,
  s.allocation,
  s.status::TEXT AS studio_status,
  sa.id AS application_id,
  sa.status::TEXT AS application_status,
  sa.student_id,
  COALESCE(
    p.first_name || ' ' || p.last_name,
    (SELECT 
       TRIM(
         COALESCE(step1.payload->>'first_name', '') || ' ' || 
         COALESCE(step1.payload->>'last_name', '')
       )
     FROM public.student_application_steps step1
     WHERE step1.application_id = sa.id AND step1.step_number = 1
     LIMIT 1),
    'Unknown'
  ) AS student_name,
  NULL::TEXT AS student_email,
  c.id AS contract_id,
  c.name AS contract_name,
  c.contract_start,
  c.contract_end,
  -- Add actual check-in/check-out dates (use contract dates as fallback)
  COALESCE(sa.actual_check_in_date, c.contract_start) AS effective_check_in_date,
  COALESCE(sa.actual_check_out_date, c.contract_end) AS effective_check_out_date,
  sa.actual_check_in_date,
  sa.actual_check_out_date,
  c.academic_year_id,
  ay.name AS academic_year_name,
  sa.created_at AS application_created_at,
  sa.submitted_at,
  sa.cancelled_at
FROM public.studios s
INNER JOIN public.studio_grades sg ON sg.id = s.studio_grade_id
LEFT JOIN public.student_applications sa ON sa.assigned_studio_id = s.id 
  AND sa.status = 'confirmed'
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
WHERE s.is_active = true
ORDER BY s.studio_grade_id, s.studio_number;
```

#### 2.2 UI Implementation

**Update: `src/pages/admin/BookingCalendar.tsx`**

**New Features:**

1. **Check-in/Check-out Actions**
   - When clicking on an occupied date cell, show a popover/dialog with:
     - Student name
     - Contract dates (contract_start, contract_end)
     - Actual check-in date (if set) with "Edit" button
     - Actual check-out date (if set) with "Edit" button
     - "Check In" button (if not checked in)
     - "Check Out" button (if checked in but not checked out)
     - Notes field

2. **Visual Indicators**
   - Different color for dates between contract_start and actual_check_in_date (if different)
   - Different color for dates between actual_check_out_date and contract_end (if different)
   - Tooltip showing: "Contract: Jan 10 - Dec 20, Check-in: Jan 11, Check-out: Dec 18"

3. **Bulk Check-in/Check-out**
   - Select multiple students (via checkboxes)
   - Bulk action: "Check In Selected" or "Check Out Selected"
   - Date picker for bulk check-in/check-out date

4. **Calendar Cell Colors**
   - **Green**: Occupied (between effective_check_in_date and effective_check_out_date)
   - **Light Green**: Contract period but not checked in yet
   - **Yellow**: Checked out but contract still active
   - **Gray**: No booking

#### 2.3 Application Detail Integration

**Update: `src/pages/admin/ApplicationDetail.tsx`**

Add section showing:
- Contract dates
- Actual check-in date (editable)
- Actual check-out date (editable)
- Check-in/check-out notes
- Who performed check-in/check-out and when

#### 2.4 Reports Integration

**Update Reports to Use Actual Dates:**
- Occupancy reports should use `effective_check_in_date` and `effective_check_out_date`
- Historical reports should show both contract dates and actual dates

### Implementation Priority
**MEDIUM-HIGH** - Important for accurate operational tracking

### Estimated Effort
- Database: 1-2 hours
- Booking Calendar UI: 4-6 hours
- Application Detail UI: 2-3 hours
- Reports Updates: 2-3 hours
- **Total: 9-14 hours**

---

## 3. Utility Payments Tracking in Admin Finance

### Use Case
Track utility expenses (electricity, water, gas, internet, etc.) per academic year so finance can:
- Log all expenses
- Generate expense reports
- Calculate net profit (revenue - expenses)
- Track expenses by category and academic year

### Current System Analysis
- ✅ Finance section exists in admin
- ✅ Payment tracking exists (revenue side)
- ✅ Academic year system exists
- ✅ Financial forecast exists
- ❌ **NO expense tracking**
- ❌ **NO utility payments table**

### Recommended Implementation

#### 3.1 Database Schema

**New Table: `utility_payments` (or `expenses`)**

```sql
CREATE TABLE public.utility_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  expense_category TEXT NOT NULL CHECK (expense_category IN (
    'electricity', 'water', 'gas', 'internet', 'maintenance', 
    'cleaning', 'insurance', 'property_tax', 'other'
  )),
  description TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  vendor_name TEXT,
  invoice_number TEXT,
  receipt_path TEXT, -- Storage path for receipt/document
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_utility_payments_academic_year_id ON public.utility_payments(academic_year_id);
CREATE INDEX idx_utility_payments_category ON public.utility_payments(expense_category);
CREATE INDEX idx_utility_payments_payment_date ON public.utility_payments(payment_date DESC);
CREATE INDEX idx_utility_payments_created_at ON public.utility_payments(created_at DESC);

-- RLS Policies
ALTER TABLE public.utility_payments ENABLE ROW LEVEL SECURITY;

-- Staff can manage all utility payments
CREATE POLICY "Staff manage utility payments" ON public.utility_payments
  FOR ALL USING (public.is_staff());

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_utility_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER utility_payments_updated_at
  BEFORE UPDATE ON public.utility_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_utility_payments_updated_at();
```

**Storage Bucket: `expense-receipts`**
- Private bucket for expense receipts/invoices
- Path: `expense-receipts/{academic_year_id}/{category}/{uuid}.{ext}`
- RLS: Staff only

**New View: `expense_summary_by_academic_year`**

```sql
CREATE OR REPLACE VIEW public.expense_summary_by_academic_year AS
SELECT 
  academic_year_id,
  ay.name AS academic_year_name,
  expense_category,
  COUNT(*) AS expense_count,
  SUM(amount) AS total_amount,
  MIN(payment_date) AS first_payment_date,
  MAX(payment_date) AS last_payment_date
FROM public.utility_payments up
INNER JOIN public.academic_years ay ON ay.id = up.academic_year_id
GROUP BY academic_year_id, ay.name, expense_category
ORDER BY academic_year_id, expense_category;
```

#### 3.2 UI Implementation

**New Page: `/admin/finance/expenses`**

**Location:** `src/pages/admin/Expenses.tsx`

**Features:**

1. **Expense List View**
   - Table showing all expenses with:
     - Date
     - Category (badge)
     - Description
     - Amount (formatted currency)
     - Vendor
     - Invoice number
     - Academic year
     - Actions (edit, delete, view receipt)

2. **Filters**
   - Academic year selector
   - Category filter (multi-select)
   - Date range filter
   - Vendor search

3. **Create/Edit Expense Dialog**
   - Academic year selector (required)
   - Category dropdown (required)
   - Description input (required)
   - Amount input (required, currency format)
   - Payment date picker (required)
   - Vendor name (optional)
   - Invoice number (optional)
   - Receipt upload (optional, drag-and-drop)
   - Notes textarea (optional)
   - Save button

4. **Statistics Cards**
   - Total expenses (current academic year)
   - Expenses by category (pie chart or bar chart)
   - Expenses by month (line chart)
   - Average expense per month

5. **Export**
   - Export to CSV
   - Filtered export (respects current filters)

#### 3.3 Financial Forecast Integration

**Update: `src/pages/admin/FinancialForecast.tsx`**

Add expense consideration:
- Show net profit (revenue - expenses)
- Option to include/exclude expenses in forecast
- Expense breakdown by category

#### 3.4 Reports Integration

**New Report: Expense Report**
- Location: `/admin/reports` or `/admin/finance/expense-report`
- Shows expenses by category, academic year, date range
- Exportable to CSV

**Update: Financial Dashboard**
- Add expense summary card
- Show net profit (revenue - expenses)

#### 3.5 Navigation Update

**Update: `src/components/admin/AdminLayout.tsx`**

Add to Finance section:
```typescript
{
  label: "Expenses",
  to: "/admin/finance/expenses",
  icon: Receipt, // or FileText
}
```

### Implementation Priority
**MEDIUM** - Important for complete financial tracking

### Estimated Effort
- Database: 2-3 hours
- Admin UI: 6-8 hours
- Reports Integration: 2-3 hours
- Financial Forecast Integration: 2-3 hours
- **Total: 12-17 hours**

---

## 4. Login Dialog for Unread Bulk/Targeted Messages

### Use Case
When a student logs in, if they have unread bulk or targeted messages, show a dialog once (not every time) prompting them to check their notifications. This ensures important messages are seen without being annoying.

### Current System Analysis
- ✅ Student login system exists (`/portal/login`)
- ✅ Notifications system exists
- ✅ Bulk messages system exists
- ✅ Targeted messages system exists
- ✅ `notifications` table has `is_read` field
- ✅ `bulk_messages` table exists
- ❌ **NO login dialog for unread messages**
- ❌ **NO tracking of "dialog shown" status**

### Recommended Implementation

#### 4.1 Database Schema

**Option A: Add Field to `notifications` Table (Recommended)**

```sql
-- Add field to track if login dialog was shown for this notification
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS login_dialog_shown BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_notifications_login_dialog_shown 
  ON public.notifications(user_id, login_dialog_shown, is_read)
  WHERE login_dialog_shown = FALSE AND is_read = FALSE;
```

**Option B: New Table for Dialog Tracking (Alternative)**

```sql
-- If we want to track dialog shown per user per message type
CREATE TABLE public.user_message_dialogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL CHECK (message_type IN ('bulk', 'targeted')),
  bulk_message_id UUID REFERENCES public.bulk_messages(id) ON DELETE CASCADE,
  shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, bulk_message_id)
);

CREATE INDEX idx_user_message_dialogs_user_id ON public.user_message_dialogs(user_id);
```

**Recommendation: Option A** - Simpler, uses existing notifications table

#### 4.2 UI Implementation

**New Component: `src/components/portal/UnreadMessagesDialog.tsx`**

```typescript
// Component that checks for unread bulk/targeted messages
// Shows dialog once per unread message
// Marks login_dialog_shown = true when dialog is shown
```

**Integration Points:**

1. **Student Dashboard (`src/pages/portal/Dashboard.tsx`)**
   - On mount, check for unread messages where `login_dialog_shown = false`
   - If found, show dialog
   - Dialog content:
     - Title: "You have new messages"
     - Message: "You have {count} unread message(s). Check your notifications to view them."
     - Button: "View Notifications" (navigates to `/portal/notifications`)
     - Button: "Dismiss" (marks `login_dialog_shown = true` for all shown messages)

2. **Auth Context (`src/contexts/AuthContext.tsx`)**
   - After successful login, trigger check for unread messages
   - Or check in Dashboard component (simpler)

#### 4.3 Logic Flow

1. **Student logs in** → Redirected to `/portal` (Dashboard)
2. **Dashboard mounts** → Query for unread messages:
   ```sql
   SELECT * FROM notifications
   WHERE user_id = $1
     AND is_read = FALSE
     AND login_dialog_shown = FALSE
     AND (notification_type = 'bulk' OR notification_type = 'targeted')
   ORDER BY created_at DESC
   LIMIT 10
   ```
3. **If unread messages found** → Show dialog
4. **User clicks "View Notifications"** → Navigate to `/portal/notifications`, mark `login_dialog_shown = TRUE` for all shown messages
5. **User clicks "Dismiss"** → Mark `login_dialog_shown = TRUE` for all shown messages, close dialog
6. **Dialog won't show again** for those messages (because `login_dialog_shown = TRUE`)

#### 4.4 Edge Cases

1. **Multiple unread messages**: Show count in dialog, but only show dialog once
2. **User dismisses but doesn't read**: Dialog won't show again, but notification badge still shows
3. **User reads some but not all**: Dialog won't show again (because `login_dialog_shown = TRUE`), but unread badge updates
4. **New message arrives after login**: Dialog won't show (only on login), but notification badge updates

#### 4.5 Alternative: Show Once Per Session

If you want to show dialog once per login session (not just once per message):

```typescript
// Use sessionStorage to track if dialog shown this session
const dialogShown = sessionStorage.getItem('unreadMessagesDialogShown');
if (!dialogShown && hasUnreadMessages) {
  // Show dialog
  sessionStorage.setItem('unreadMessagesDialogShown', 'true');
}
```

**Recommendation**: Use database field (`login_dialog_shown`) - more reliable, persists across devices/sessions

### Implementation Priority
**LOW-MEDIUM** - Nice-to-have UX improvement

### Estimated Effort
- Database: 1 hour
- Dialog Component: 2-3 hours
- Dashboard Integration: 1-2 hours
- Testing: 1 hour
- **Total: 5-7 hours**

---

## Implementation Order Recommendation

### Phase 1: High Priority (Week 1)
1. **Maintenance/Request Logging** (12-18 hours)
   - Most impactful for student experience
   - Reduces support burden

### Phase 2: Medium Priority (Week 2)
2. **Check-in/Check-out Functionality** (9-14 hours)
   - Important for operational accuracy
   - Enhances booking calendar

3. **Utility Payments Tracking** (12-17 hours)
   - Completes financial tracking
   - Enables expense reporting

### Phase 3: Low Priority (Week 3)
4. **Login Dialog for Unread Messages** (5-7 hours)
   - UX improvement
   - Can be done in parallel with other work

**Total Estimated Time: 38-56 hours (approximately 1-2 weeks of development)**

---

## Questions for Clarification

### Maintenance Requests
1. Should students be able to edit/cancel their own requests?
2. Should there be a limit on number of open requests per student?
3. Should urgent requests trigger immediate email notifications to staff?
4. Do we need a mobile app integration for maintenance requests?

### Check-in/Check-out
1. Should check-in/check-out be mandatory or optional?
2. Can students check themselves in/out, or staff only?
3. Should we track early check-ins or late check-outs separately?
4. Do we need to send notifications when check-in/check-out happens?

### Utility Payments
1. Should there be approval workflow for expenses (e.g., manager approval)?
2. Do we need budget tracking (planned vs actual expenses)?
3. Should expenses be linked to specific studios or just academic year?
4. Do we need recurring expense templates (e.g., monthly internet bill)?

### Login Dialog
1. Should dialog show message preview or just count?
2. Should dialog be dismissible permanently or just for this session?
3. Should we track which messages were shown in dialog?
4. Do we need different dialog styles for bulk vs targeted messages?

---

## Technical Considerations

### Performance
- All new queries should be indexed
- Use pagination for large lists (maintenance requests, expenses)
- Cache expense summaries for dashboard

### Security
- RLS policies for all new tables
- Image upload validation (file type, size limits)
- Receipt storage access control

### UX
- Mobile-responsive dialogs and forms
- Loading states for all async operations
- Error handling and user feedback
- Consistent with existing UI patterns

### Testing
- Unit tests for new hooks
- Integration tests for new workflows
- E2E tests for critical paths (create request, check-in, add expense)

---

## Next Steps

1. **Review and approve recommendations**
2. **Answer clarification questions**
3. **Prioritize features based on business needs**
4. **Create detailed implementation tickets**
5. **Begin Phase 1 implementation**

