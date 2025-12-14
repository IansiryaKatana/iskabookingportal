# Product Requirements Document (PRD)
## Three Operations Modules: Maintenance, Housekeeping & OTA Bookings

**Date:** January 2025  
**Status:** Requirements & Recommendations  
**Version:** 1.0

---

## Executive Summary

This PRD defines the requirements for three integrated operations modules within the STUCOMMS Booking Portal: **Maintenance & Asset Maintenance**, **Housekeeping**, and **OTA Bookings**. These modules will enable end-to-end management of studio maintenance, cleanliness tracking, and external booking allocation with approval workflows and cross-module integrations.

---

## Table of Contents

1. [Current System Analysis](#current-system-analysis)
2. [Roles & Permissions](#roles--permissions)
3. [Global UI Patterns](#global-ui-patterns)
4. [Module 1: Maintenance & Asset Maintenance](#module-1-maintenance--asset-maintenance)
5. [Module 2: Housekeeping](#module-2-housekeeping)
6. [Module 3: OTA Bookings](#module-3-ota-bookings)
7. [Cross-Module Integrations](#cross-module-integrations)
8. [Database Schema Requirements](#database-schema-requirements)
9. [Implementation Recommendations](#implementation-recommendations)
10. [Potential Breaking Changes & Risks](#potential-breaking-changes--risks)
11. [Migration Strategy](#migration-strategy)

---

## Current System Analysis

### Existing Infrastructure ✅

1. **Roles System**
   - Main roles: `student`, `staff`, `superadmin`, `partner`, `admin`
   - Staff sub-roles (UI only, stored in `profiles.staff_subrole`): `operations_manager`, `reservationist`, `accountant`, `front_desk`
   - RLS uses `role = 'staff'` for all staff members
   - Route permissions system exists in `route_permissions` table

2. **Maintenance System (Basic)**
   - Table: `maintenance_requests`
   - Current status: `pending`, `in_progress`, `resolved`, `cancelled`
   - Current priority: `low`, `normal`, `high`, `urgent`
   - Links to `student_id`, `application_id`, `studio_id`
   - Storage bucket: `maintenance-images`

3. **Booking System**
   - View: `booking_calendar_data`
   - Function: `get_booking_calendar_data()`
   - Check-in/check-out tracking in `student_applications` table
   - Studios have `allocation`: `NULL`, `'Student'`, `'OTA'`, `'Keyworkers'`
   - Studios have `status`: `available`, `reserved`, `occupied`, `maintenance`

4. **Notification System**
   - Table: `notifications`
   - Login dialog tracking: `login_dialog_shown`
   - Notification bell component exists
   - Targeted/bulk messaging system exists

5. **Studio System**
   - Studios linked to `studio_grades`
   - Status tracking per academic year via `studio_status_by_academic_year` view
   - Auto-allocation triggers exist

### Gaps Identified ❌

1. **No dedicated maintenance workflow**
   - No triage, assignment, or approval workflow
   - No maintenance officer role support
   - No "Out of Order" tracking

2. **No housekeeping system**
   - No clean status tracking per studio
   - No cleaner roster management
   - No cleaning schedule/calendar

3. **No OTA booking management**
   - OTA allocation exists but no booking records
   - No guest details tracking
   - No OTA-specific status workflow

4. **No approval workflows**
   - No "pending approval" status system
   - No LoggedMessage dialog for Ops approvals
   - No approval history tracking

---

## Roles & Permissions

### Current Roles

| Role | Description | Current Usage |
|------|-------------|---------------|
| `student` | Student user | Can log maintenance requests, view updates |
| `staff` | General staff | Full system access (RLS base) |
| `superadmin` | System administrator | Full access + role management |
| `admin` | Admin user | Same as staff (UI distinction) |
| `operations_manager` | Operations Manager (sub-role) | UI organization only, RLS = staff |
| `reservationist` | Reservationist (sub-role) | UI organization only, RLS = staff |
| `accountant` | Accountant (sub-role) | UI organization only, RLS = staff |
| `front_desk` | Front Desk (sub-role) | UI organization only, RLS = staff |

### Proposed New Roles

**IMPORTANT:** Based on existing architecture, these should be **staff sub-roles** (not new main roles) to maintain RLS compatibility.

| New Sub-Role | Description | RLS Base | UI Permissions |
|--------------|-------------|----------|----------------|
| `maintenance_officer` | Maintenance Officer | `staff` | Sees assigned jobs, updates progress, requests approval |
| `housekeeper` / `cleaner` | Housekeeper/Cleaner | `staff` | Sees assigned studios, requests clean approval |

### Role Capabilities Matrix

| Capability | Student | Ops Manager | Maintenance Officer | Housekeeper | Reservationist |
|------------|---------|-------------|---------------------|-------------|----------------|
| Log maintenance | ✅ | ✅ | ✅ | ❌ | ❌ |
| Triage/assign maintenance | ❌ | ✅ | ❌ | ❌ | ❌ |
| Update maintenance progress | ❌ | ✅ | ✅ (assigned only) | ❌ | ❌ |
| Mark maintenance complete | ❌ | ✅ | ✅ (assigned only) | ❌ | ❌ |
| Approve maintenance completion | ❌ | ✅ | ❌ | ❌ | ❌ |
| View maintenance timeline | ✅ (own) | ✅ (all) | ✅ (assigned) | ❌ | ❌ |
| View housekeeping status | ❌ | ✅ | ❌ | ✅ (assigned) | ❌ |
| Update clean status | ❌ | ✅ | ✅ (assigned only) | ✅ (assigned only) | ❌ |
| Request clean approval | ❌ | ❌ | ❌ | ✅ (assigned only) | ❌ |
| Approve clean status | ❌ | ✅ | ❌ | ❌ | ❌ |
| Manage housekeeping roster | ❌ | ✅ | ❌ | ❌ | ❌ |
| View OTA bookings | ❌ | ✅ | ❌ | ❌ | ✅ |
| Create/edit OTA bookings | ❌ | ✅ | ❌ | ❌ | ✅ |
| Update OTA status | ❌ | ✅ | ❌ | ❌ | ✅ |
| View approval inbox | ❌ | ✅ | ❌ | ❌ | ❌ |

---

## Global UI Patterns

### Shared Layout Structure

Every module main page follows this pattern:

```
┌─────────────────────────────────────────────┐
│  Page Title (Big Shoulders Display)         │
│  [Back Button - far right if applicable]    │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│  Horizontally Scrollable Filter Cards       │
│  [Status/Category filters]                  │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│  Stats Cards Row (clickable to filter)      │
│  [Count cards with icons]                   │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│  List View                                  │
│  - Desktop: Table                           │
│  - Mobile: Cards                            │
│  - Search + Filters + Sort                  │
│  - Bulk select + actions                    │
└─────────────────────────────────────────────┘
```

### Typography Standards

- **Titles/Headers/Stat Numbers**: Big Shoulders Display
  - Page title: `clamp(24px, 2.4vw, 40px)`
  - Section title: `clamp(18px, 1.6vw, 26px)`
  - Card title: `16-18px`

- **Body Text/Labels/Table**: Inter Tight
  - Table/Body: `14-15px`
  - Helper/Meta: `12-13px`

### Details Drawer/Sheet

- **Desktop**: Right-side drawer (slide-in from right)
- **Mobile**: Full-screen sheet (slide-in from bottom, margin-bottom: 0)
- **Skeleton**: Title + Timeline + Fields
- **Content**: Timeline/activity log + form fields + action buttons

### Skeleton Loaders

- **Main pages**: Header + cards row + stats row + list/table
- **Details drawer**: Title + timeline + fields
- **Charts**: Block placeholder

### Empty States

- Clear CTA button ("Create request", "Assign cleaner", "Add OTA booking")
- Helpful message explaining what the empty state means

---

## Module 1: Maintenance & Asset Maintenance

### Purpose

Students log maintenance requests. Operations Managers triage and assign to Maintenance Officers. Maintenance Officers execute work. Completion requires Operations Manager approval before student sees "resolved".

### Status Model

| Status | Description | Who Can Set | Triggers |
|--------|-------------|-------------|----------|
| `new` | Student submitted | Student | On creation |
| `triaged` | Ops categorized + urgency set | Ops Manager | After triage |
| `assigned` | Assigned to maintenance officer | Ops Manager | On assignment |
| `in_progress` | Maintenance started | Maintenance Officer | When work begins |
| `completed_pending_approval` | Maintenance marked done | Maintenance Officer | On "Mark Complete" |
| `resolved` | Ops approved completion | Ops Manager | On approval |
| `rework_required` | Ops rejects completion | Ops Manager | On rejection |
| `cancelled` | Request cancelled | Ops Manager | On cancellation |

### Urgency Levels

- `low` → `medium` → `high` → `emergency`

**Queue Sorting**: Emergency → High → Medium → Low, then oldest first

### Route Structure

```
/maintenance
├── /maintenance (Dashboard)          [Main page]
├── /maintenance/job-management       [Work orders view]
├── /maintenance/job-map              [Map/floor view]
└── /maintenance/out-of-order         [Out of Order subpage]
```

### Page 1: Maintenance Dashboard

**Route:** `/maintenance`

**Features:**
- **Top Filters** (horizontally scrollable cards):
  - Category: Plumbing, Electrical, Internet/WiFi, Furniture, Appliance, HVAC, Bathroom, Kitchen, Other
  - Special card: Out of Order (links to subpage)
  
- **Stats Cards** (click to filter list):
  - New
  - Unassigned
  - Assigned
  - In Progress
  - Pending Approval
  - Overdue (based on SLA)
  - Out of Order

- **List/Table** (desktop columns):
  - Request ID
  - Studio
  - Category
  - Urgency (badge)
  - Status (badge)
  - Assigned To
  - Submitted Date
  - Last Update
  - SLA/Overdue badge

- **Row Click**: Opens details drawer

- **Details Drawer Content**:
  - Student info + studio
  - Problem description + photos
  - Timeline / activity log
  - Assignment + internal notes
  - Status change controls (role-based)
  - "Mark complete" button (Maintenance Officer) → sets `completed_pending_approval`
  - "Approve / Reject" buttons (Ops Manager only)

### Page 2: Job Management

**Route:** `/maintenance/job-management`

**Features:**
- Allocation management (assign/reassign)
- Batch assignment (bulk select → assign officer)
- SLA and scheduling view
- Work order queue by urgency

### Page 3: Job Map

**Route:** `/maintenance/job-map`

**Features:**
- Map view / floor grouping
- Filter by building/floor/studio cluster
- Pins/tiles show open tasks + urgency
- Clicking pin opens details drawer

### Page 4: Out of Order

**Route:** `/maintenance/out-of-order`

**Features:**
- List of Out of Order records
- Create new Out of Order record:
  - Studio selection
  - Reason
  - Start date/time
  - Expected return date/time
  - Blocking flag (prevents OTA allocation)
  - Linked maintenance request(s)

---

## Module 2: Housekeeping

### Purpose

Track studio cleanliness, roster assignment, and cleaning cadence—connected to OTA checkouts and out-of-order states.

### Clean Status Model

| Status | Description | Trigger |
|--------|-------------|---------|
| `dirty` | Studio needs cleaning | OTA checkout OR Ops manual mark |
| `clean_pending_approval` | Cleaner marked clean | Cleaner sets status |
| `clean` | Ops approved clean | Ops approves |
| `occupied` | Currently occupied | Active OTA booking (Checked In/In House Guest/Day Use) |
| `out_of_order` | Maintenance issue | Active Out of Order record exists |

### Status Determination Logic

1. **Dirty**:
   - Immediately when OTA booking checks out
   - When Ops manually marks dirty (inspection)

2. **Occupied**:
   - When active OTA booking status is: `Checked In`, `In House Guest`, `Day Use`

3. **Out of Order**:
   - When `out_of_order_records.is_active = true` for the studio

4. **Clean**:
   - Cleaner sets to `clean_pending_approval`
   - Ops approves → becomes `clean`

### Route Structure

```
/housekeeping
├── /housekeeping (Dashboard)        [Main page]
└── /housekeeping/roster             [Roster management]
```

### Page 1: Housekeeping Dashboard

**Route:** `/housekeeping`

**Features:**
- **Clean Status Cards** (horizontally scrollable):
  - Clean
  - Dirty
  - Occupied
  - Out of Order
  - Pending Approval

- **Stats Cards**:
  - Dirty count
  - Pending approvals
  - Today's assigned cleans
  - Overdue cleans (based on default cleaning date)
  - Studios without roster assignment

- **List/Table** (with bulk edit CRUD):
  - Studio
  - Current status (badge)
  - Assigned cleaner
  - Default cleaning day/date
  - Last cleaned
  - Next scheduled clean
  - Notes/flags

- **Bulk Actions**:
  - Assign cleaner
  - Set next clean date
  - Mark as dirty (Ops)
  - Request clean approval (Cleaner)
  - Approve clean (Ops)

- **Details Drawer**:
  - Cleaning history timeline
  - Photos (optional)
  - Notes
  - Status controls (role-based)

### Page 2: Housekeeping Roster

**Route:** `/housekeeping/roster`

**Features:**
- View by Cleaner → list of studios
- View by Studio → assigned cleaner
- Default cleaning date per studio (editable)
- Rules display:
  - Studios with student allocation still follow default cleaning cadence (if allowed)
  - OTA studios follow event triggers (checkout → dirty) + scheduled cleans

---

## Module 3: OTA Bookings

### Purpose

Manage OTA bookings tied to studios with `allocation = 'OTA'`, with a booking chart page inspired by existing booking calendar.

### OTA Booking Status Model

| Status | Description | Next States |
|--------|-------------|-------------|
| `arriving` | Check-in coming up | Pre Check In |
| `expected_arrivals` | Expected today | Pre Check In |
| `pre_check_in` | Before check-in | Checked In |
| `checked_in` | Guest checked in | In House Guest |
| `in_house_guest` | Currently in house | Day Use OR Checked Out |
| `day_use` | Day use booking | Checked Out |
| `checked_out` | Guest checked out | N/A (final) |
| `expected_departures` | Expected to depart today | Checked Out |
| `departing` | Currently departing | Checked Out |
| `no_show` | Guest didn't arrive | N/A (final) |
| `cancelled` | Booking cancelled | N/A (final) |

### Route Structure

```
/ota-bookings
├── /ota-bookings (Dashboard)        [Main page]
├── /ota-bookings/booking-chart      [Calendar/chart view]
└── /ota-bookings/studio-allocation  [Allocation management]
```

**Navigation Rule:** "OTA Bookings" route expands to other routes in its module, but it also has its own dashboard page.

### Page 1: OTA Bookings Dashboard

**Route:** `/ota-bookings`

**Features:**
- **Status Stat Cards** (click-to-filter + bulk edit CRUD):
  - Arriving
  - Expected Arrivals
  - Pre Check In
  - Checked In
  - In House Guest
  - Day Use
  - Checked Out
  - Expected Departures
  - Departing
  - No Show
  - Cancelled

- **List/Table**:
  - Booking ref
  - Guest name
  - Studio
  - Check-in date
  - Check-out date
  - Status (badge)
  - Source channel (Airbnb/Booking/Agoda/etc.)
  - Notes/flags

- **Bulk Actions**:
  - Update status
  - Assign studio (if unallocated)
  - Mark no-show / cancel
  - Trigger housekeeping dirty (if checkout)
  - Message ops/frontdesk (internal note)

- **Details Drawer**:
  - Guest details
  - Booking dates
  - Payment/notes placeholders
  - Studio allocation + conflicts warnings
  - Status timeline
  - Actions

### Page 2: Booking Chart

**Route:** `/ota-bookings/booking-chart`

**Features:**
- Calendar/chart inspired by existing `booking_calendar`:
  - Studio rows vs date columns
  - Color blocks by booking
- **Filters**:
  - Status
  - Channel
  - Studio group
  - Date range
- Clicking block opens booking drawer
- Studio unavailable overlay when Out of Order is active

### Page 3: Studio Allocation (OTA)

**Route:** `/ota-bookings/studio-allocation`

**Features:**
- Shows available OTA studios (`allocation = 'OTA'`)
- Flags conflicts:
  - Already occupied
  - Out of Order
  - Dirty + not approved clean (optional rule)
- Allocation interface

---

## Cross-Module Integrations

### A) Maintenance → Housekeeping

**Trigger:** When maintenance logs Out of Order

**Action:**
- Housekeeping studio status becomes `out_of_order`
- Cleaner cannot mark "Clean" until Out of Order closed (or allow but flagged)

**Implementation:**
```sql
-- When out_of_order_records.is_active = true for studio_id
-- Set housekeeping_status.status = 'out_of_order'
```

### B) OTA → Housekeeping

**Triggers:**
1. OTA status changes to `Checked In` / `In House Guest` / `Day Use`
   - → Housekeeping = `occupied`

2. OTA status changes to `Checked Out`
   - → Housekeeping = `dirty` immediately

3. Expected Departures (optional)
   - → Triggers "prepare cleaning" queue

**Implementation:**
```sql
-- When ota_booking.status IN ('checked_in', 'in_house_guest', 'day_use')
-- Set housekeeping_status.status = 'occupied'

-- When ota_booking.status = 'checked_out'
-- Set housekeeping_status.status = 'dirty'
```

### C) Housekeeping Approvals → OTA Readiness

**Trigger:** When studio becomes `clean` (approved)

**Action:**
- Studio becomes "Ready" for allocation (soft rule)
- Booking chart shows "clean ready" badge

### D) Ops Approval Inbox (LoggedMessage Dialog)

**Trigger:** On Ops Manager next login

**Content:**
- Grouped approvals:
  - Maintenance completion approvals (from `completed_pending_approval`)
  - Clean status approvals (from `clean_pending_approval`)
- Each item opens relevant record drawer with Approve/Reject

**Implementation:**
- Use existing `notifications` table
- `login_dialog_shown` flag for one-time display
- Notification type: `approval_required`

---

## Database Schema Requirements

### New Tables

#### 1. `housekeeping_status`

```sql
CREATE TABLE public.housekeeping_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('dirty', 'clean_pending_approval', 'clean', 'occupied', 'out_of_order')) DEFAULT 'clean',
  assigned_cleaner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_cleaned_at TIMESTAMPTZ,
  next_clean_due_at DATE, -- Default cleaning date (editable)
  approval_status TEXT CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(studio_id)
);
```

#### 2. `out_of_order_records`

```sql
CREATE TABLE public.out_of_order_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  maintenance_request_id UUID REFERENCES public.maintenance_requests(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_end_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ, -- Actual end
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_blocking BOOLEAN NOT NULL DEFAULT true, -- Prevents OTA allocation
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 3. `ota_bookings`

```sql
CREATE TABLE public.ota_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref TEXT NOT NULL, -- Booking reference from channel
  channel TEXT NOT NULL CHECK (channel IN ('airbnb', 'booking', 'agoda', 'expedia', 'other')),
  guest_name TEXT NOT NULL,
  guest_phone TEXT,
  guest_email TEXT,
  studio_id UUID REFERENCES public.studios(id) ON DELETE SET NULL, -- Nullable until allocated
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'arriving', 'expected_arrivals', 'pre_check_in', 'checked_in',
    'in_house_guest', 'day_use', 'checked_out', 'expected_departures',
    'departing', 'no_show', 'cancelled'
  )) DEFAULT 'arriving',
  notes TEXT,
  internal_notes TEXT, -- Staff-only notes
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(external_ref, channel)
);
```

#### 4. `activity_log` (Shared)

```sql
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- 'maintenance_request', 'housekeeping_status', 'ota_booking', 'out_of_order'
  entity_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'status_change', 'assignment', 'approval', 'rejection', etc.
  from_status TEXT,
  to_status TEXT,
  message TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Modified Tables

#### 1. `maintenance_requests`

**Add columns:**
```sql
ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('plumbing', 'electrical', 'internet_wifi', 'furniture', 'appliance', 'hvac', 'bathroom', 'kitchen', 'other')),
  ADD COLUMN IF NOT EXISTS urgency TEXT CHECK (urgency IN ('low', 'medium', 'high', 'emergency')) DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'assigned', 'in_progress', 'completed_pending_approval', 'resolved', 'rework_required', 'cancelled')),
  ADD COLUMN IF NOT EXISTS completion_note TEXT,
  ADD COLUMN IF NOT EXISTS approval_status TEXT CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ; -- For overdue calculation
```

**Note:** `status` column already exists but values need to be updated. Migration should:
1. Map existing statuses to new ones
2. Add new columns
3. Update constraints

#### 2. `profiles` (No changes needed)

Sub-roles already supported via `staff_subrole` column.

### Indexes

```sql
-- Housekeeping
CREATE INDEX idx_housekeeping_status_studio_id ON public.housekeeping_status(studio_id);
CREATE INDEX idx_housekeeping_status_status ON public.housekeeping_status(status);
CREATE INDEX idx_housekeeping_status_cleaner_id ON public.housekeeping_status(assigned_cleaner_id);
CREATE INDEX idx_housekeeping_status_approval ON public.housekeeping_status(approval_status) WHERE approval_status = 'pending';

-- Out of Order
CREATE INDEX idx_out_of_order_studio_id ON public.out_of_order_records(studio_id);
CREATE INDEX idx_out_of_order_active ON public.out_of_order_records(is_active) WHERE is_active = true;
CREATE INDEX idx_out_of_order_dates ON public.out_of_order_records(start_at, expected_end_at);

-- OTA Bookings
CREATE INDEX idx_ota_bookings_studio_id ON public.ota_bookings(studio_id);
CREATE INDEX idx_ota_bookings_status ON public.ota_bookings(status);
CREATE INDEX idx_ota_bookings_dates ON public.ota_bookings(check_in, check_out);
CREATE INDEX idx_ota_bookings_external_ref ON public.ota_bookings(external_ref, channel);

-- Activity Log
CREATE INDEX idx_activity_log_entity ON public.activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_log_created_at ON public.activity_log(created_at DESC);
```

### RLS Policies

All new tables need RLS policies following existing patterns:

- **Students**: Can view own maintenance requests only
- **Staff**: Full access to all tables
- **Service role**: Full access

Example for `housekeeping_status`:
```sql
ALTER TABLE public.housekeeping_status ENABLE ROW LEVEL SECURITY;

-- Students: Read-only access to their studio (if they have an active application)
CREATE POLICY "Students view own studio housekeeping" ON public.housekeeping_status
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.assigned_studio_id = housekeeping_status.studio_id
        AND sa.student_id = auth.uid()
        AND sa.status = 'confirmed'
    )
  );

-- Staff: Full access
CREATE POLICY "Staff manage housekeeping" ON public.housekeeping_status
  FOR ALL USING (public.is_staff());
```

---

## Implementation Recommendations

### 1. Role Implementation Strategy

**✅ RECOMMENDATION: Use Staff Sub-Roles**

- Add `maintenance_officer` and `housekeeper` to `staff_subrole` enum/check constraint
- Update `ProtectedRoute` to recognize these sub-roles
- Add route permissions for these sub-roles
- RLS remains based on `role = 'staff'` (no changes needed)

**Benefits:**
- No RLS policy changes required
- Consistent with existing architecture
- Easy to add permissions per sub-role

**Code Changes:**
```typescript
// src/contexts/AuthContext.tsx
export type StaffSubrole = 
  | "operations_manager" 
  | "reservationist" 
  | "accountant" 
  | "front_desk"
  | "maintenance_officer"  // NEW
  | "housekeeper";         // NEW
```

### 2. Route Permissions Migration

**All new routes must be added to `route_permissions` table:**

```sql
-- Maintenance routes
INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  ('/maintenance', 'Maintenance Dashboard', 'staff', true),
  ('/maintenance', 'Maintenance Dashboard', 'operations_manager', true),
  ('/maintenance', 'Maintenance Dashboard', 'maintenance_officer', true),
  ('/maintenance/job-management', 'Job Management', 'staff', true),
  ('/maintenance/job-management', 'Job Management', 'operations_manager', true),
  ('/maintenance/job-map', 'Job Map', 'staff', true),
  ('/maintenance/job-map', 'Job Map', 'operations_manager', true),
  ('/maintenance/out-of-order', 'Out of Order', 'staff', true),
  ('/maintenance/out-of-order', 'Out of Order', 'operations_manager', true),
  
  -- Housekeeping routes
  ('/housekeeping', 'Housekeeping Dashboard', 'staff', true),
  ('/housekeeping', 'Housekeeping Dashboard', 'operations_manager', true),
  ('/housekeeping', 'Housekeeping Dashboard', 'housekeeper', true),
  ('/housekeeping/roster', 'Housekeeping Roster', 'staff', true),
  ('/housekeeping/roster', 'Housekeeping Roster', 'operations_manager', true),
  
  -- OTA Bookings routes
  ('/ota-bookings', 'OTA Bookings Dashboard', 'staff', true),
  ('/ota-bookings', 'OTA Bookings Dashboard', 'operations_manager', true),
  ('/ota-bookings', 'OTA Bookings Dashboard', 'reservationist', true),
  ('/ota-bookings/booking-chart', 'Booking Chart', 'staff', true),
  ('/ota-bookings/booking-chart', 'Booking Chart', 'operations_manager', true),
  ('/ota-bookings/booking-chart', 'Booking Chart', 'reservationist', true),
  ('/ota-bookings/studio-allocation', 'Studio Allocation', 'staff', true),
  ('/ota-bookings/studio-allocation', 'Studio Allocation', 'operations_manager', true),
  ('/ota-bookings/studio-allocation', 'Studio Allocation', 'reservationist', true)
ON CONFLICT (route_path, role) DO UPDATE SET allowed = EXCLUDED.allowed;
```

### 3. Approval Workflow Implementation

**Approval notifications using existing `notifications` table:**

```sql
-- Trigger function to create approval notification
CREATE OR REPLACE FUNCTION public.create_approval_notification()
RETURNS TRIGGER AS $$
DECLARE
  ops_manager_ids UUID[];
BEGIN
  -- When status changes to pending approval, notify all Ops Managers
  IF NEW.status = 'completed_pending_approval' OR NEW.status = 'clean_pending_approval' THEN
    SELECT ARRAY_AGG(id) INTO ops_manager_ids
    FROM public.profiles
    WHERE role = 'staff' 
      AND (staff_subrole = 'operations_manager' OR staff_subrole IS NULL);
    
    -- Create notifications for each Ops Manager
    INSERT INTO public.notifications (user_id, type, title, message, link, notification_type)
    SELECT 
      id,
      'approval_required',
      'Approval Required',
      CASE 
        WHEN TG_TABLE_NAME = 'maintenance_requests' THEN 'Maintenance request #' || NEW.id || ' requires approval'
        WHEN TG_TABLE_NAME = 'housekeeping_status' THEN 'Studio cleaning requires approval'
      END,
      CASE 
        WHEN TG_TABLE_NAME = 'maintenance_requests' THEN '/maintenance?id=' || NEW.id
        WHEN TG_TABLE_NAME = 'housekeeping_status' THEN '/housekeeping?studio=' || NEW.studio_id
      END,
      'warning'
    FROM UNNEST(ops_manager_ids) id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 4. Cross-Module Trigger Functions

**Maintenance → Housekeeping (Out of Order):**
```sql
CREATE OR REPLACE FUNCTION public.sync_out_of_order_to_housekeeping()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    -- Set housekeeping status to out_of_order
    INSERT INTO public.housekeeping_status (studio_id, status)
    VALUES (NEW.studio_id, 'out_of_order')
    ON CONFLICT (studio_id) 
    DO UPDATE SET status = 'out_of_order', updated_at = NOW();
  ELSE
    -- Restore previous status (or default to clean)
    UPDATE public.housekeeping_status
    SET status = 'clean', updated_at = NOW()
    WHERE studio_id = NEW.studio_id AND status = 'out_of_order';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sync_out_of_order_housekeeping
AFTER INSERT OR UPDATE ON public.out_of_order_records
FOR EACH ROW
EXECUTE FUNCTION public.sync_out_of_order_to_housekeeping();
```

**OTA → Housekeeping:**
```sql
CREATE OR REPLACE FUNCTION public.sync_ota_status_to_housekeeping()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('checked_in', 'in_house_guest', 'day_use') THEN
    INSERT INTO public.housekeeping_status (studio_id, status)
    VALUES (NEW.studio_id, 'occupied')
    ON CONFLICT (studio_id)
    DO UPDATE SET status = 'occupied', updated_at = NOW();
  ELSIF NEW.status = 'checked_out' THEN
    INSERT INTO public.housekeeping_status (studio_id, status)
    VALUES (NEW.studio_id, 'dirty')
    ON CONFLICT (studio_id)
    DO UPDATE SET status = 'dirty', updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sync_ota_housekeeping
AFTER INSERT OR UPDATE ON public.ota_bookings
FOR EACH ROW
WHEN (NEW.studio_id IS NOT NULL)
EXECUTE FUNCTION public.sync_ota_status_to_housekeeping();
```

### 5. Migration of Existing Maintenance Requests

**Status Mapping:**
```sql
-- Map existing statuses to new statuses
UPDATE public.maintenance_requests
SET status = CASE
  WHEN status = 'pending' THEN 'new'
  WHEN status = 'in_progress' THEN 'in_progress' -- Keep as is
  WHEN status = 'resolved' THEN 'resolved' -- Keep as is
  WHEN status = 'cancelled' THEN 'cancelled' -- Keep as is
  ELSE 'new'
END
WHERE status IN ('pending', 'in_progress', 'resolved', 'cancelled');
```

**Priority Mapping:**
```sql
-- Map existing priority to urgency
UPDATE public.maintenance_requests
SET urgency = CASE
  WHEN priority = 'low' THEN 'low'
  WHEN priority = 'normal' THEN 'medium'
  WHEN priority = 'high' THEN 'high'
  WHEN priority = 'urgent' THEN 'emergency'
  ELSE 'medium'
END;
```

### 6. Initial Housekeeping Status Setup

**Create housekeeping_status records for all active studios:**
```sql
INSERT INTO public.housekeeping_status (studio_id, status)
SELECT id, 'clean'
FROM public.studios
WHERE is_active = true
  AND id NOT IN (SELECT studio_id FROM public.housekeeping_status WHERE studio_id IS NOT NULL);
```

---

## Potential Breaking Changes & Risks

### ⚠️ HIGH RISK

1. **Maintenance Requests Status Migration**
   - **Risk**: Existing status values will change
   - **Impact**: Any hardcoded status checks in code will break
   - **Mitigation**: 
     - Map old statuses to new ones in migration
     - Update all code references to use new status values
     - Test all maintenance request workflows

2. **Studio Status vs Housekeeping Status Confusion**
   - **Risk**: Two status systems (`studios.status` vs `housekeeping_status.status`)
   - **Impact**: Developers/users may confuse which status to use
   - **Mitigation**:
     - Clear documentation
     - Consistent naming (`studio_status` vs `clean_status`)
     - Helper functions to query both

3. **OTA Booking Conflicts with Student Allocations**
   - **Risk**: Studio allocated to OTA but also has active student application
   - **Impact**: Double-booking scenario
   - **Mitigation**:
     - Validation on `ota_bookings` insert/update: check `studios.allocation = 'OTA'`
     - Check for active student applications before allowing OTA allocation
     - Warning in UI when conflicts detected

### ⚠️ MEDIUM RISK

4. **RLS Policy Performance**
   - **Risk**: Multiple RLS policies on new tables may slow queries
   - **Impact**: Slower page loads
   - **Mitigation**:
     - Proper indexes on foreign keys
     - Test query performance with realistic data volumes
     - Consider materialized views for complex aggregations

5. **Approval Notification Spam**
   - **Risk**: Too many approval notifications on every status change
   - **Impact**: Ops Managers may ignore notifications
   - **Mitigation**:
     - Use `login_dialog_shown` flag to show once per login
     - Group notifications by type
     - Allow bulk approval actions

6. **Out of Order Blocking Logic**
   - **Risk**: Out of Order record blocks OTA allocation, but existing bookings may conflict
   - **Impact**: Operational confusion
   - **Mitigation**:
     - Clear UI indicators
     - Validation: prevent creating Out of Order if active OTA booking exists (or vice versa)
     - Warning messages

### ⚠️ LOW RISK

7. **Booking Chart Performance**
   - **Risk**: Large number of bookings may slow calendar rendering
   - **Impact**: Poor UX
   - **Mitigation**:
     - Pagination/virtualization for date ranges
     - Lazy loading of booking details
     - Optimize queries with proper indexes

8. **Default Cleaning Date Conflicts**
   - **Risk**: Scheduled clean conflicts with OTA checkout
   - **Impact**: Unnecessary cleaning work
   - **Mitigation**:
     - Priority: OTA checkout → dirty takes precedence
     - Clear scheduling rules
     - Visual indicators in roster

---

## Migration Strategy

### Phase 1: Database Schema (Week 1)

1. ✅ Create new tables (`housekeeping_status`, `out_of_order_records`, `ota_bookings`, `activity_log`)
2. ✅ Add indexes and RLS policies
3. ✅ Create trigger functions for cross-module sync
4. ✅ Migrate existing `maintenance_requests` data
5. ✅ Initialize `housekeeping_status` for all studios
6. ✅ Add new staff sub-roles to system

### Phase 2: Route Permissions (Week 1)

1. ✅ Add all new routes to `route_permissions` table
2. ✅ Update `ProtectedRoute` component to recognize new sub-roles
3. ✅ Update navigation components

### Phase 3: Module 1 - Maintenance (Weeks 2-3)

1. ✅ Build Maintenance Dashboard page
2. ✅ Build Job Management page
3. ✅ Build Job Map page (basic, can enhance later)
4. ✅ Build Out of Order subpage
5. ✅ Implement approval workflow
6. ✅ Add activity log tracking

### Phase 4: Module 2 - Housekeeping (Week 4)

1. ✅ Build Housekeeping Dashboard page
2. ✅ Build Housekeeping Roster page
3. ✅ Implement clean status workflow
4. ✅ Implement approval workflow
5. ✅ Integrate with OTA checkout triggers

### Phase 5: Module 3 - OTA Bookings (Week 5)

1. ✅ Build OTA Bookings Dashboard page
2. ✅ Build Booking Chart page (enhance existing booking calendar)
3. ✅ Build Studio Allocation page
4. ✅ Implement status workflow
5. ✅ Integrate with housekeeping triggers

### Phase 6: Integration & Testing (Week 6)

1. ✅ Test cross-module triggers
2. ✅ Test approval workflows
3. ✅ Test RLS policies
4. ✅ Performance testing
5. ✅ User acceptance testing

### Phase 7: Approval Inbox (Week 6)

1. ✅ Build LoggedMessage dialog component
2. ✅ Implement notification grouping
3. ✅ Add bulk approval actions
4. ✅ Test notification delivery

---

## Questions & Clarifications Needed

### 1. Role Architecture

**Q:** You mentioned "2 new roles" - do you want:
- A) Two new staff sub-roles (`maintenance_officer` + `housekeeper`)
- B) Two new main roles (separate from staff)

**Recommendation:** Option A (staff sub-roles) to maintain RLS compatibility.

### 2. Out of Order Blocking

**Q:** When a studio is Out of Order with `is_blocking = true`:
- Should existing OTA bookings be cancelled?
- Should new student applications be blocked?
- Should the studio be excluded from availability calculations?

**Recommendation:** 
- Existing bookings: Warn but don't auto-cancel (manual decision)
- New applications: Block allocation
- Availability: Exclude from calculations

### 3. SLA Calculation

**Q:** How should SLA/overdue be calculated?
- Based on urgency level (Emergency = 4 hours, High = 24 hours, etc.)?
- Based on category (Plumbing = different SLA than Furniture)?
- Configurable per request?

**Recommendation:** Start with urgency-based SLA, make configurable later.

### 4. Booking Chart Integration

**Q:** Should the OTA Booking Chart:
- Replace the existing `BookingCalendar` component?
- Be a separate view for OTA only?
- Show both student and OTA bookings in different colors?

**Recommendation:** Separate view for OTA, enhance existing calendar to show both with filters.

### 5. Clean Status for Student Studios

**Q:** Should studios allocated to students (`allocation = 'Student'`) have housekeeping status?
- Option A: Yes, track cleaning even for student studios
- Option B: No, only track OTA studios

**Recommendation:** Option A - track all studios for consistency, but student studios follow default cleaning cadence.

---

## Appendix: Route Permissions Complete List

### Maintenance Routes
- `/maintenance` - Maintenance Dashboard
- `/maintenance/job-management` - Job Management
- `/maintenance/job-map` - Job Map
- `/maintenance/out-of-order` - Out of Order

### Housekeeping Routes
- `/housekeeping` - Housekeeping Dashboard
- `/housekeeping/roster` - Housekeeping Roster

### OTA Bookings Routes
- `/ota-bookings` - OTA Bookings Dashboard
- `/ota-bookings/booking-chart` - Booking Chart
- `/ota-bookings/studio-allocation` - Studio Allocation (OTA)

---

## Conclusion

This PRD defines a comprehensive system for managing maintenance, housekeeping, and OTA bookings with proper role-based access, approval workflows, and cross-module integrations. The implementation leverages existing infrastructure (RLS, route permissions, notifications) while adding new capabilities in a structured, maintainable way.

**Next Steps:**
1. Review and approve this PRD
2. Clarify open questions
3. Begin Phase 1 implementation

---

**Document Version:** 1.0  
**Last Updated:** January 2025  
**Author:** AI Assistant  
**Status:** Awaiting Review

