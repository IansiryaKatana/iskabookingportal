# Urban Hub Booking Portal – Dynamic Contract & Journey Specification

## 1. Vision

Deliver a data-driven accommodation booking experience where every studio-grade page, contract, payment schedule, and student journey step is populated from Supabase. Students sign agreements and manage payments online; staff administer content, pricing, and applications through an internal portal.

## 2. Core Personas

- **Student**: discovers studio grades, logs in, selects a studio, completes five-step journey, signs contract, pays deposit/instalments, manages documents.
- **Staff**: manages academic years, studio content, amenities, contracts, payment plans, reviews applications/documents, allocates studios.
- **Partner**: tracks referred students, views payment status, monitors commission earnings, manages referral codes.
- **Superadmin**: full system control, including role management and audit oversight.

## 3. Data Model Overview

### 3.1 Supabase Tables

- `academic_years` – name, start/end dates, `is_active`.
- `studio_grades` – name, slug, descriptions, max occupancy, `is_active`.
- `studio_grade_media` – six images + optional video per grade.
- `amenities` & `studio_grade_amenities` – amenity catalogue and grade mappings.
- `studios` – existing dataset extended with `status`, `allocation`, `is_active`. `allocation` can be: `NULL` (Unallocated), `'Student'`, `'OTA'`, `'Keyworkers'`, or UUID (temporary student reservation during 30-min hold period). Studios allocated to OTA or Keyworkers are excluded from student selection and availability calculations.
- `payment_plans` – per academic year, references deposit amount.
- `payment_plan_installments` – ordered schedule items with offsets/percentages.
- `studio_grade_prices` – per academic year + grade weekly price & deposit override.
- `contracts` – contract metadata (start/end dates, weekly price override).
- `contract_payment_plans` – junction table allowing multiple payment plans per contract.
- `contract_payment_schedule` – resolved due dates/amounts for generated contracts.
- `docusign_envelopes` – tracks DocuSign envelope status and metadata for agreements.
- `profiles` – Supabase `auth` extension storing role and profile basics (roles: `student`, `staff`, `partner`, `superadmin`).
- `partners` – partner referral program management with referral codes and commission rates.
- `partner_referrals` – tracks which applications are referred by partners, commission calculations.
- `cashback_campaigns` – cashback campaign definitions (amount, applies_to, dates, max_uses, academic_year_id).
- `application_cashbacks` – applied cashbacks to student applications.
- `student_applications` – booking pipeline state machine.
- `student_application_steps` – JSON payload per form step.
- `student_documents` – uploads metadata & verification status.
- `student_signatures` – signature audit trail (student/guarantor).
- `manual_payments` – manual payment records (cash, card, bank transfer, cheque). Supports orphaned payments (application_id can be NULL) for pre-application payment recording. Unique receipt_number for student verification.
- `staff_activity_logs` – immutable audit log.
- `notifications` – in-app notifications with email template support, starring, read/unread status.
- `email_templates` – HTML email templates with dynamic variable replacement.
- `bulk_messages` – bulk and targeted message tracking and history. Stores both bulk messages (all confirmed students) and targeted messages (specific students or filtered groups) with `message_type` in `filters` JSONB column.
- `refunds` – refund processing and audit trail.
- `financial_forecasts` – revenue forecasting calculations.
- `branding_settings` – branding assets paths, text content, colors, and fonts (logo, favicon, contact info, footer text, 17 color settings, 4 font settings). All system colors and fonts centralized here for easy brand management.
- `navigation_items` – navigation items for header and footer with ordering and active status.
- `opening_hours` – structured opening hours for each day of the week.
- `maintenance_requests` – student maintenance and general requests (title, description, status, priority, type, images, resolution notes, check-in/check-out dates and notes).
- `maintenance_request_comments` – comments on maintenance requests from students or staff.
- `maintenance_request_images` – storage paths for maintenance request images.
- `utility_payments` – utility payments and operational expenses tracked per academic year (expense category, description, amount, payment date, vendor, invoice number, receipt image).
- `student_message_reads` – tracks when a student has seen a bulk or targeted message (ensures login dialog shows only once per message).

### 3.2 Storage Buckets

- `studio-media/{studio_grade_slug}/{uuid}` – public via signed URLs.
- `documents/{student_id}/{application_id}/{type}/{uuid}` – private.
- `contracts/{application_id}/signed-{timestamp}.pdf` – private.
- `branding/` – branding assets (logo, favicon) – public read access.
- `maintenance-images/{user_id}/{uuid}.{ext}` – private, students can upload to their own folder, staff can view all.
- `expense-receipts/{academic_year_id}/{category}/{uuid}.{ext}` – private, staff only.

### 3.3 Roles & RLS

- Roles stored in `profiles.role` (`student`, `staff`, `partner`, `superadmin`).
- RLS policies ensure students only access their records; staff/superadmin have scoped or full access; partners only access their own referral data.
- Service role key used for migrations/edge functions only.

## 4. Workflows

### 4.1 Public Studio Grade Page

1. Fetch grade, media, amenities, and contracts via Supabase queries.
2. Display hero, overview, amenity carousel, global amenities video, image gallery (Embla carousel on mobile), dynamic contract cards.
3. “Enquire” triggers auth gate.

### 4.2 Auth Gate

- Combined login/register flow leveraging Supabase Auth (email/password for now).
- Post-auth redirect to contract detail.

### 4.3 Contract & Studio Selection

- Show contract overview, weekly price, start/end, payment plan summary.
- Present list/grid of available studios with photos (grade gallery reused).
- **Studio Availability Filtering**: Students only see studios where `allocation IS NULL` (Unallocated), `allocation = 'Student'`, or `allocation = {studentId UUID}` (their own temporary reservation). Studios allocated to OTA or Keyworkers are automatically excluded from student selection.
- Selected studio reserved (set `status = 'reserved'`, `allocation = {studentId}`, `reservation_expires_at`). Scheduled job releases expired reservations.

### 4.4 Student Journey (6 Steps)

1. **Personal Details** – name, DOB, age (auto-calculated), ethnicity, gender, UCAS ID, country.
2. **Contact Information** – email (locked to auth), mobile, address lines, postcode, town.
3. **Academic & Additional Info** – year, field, disability, smoker, medical requirements, entry to UK.
4. **Documentation** – UK citizen toggle; uploads (passport, visa). Drag-and-drop upload to Supabase Storage.
5. **Payment Plan & Guarantor** – choose plan (options filtered by contract), guarantor details, supporting documents, consent checkbox. Multiple payment plans can be associated with each contract via `contract_payment_plans` junction table.
6. **Agreement & Signing** – DocuSign integration for tenancy and guarantor agreements. Real-time status polling, embedded signing ceremony, progress tracking.

Each step autosaves to `student_application_steps`; global progress indicator with mobile-friendly bottom-sheet dialogs.

### 4.5 Agreement & Signatures

- Generate PDF via Supabase Edge Function (`create-contract-pdf`), merging contract + application data.
- DocuSign integration for compliant e-signatures; embed signing ceremony. Webhook updates stored in `student_signatures` and uploads signed PDF to storage.
- **DocuSign Template Requirements:**
  - **CRITICAL:** Data fields must NOT have "Read Only" checked (prevents API population)
  - Tab labels must match exactly (case-sensitive): `academic_year`, `weekly_rate`, `tenant_name`, `deposit_amount`, `tenancy_period`, `total_rent`, `plan_summary`, `print_name`
  - All tabs must be assigned to "Tenant" role (or configured role name)
  - Role name must match exactly between template and code (default: "Tenant")
  - Only `print_name` field should have "Read Only" checked
  - Envelopes are created when Step 5 is submitted, not when signing button is clicked

### 4.6 Payments

- Deposit: Stripe Payment Intent created via edge function, success transitions application to signature step.
- Instalments: Option A – Stripe Billing (invoices scheduled per `payment_plan_installments`). Option B – manual triggers with Payment Intents; record status in `contract_payment_schedule`.
- **Payment Calculation Logic** (Implemented 2025-01-25):
  - Contract Total = `weekly_price × weeks`
  - Deposit = `payment_plan.deposit_amount` (or contract/grade override)
  - Remaining Balance = Contract Total - Deposit
  - Installments = Remaining Balance × percentage (NOT Contract Total × percentage)
  - All calculations aligned across database functions and frontend hooks
  - Remaining balance correctly shows £0.00 when all installments are paid
- **Payment History PDF** (Implemented 2025-01-25, Enhanced 2025-01-25):
  - Edge function: `generate-payment-history-pdf`
  - Branded PDF with logo, colors, and fonts from `branding_settings`
  - Complete payment history (deposit + all installments)
  - "PAID IN FULL" stamp image positioned above Amount column (50px spacing)
  - Proper spacing between labels and values (150px offset)
  - Visible transaction borders (1.5px) between payment rows
  - Deposit amount displayed in Payment Summary
  - Enhanced student name retrieval with multiple fallbacks
  - Downloadable from Fully Paid Students admin page

### 4.7 Confirmation & Allocation

- Upon deposit + signature + verification, application status → `confirmed`; studio `status = 'occupied'` and `allocation = 'Student'` (permanent allocation). Notification dispatched.
- Auto-allocation trigger (`handle_application_confirmation`) automatically sets studio allocation to 'Student' when application is confirmed, and clears allocation when application is unconfirmed.

## 5. Error Handling & Validation

### 5.1 Error Boundaries
- **ErrorBoundary Component**: React Error Boundary implemented to catch and handle unhandled errors gracefully
- **Location**: Wraps entire application in `App.tsx` and routes in `BrowserRouter`
- **Features**:
  - Catches React component errors
  - Displays user-friendly error UI with "Try Again" and "Go Home" options
  - Shows detailed error information in development mode
  - Prevents entire application crashes

### 5.2 Form Validation
- **Validation Library**: Zod schemas with React Hook Form integration
- **Validated Forms**:
  - Email Templates: Full Zod validation with type safety
  - Academic Years: Date range validation (start_date < end_date), format validation
  - Payment Plans: Comprehensive validation with installment rules
  - Contracts: Full validation with date and relationship checks
  - Studio Grades: Media and content validation
- **Validation Features**:
  - Client-side validation before submission
  - Real-time error messages
  - Type-safe form data
  - Database constraint alignment

### 5.3 Refunds System
- **Payment Intent Fetching**: Edge function `get-payment-intent-details` fetches real Stripe payment amounts
- **Refund Processing**: Edge function `process-refund` handles Stripe refunds with audit trail
- **Features**:
  - Fetches actual payment amounts from Stripe (not placeholder data)
  - Validates payment status before allowing refunds
  - Records refunds in database with full audit trail
  - Sends notifications to students

## 6. Portals

### 6.1 Student Portal

- **Dashboard**: application status, outstanding tasks, quick links to resume form, pay instalments.
- **Payments Page**: 
  - Payment schedule display with deposit and instalments
  - Stripe integration for online payments
  - Real-time payment status updates
  - "Pay Now" buttons with loading states
  - Payment history tracking
  - Skeleton loaders for better UX
- **Documents Page**:
  - Document upload and management
  - Document sync functionality
  - Verification status display
  - Document preview with thumbnails
  - Skeleton loaders
- **Contracts Page**: 
  - Contract details display
  - Payment plan information
  - Signed document access
- **Notifications Page**:
  - Email-style notification interface
  - Filter tabs with badge counters (All, Unread, Read, Starred)
  - Search functionality
  - Multiselect with bulk actions (mark as read, star, unstar)
  - Pagination (12 per page)
  - Side panel for detail view
  - **Email Template Rendering**: When a notification is sent via bulk message with an email template, the detail view displays the fully rendered HTML email body with personalized variables replaced (student name, studio number, contract dates, etc.)
  - Starred notifications persist in database
  - Entire notification row is clickable
  - Skeleton loaders
- **Profile Page**: 
  - Profile information editing
  - Password change functionality
  - Form validation
  - Skeleton loaders
  - **Name Synchronization**: Automatic sync of first_name and last_name from multiple sources (profiles table, user.app_metadata, application step 1) with fallback logic. Names are synced during registration, application step 1 submission, and on profile page load if missing.
- **Maintenance Requests Page** (`/portal/maintenance`):
  - Submit maintenance, cleaning, and general requests
  - Upload up to 5 images per request
  - Track request status (pending, in_progress, resolved, cancelled)
  - Set priority (low, normal, high, urgent)
  - View request history with status badges
  - Mobile-responsive with bottom-sheet dialogs
  - "New Request" button in mobile header
- **Login Message Dialog**:
  - Shows dialog once at login if student has unread bulk or targeted messages
  - Displays messages one at a time with "Next Message" or "Got It!" button
  - Automatically marks messages as read when dismissed
  - Prevents duplicate dialogs (only shows once per message)
- **Mobile Navigation**: 
  - Collapsible mobile menu
  - Sign-out confirmation dialog
  - Responsive design throughout

### 6.2 Staff Portal

- Overview metrics (occupancy, revenue projections, pending verifications).
- CRUD modules:
  - Academic Years.
  - Studio Grades (content, media upload, amenities).
  - Amenities.
  - Payment Plans + installment builder.
  - Contracts (link to academic year/grade, associate multiple payment plans, weekly rent, deposit, date range). **Enhanced Features (2025-01-25):**
    - **Academic Year Filter**: Toggle to filter contracts by academic year (defaults to active year)
    - **Editable Contract Name**: Contract names can be edited in edit mode (previously read-only)
    - **Payment Plan Order Management**: Payment plans maintain their display order when editing contracts (order no longer resets)
    - **Default Payment Plan Order**: Sensible default order (Pay in Full=1, 3 Instalments=2, 4 Instalments=3, 10 Instalments=4) for new contracts
    - **Accurate Weeks Calculation**: Uses Math.round() for accurate contract duration calculation (replaces Math.ceil() which rounded up)
    - **Automatic Weeks Recalculation**: Weeks are automatically recalculated and saved when contract dates are edited
  - Studios (status management, import, floor filters).
- **Application Management**: 
  - Review steps, verify documents, update status
  - Reassign studios
  - Trigger email/SMS notifications
  - Color-coded status badges
  - **Application Detail Page**:
    - Complete field display from all application steps (Step 1: Personal Details including country, ethnicity, gender, UCAS ID; Step 2: Contact Information including mobile; Step 3: Academic Information including disability, smoker, entry to UK, medical requirements; Step 4: UK Citizen status; Step 5: Guarantor and Witness information)
    - Document verification with approve/reject functionality
    - Document preview functionality
    - Mobile-responsive UI with optimized back button placement
    - Quick action buttons (Send Deposit Reminder, Send Signature Reminder, etc.)
- **Student Management**: 
  - View all confirmed students
  - Search and filter functionality
  - Detailed student records with full application information
  - Manual payment recording
  - Student detail view with payment history
- **Financial Management**: 
  - Payment tracking
  - Manual payment recording (in-person payments)
  - Refunds processing with Stripe integration
  - Financial reports
  - **Financial Forecasting**: Target revenue input, students needed calculation per contract type, occupancy impact analysis
- **Reporting**: 
  - Awaiting signatures
  - Awaiting deposits
  - Overdue payments
  - Debtors
  - **Occupancy reports**: 
    - Studio grade breakdown with occupancy statistics (total, occupied, available, reserved, maintenance, percentage)
    - **Availability Calculations**: Studios allocated to OTA or Keyworkers are excluded from student availability counts and total capacity calculations
    - Overall occupancy summary with academic year filtering
    - Detailed view of occupied studios with student information
    - Uses `studio_status_by_academic_year` view for accurate per-academic-year status
    - Exportable to CSV with comprehensive metrics
  - **Studio Allocation Report** (`/admin/reports`):
    - Shows studio allocation counts by studio grade and allocation type
    - Breakdown: Total studios, Active studios, Allocated to Students, Allocated to OTA, Allocated to Keyworkers, Unallocated
    - Status breakdown: Available, Occupied, Reserved, Maintenance
    - Exportable to CSV
  - **Booking Calendar** (`/admin/booking-calendar`):
    - Airbnb-style calendar view showing studio occupancy by date
    - **Layout**: Studios as rows, dates as columns (monthly view)
    - **Filtering**: By allocation type (Student, OTA, Keyworkers, Unallocated), studio grade, and academic year
    - **Date Navigation**: Previous/Next month buttons and "Today" button
    - **Occupied Dates**: Highlighted with student name and contract information
    - **Click to View**: Click on occupied dates to open check-in/check-out dialog (or navigate to applications page if no booking)
    - **Check-in/Check-out Management**: 
      - Set actual check-in and check-out dates regardless of contract dates
      - Add check-in and check-out notes
      - Calendar displays effective dates (actual if set, otherwise contract dates)
      - Dialog to manage check-in/check-out for each booking
    - **Export**: CSV export with all booked studios and details
    - **Mobile Responsive**: Horizontal scrolling calendar on mobile devices with drag scrolling
    - Uses `get_booking_calendar_data` RPC function to fetch data with student email from `auth.users`
  - **Weekly Payment Report** (`/admin/weekly-payment-report`):
    - Generates payment summaries for selected week (start date + optional end date, defaults to 7 days)
    - **Data Source**: Uses `unified_payment_history` view which includes:
      - **Stripe payments** from `stripe_payments` table (status: 'succeeded' or 'completed')
      - **Deposit payments** from `student_applications` table (backward compatibility for deposits not yet migrated to `stripe_payments`)
      - **Manual payments** from `manual_payments` table
    - **Summary Statistics**:
      - Total amount and count
      - Stripe amount and count
      - Manual amount and count
    - **Payments by Day**: Grouped breakdown showing daily payment totals
    - **Filtering**: Optional filters by contract ID and academic year ID
    - **Export**: CSV export functionality
    - **Edge Function**: `weekly-payment-report` handles data aggregation and date range filtering
  - Revenue reports
  - All exportable to CSV
- **Communication**: 
  - **Bulk Messaging**: Template-first workflow, email preview, per-student variable replacement, notification and email sending
  - **Email Templates**: Beautiful, type-specific templates (welcome, application_received, deposit_reminder, payment_reminder, overdue_payment, application_confirmed, document_approved, document_rejected, signature_reminder, custom), dynamic variable system, template preview, default template loading
  - Notification management
- **Studio Management**: 
  - Studio roster with color-coded status badges
  - **Allocation Filter**: Filter by allocation type (All allocations, Student, OTA, Keyworkers, Unallocated)
  - **Floor Filter**: Filter studios by floor (dynamically populated from studio data)
  - **Status Filter**: Filter by studio status (Available, Reserved, Occupied, Maintenance)
  - **Academic Year Filter**: View studio status per academic year using `studio_status_by_academic_year` view
  - **Bulk Selection**: 
    - Checkbox selection for individual studios
    - "Select All" functionality
    - Bulk actions menu with options:
      - Set Allocation to Student/OTA/Keyworkers/Unallocated
      - Set Status to Available/Maintenance
    - Confirmation dialog for bulk operations
    - Visual feedback for selected studios
  - Studio import functionality
  - Individual studio status and allocation management
- **User Management**: 
  - Invite staff
  - Assign roles
  - User management interface
- **Audit Log Viewer**: 
  - Staff activity tracking
  - Filtering and search
  - CSV export
- **Refunds Management**: 
  - Refund processing with Stripe integration
  - Refund history tracking
  - Student notifications (in-app and email)
  - Audit logging
  - Mobile-responsive refund records (cards on mobile, table on desktop)
- **Mobile Navigation**: 
  - Collapsible mobile menu
  - Sign-out confirmation dialog
  - Responsive design throughout
- **Partner Management**:
  - Create and manage partners
  - Assign referral codes (one per partner)
  - Set commission percentages (configurable, default 5%)
  - Create partner user accounts (admin can create accounts for partners)
  - View partner referral statistics
- **Partner Commission Tracking**:
  - View all partner commissions
  - Filter by partner, status, date range
  - Update commission status (pending, approved, paid, cancelled)
  - Export commission reports (CSV, PDF)
- **Cashback Campaign Management**:
  - Create cashback campaigns (amount, applies_to: all/new/rebooking, dates, max_uses, academic_year_id)
  - Filter campaigns by academic year (shows campaigns for selected year + campaigns with no academic year)
  - Apply cashbacks to applications
  - Track campaign usage
  - Academic year context: Campaigns can be associated with specific academic years or apply to all years (null academic_year_id)
- **Payment History**:
  - Unified view of Stripe and manual payments
  - Payment summaries per application
  - Export functionality
- **Maintenance Management** (`/admin/maintenance`):
  - View all student maintenance requests
  - Filter by status, priority, type, academic year
  - Search functionality
  - Update request status and priority
  - Add resolution notes
  - View uploaded images (with signed URLs)
  - Statistics cards (total, pending, in progress, urgent)
  - Mobile-responsive with optimized font sizes
- **Expenses Management** (`/admin/expenses`):
  - Track utility payments and operational expenses per academic year
  - Expense categories: electricity, gas, water, internet, council_tax, maintenance, cleaning, insurance, salaries, marketing, other
  - Upload receipt/invoice images
  - Filter by academic year, category, date range
  - Search functionality
  - Export to CSV
  - Statistics cards (total expenses, total amount, categories)
  - Mobile-responsive with optimized font sizes
- **Booking Calendar** (`/admin/booking-calendar`):
  - **Check-in/Check-out Management**: 
    - Set actual check-in and check-out dates regardless of contract dates
    - Add check-in and check-out notes
    - Calendar displays effective dates (actual if set, otherwise contract dates)
    - Dialog to manage check-in/check-out for each booking
    - Updates `actual_check_in_date`, `actual_check_out_date`, `check_in_notes`, `check_out_notes` fields
  - **Date Navigation**: Previous/Next month buttons and "Today" button
  - **Mobile Drag Scrolling**: Mouse drag scrolling for dates section on desktop, touch scrolling on mobile
- **Settings** (`/admin/settings`):
  - **Social Media Links**: Manage social media profile URLs (Instagram, TikTok, LinkedIn, Facebook, WhatsApp) with enable/disable toggles
  - **Integrations Status**: View connection status for Stripe, DocuSign, and Resend with refresh functionality
  - **Notifications**: Control automated reminders and operational updates (upcoming instalments, document uploads)
  - **Data Management** (Development/Testing):
    - Application statistics display (total applications and breakdown by academic year)
    - **Delete All Applications**: One-click deletion of all student applications and all related records
    - **Delete by Academic Year**: Select specific academic year and delete all applications for that year
    - Comprehensive deletion includes:
      - Application records and all steps (`student_application_steps`)
      - Uploaded documents and signatures (`student_documents`, `student_signatures`)
      - Payment records (Stripe and manual payments: `stripe_payments`, `manual_payments`)
      - Partner referrals and commissions (`partner_referrals`, `application_cashbacks`)
      - DocuSign envelopes (`docusign_envelopes`)
      - Studio allocations (automatically frees studios: sets `status = 'available'`, `allocation = NULL`)
      - Updates refunds and rebooking references (sets `application_id` to NULL where appropriate)
    - Safety features:
      - Confirmation dialogs with detailed warnings
      - Statistics display showing what will be deleted
      - Audit logging of all deletions
      - Error handling with detailed error messages
    - Database functions:
      - `delete_student_application(p_application_id UUID)`: Deletes single application and all related records
      - `delete_all_student_applications()`: Deletes all applications in the system
      - `delete_student_applications_by_academic_year(p_academic_year_id UUID)`: Deletes applications for specific academic year
    - All functions use `SECURITY DEFINER` and disable RLS to ensure complete deletion
    - Functions return JSONB with deletion counts and detailed results

### 6.3 Partner Portal ✅ IMPLEMENTED

- **Authentication**:
  - **Partner Login Page** (`/partner/login`):
    - Beautiful two-column layout matching modern design standards
    - Left section: Red gradient background with promotional content, statistics (Active Partners, Total Payouts, Avg Commission), and dashboard visualization
    - Right section: White background with login form, email/password fields, "Keep me signed in" checkbox
    - Mobile responsive: Left section hidden on mobile, condensed header with stats shown
    - Skeleton loaders during initial load with "SC" placeholder for favicon
    - Uses branding fonts (Big Shoulders Display for headings, Inter Tight for body)
    - Favicon from branding settings displayed in logo containers
  - **Request Password Reset Page** (`/partner/request-password-reset`):
    - Beautiful two-column layout matching login page design
    - Email input form for requesting password reset
    - Success state with confirmation message
    - Navigates to `/partner/reset-password` when user clicks link in email
  - Partner registration with referral code validation (`/partner/register`)
  - Password reset page (`/partner/reset-password`) for setting initial password or resetting forgotten password
  - Real-time referral code validation during registration
  - Auto-linking of accounts to partner records via referral code
  - Admin can create partner accounts directly (automatically sends password reset email)
  - **Password Reset Workflow**:
    1. User clicks "Reset it here" on login page → navigates to `/partner/request-password-reset`
    2. User enters email address in form
    3. System sends password reset email using `resetPasswordForEmail()`
    4. User clicks link in email → redirected to `/partner/reset-password` with token
    5. User sets new password (validates token, creates session, updates password)
    6. User can then log in with their password
    7. Admin-created accounts: System automatically sends password reset email when admin creates partner account
- **Dashboard** (`/partner`):
  - Overview metrics:
    - Total referrals
    - Confirmed applications
    - Total commission earned
    - Pending commission
  - Recent referrals list with payment status
- **My Referrals** (`/partner/referrals`):
  - List of all referred students (names only, no email/phone for privacy)
  - Payment status per student (fully paid, partially paid, unpaid)
  - Contract value and commission amount
  - Remaining balance tracking
  - Last payment date
  - Export to CSV
- **Commissions** (`/partner/commissions`):
  - Commission history with status badges
  - Summary cards (total, paid, pending)
  - Filter by commission status
  - Export to CSV
- **Profile** (`/partner/profile`):
  - Partner information display
  - Referral code display
  - Commission rate
  - Account status
- **Mobile Navigation**:
  - Collapsible mobile menu
  - Sign-out confirmation dialog
  - Responsive design throughout

## 7. Integrations

- **Supabase Edge Functions**
  - `reserve-studio` – Studio reservation logic
  - `create-contract-pdf` – PDF contract generation
  - `create-payment` – Stripe payment intent creation (deposit and instalments)
  - `check-payment-status` – Payment status verification
  - `docusign-envelopes` – DocuSign envelope creation
  - `docusign-recipient-view` – DocuSign signing URL generation
  - `docusign-check-status` – DocuSign status polling (prevents status downgrade from confirmed/cancelled/expired)
  - `get-publishable-key` – Stripe key retrieval
  - `stripe-webhook` – Stripe webhook handler
  - `calculate-forecast` – Financial forecasting calculations
  - `get-user-emails` – User email fetching from auth.users
  - `send-bulk-message` – Bulk and targeted notification/email sending with template variable replacement. Supports two modes:
    - **Bulk mode**: Sends to all confirmed students (default behavior)
    - **Targeted mode**: Sends to specific students (via `student_ids`) or filtered groups (via `application_status`, `studio_grade_id`, `academic_year_id`, etc.)
    - Enhanced error handling with HTML response detection and detailed logging
    - Debug logging for troubleshooting targeted vs bulk message flows
  - `send-transactional-email` – Transactional email sending for specific events, enhanced error handling with HTML response detection and detailed logging
  - `process-refund` – Refund processing with Stripe integration, audit logging, and notifications
  - `get-payment-intent-details` – Fetches payment intent details from Stripe for refund processing
  - `release-expired-reservations` – Automatic release of expired studio reservations
  - `create-contract-pdf` – PDF generation for contracts
  - `download-signed-document` – DocuSign signed document download
  - `get-email-template` – Secure email template fetching for students (bypasses RLS, validates notification ownership)
  - `create-partner-account` – Admin function to create partner user accounts with automatic password reset email
    - Creates auth user account
    - Links profile to partner record
    - Automatically sends password reset email using `resetPasswordForEmail()`
    - Handles existing accounts (sends reset if already linked, returns error if linked to different partner)
    - Redirects to `/partner/reset-password` for password setup
  - `weekly-payment-report` – Weekly payment report generation
  - `manage-users` – Admin function to create and update users, bypasses RLS for user management
  - Data Management Functions (Development/Testing):
    - `delete_student_application(p_application_id UUID)` – Deletes single application and all related records, returns deletion statistics
    - `delete_all_student_applications()` – Deletes all applications in the system, returns JSONB with deletion count and details
    - `delete_student_applications_by_academic_year(p_academic_year_id UUID)` – Deletes applications for specific academic year, returns JSONB with deletion count and details
    - All functions use `SECURITY DEFINER` and `set_config('row_security', 'off', true)` to bypass RLS
    - Functions handle cascading deletes, studio allocation cleanup, and orphaned record prevention
  - **Database Views**:
    - `booking_calendar_data` – View showing all studios with their bookings (confirmed applications) including date ranges from contracts. Includes studio info, student info, contract dates, and academic year. Note: `studio_status` and `application_status` are cast to TEXT to match function return types.
    - `studio_status_by_academic_year` – Shows effective status of each studio per academic year based on applications
    - `studio_allocation_report` – Studio allocation counts by studio grade and allocation type
    - `unified_payment_history` – Unified view of all payments (Stripe, manual, deposits)
    - `bank_reconciliation_report` – Bank reconciliation data with student names and payment details
  - **RPC Functions**:
    - `get_booking_calendar_data(p_allocation TEXT, p_studio_grade_id UUID, p_academic_year_id UUID)` – Returns booking calendar data with student email from `auth.users`. Uses `SECURITY DEFINER` to access `auth.users` table. Filters by allocation, studio grade, and academic year. Returns TEXT types for enum columns (`studio_status`, `application_status`). Includes `actual_check_in_date`, `actual_check_out_date`, `check_in_notes`, `check_out_notes`, and calculates `effective_check_in_date` and `effective_check_out_date` (actual if set, otherwise contract dates). Includes `actual_check_in_date`, `actual_check_out_date`, `check_in_notes`, `check_out_notes`, and calculates `effective_check_in_date` and `effective_check_out_date` (actual if set, otherwise contract dates).
    - `get_revenue_summary(p_start_date DATE, p_end_date DATE, p_group_by TEXT)` – Revenue summary grouped by month or quarter
    - `get_admin_dashboard_stats(p_academic_year_id UUID)` – Dashboard statistics for admin portal
    - `verify_payment_by_receipt(p_receipt_number TEXT)` – Verifies a payment by receipt/cheque number. Returns payment details including whether it's already linked to an application. Used for student self-service payment verification in Step 5.
    - `link_payment_to_application(p_receipt_number TEXT, p_application_id UUID)` – Links an unlinked payment (identified by receipt number) to an application. Only works if payment is not already linked. Automatically updates deposit status when linking deposit payments.
- **Stripe** – capture payment method, deposit, instalment payments, webhook for payment updates, refund processing.
- **DocuSign** – agreement creation, embedded signing, status polling, signed document retrieval, envelope management.
- **Email Service (Resend)** – transactional notifications, bulk messaging, template-based emails with variable replacement. Configured with dedicated sending domain `send.portal.urbanhub.uk` for high deliverability. Enhanced error handling with HTML response detection, detailed logging, and API key validation. See `docs/SYSTEM_IMPROVEMENTS_AND_CONFIG.md` for complete setup instructions.

## 8. Branding System

### 8.1 Centralized Branding (Implemented 2025-01-25)

All brand colors, fonts, and assets are centralized in the `branding_settings` table for easy management and consistency across the entire system.

**Branding Settings Structure**:
- **Colors** (17 settings): Primary, secondary, accent, success, destructive, muted, background, foreground, border, card colors and their foregrounds
- **Fonts** (4 settings): Body font (Inter Tight), display font (Big Shoulders Display), and fallbacks
- **Assets**: Logo, favicon, hero images
- **Contact Info**: Phone, email, address
- **Text Content**: Footer description, copyright text, emergency contact

**Benefits**:
- Single source of truth for all branding
- Change once, updates everywhere (PDFs, emails, UI)
- Easy brand consistency management
- No hardcoded colors or fonts

**Usage**:
- **PDFs**: Edge functions fetch branding settings and use colors/fonts/logo
- **Emails**: Email templates use branding colors and fonts
- **UI**: CSS variables can reference branding (future enhancement)
- **Admin**: Edit all branding in Admin → Branding page

### 8.2 Payment History PDF Generation

**Edge Function**: `generate-payment-history-pdf`

**Features**:
- Branded PDF with company logo, colors, and fonts
- Complete payment history (deposit + all installments)
- Beautiful "Fully Paid" stamp with success color
- Professional layout and formatting
- Downloadable from Fully Paid Students admin page

**PDF Contents**:
- Header with logo and company name
- Student information
- Contract details
- Payment summary (total due, total paid, remaining balance)
- Payment history table (date, type, description, amount)
- "Fully Paid" stamp (if applicable)
- Footer with generation date

## 9. UI/UX Principles

- Keep existing visual language; enhance with iOS-like micro-interactions, smooth transitions via Framer Motion.
- Typography: use **Big Shoulders Display** in bold or black weight only, always uppercase; use **Inter Tight** with appropriate weight for body copy and supporting text with normal casing.
- **Mobile-first**: 
  - Stacked layouts, swipeable carousels, bottom-sheet dialogs with zero bottom margin
  - Mobile navigation menus for both portals
  - Responsive table/card layouts (tables on desktop, cards on mobile)
  - Touch-friendly button sizes
  - Scrollable tabs on mobile
  - Reduced font sizes for mobile
  - Dialog forms enter from bottom on mobile
- **Skeleton Loaders**: Component-specific skeleton loaders on all portal pages for better perceived performance
- **Color-Coded Status Badges**: 
  - Application statuses (draft, awaiting_deposit, awaiting_signature, awaiting_verification, confirmed, cancelled, expired)
  - Studio statuses (available, reserved, occupied, maintenance)
  - Bulk/Targeted message statuses (pending, sending, completed, failed)
  - Refund statuses (pending, succeeded, failed)
  - DocuSign envelope statuses (sent, delivered, completed)
- **Badge System**: Colored badges with counters on filter tabs, notification counts, and status indicators
- Accessibility: keyboard navigation, ARIA attributes, high-contrast validation states.
- Ensure "Back" buttons align right edge, deposit CTA sticky on mobile.
- **Sign-Out Confirmation**: AlertDialog for sign-out confirmation on both portals

## 9. Implementation Roadmap

1. **Environment Setup** – ensure Supabase/Stripe keys in `.env.local`.
2. **Database Migrations** – create tables, relationships, indexes, RLS policies, storage buckets.
3. **Admin Portal Scaffold** – authentication guard, navigation, placeholder CRUD screens.
4. **Dynamic Public Pages** – grade data pipeline, gallery, contracts.
5. **Contract Flow** – auth gate, studio selection, reservation logic.
6. **Student Journey Wizard** – five-step form with autosave.
7. **Document Uploads & Storage** – integrate file handling, progress indicators.
8. **PDF & Signature Integration** – edge functions + Adobe Sign flows.
9. **Stripe Payments** – deposit + instalment scheduling, student portal payment UI.
10. **Student Portal** – dashboards, document center, payment overview.
11. **Staff Portal** – full CRUD and application management.
12. **Testing & QA** – unit/integration tests, responsive checks, security review.
13. **Launch Readiness** – data seeding tools, monitoring, backup strategy.

## 10. Implemented Features Beyond Original Spec

### 9.1 Notification System
- **Email-Style UI**: Gmail-inspired notification interface with filter tabs, search, multiselect, and pagination
- **Email Template Integration**: Notifications sent via bulk messages can include email templates. When clicked, the notification detail view displays the fully rendered HTML email body with personalized variables replaced
- **Template Variable Replacement**: Dynamic replacement of variables like `{student_name}`, `{studio_number}`, `{contract_start}`, `{contract_end}`, `{application_id}`, `{portal_url}`, `{logo_url}`, `{title}`, `{message}`, `{date}`
- **Starred Notifications**: Persist in database, filterable
- **Bulk Actions**: Mark as read, star, unstar for multiple notifications
- **Secure Template Access**: `get-email-template` Edge Function validates that students can only access templates for notifications they own

### 9.2 Email Template System
- **Template Types**: welcome, application_received, deposit_reminder, payment_reminder, overdue_payment, application_confirmed, document_approved, document_rejected, signature_reminder, custom
- **HTML Templates**: Beautiful, type-specific HTML templates with branding fonts (Inter Tight, Big Shoulders Display) and colors (primary red, accent yellow)
- **Dynamic Variables**: Template variable system with info button showing available variables
- **Template Preview**: Preview functionality for templates
- **Default Templates**: Load default template functionality for quick setup

### 9.3 Bulk Messaging
- **Template-First Workflow**: Select email template first, auto-populates notification fields
- **Email Preview**: Preview email before sending
- **Per-Student Variable Replacement**: Each student receives personalized email with their data
- **Notification + Email**: Sends both in-app notification and email
- **Template Metadata**: Stores `email_template_id` and `bulk_message_id` in notification metadata
- **Target Audience**: Sends to all confirmed students by default

### 9.4 Targeted Messaging
- **Status**: ✅ Implemented & Deployed (2025-11-25)
- **Purpose**: Send messages to specific students or filtered groups (complements bulk messaging)
- **Two Selection Methods**:
  - **Direct Selection**: Searchable multi-select to choose specific students by name/email
  - **Filter by Category**: Filter by application status, studio grade, or academic year
- **Same Template System**: Uses same email template workflow as bulk messages
- **Separate History**: Targeted messages tracked separately from bulk messages
- **Flexible Targeting**: Can send to students even if they don't have applications (when using direct selection)
- **Mobile Responsive**: Tabbed interface optimized for mobile devices

### 9.4 Financial Forecasting
- **Revenue Goals**: Input target revenue
- **Student Calculation**: Calculates students needed per contract type to reach revenue goal
- **Occupancy Analysis**: Pulls from live occupancy reports
- **Visual Display**: Clear presentation of calculations

### 9.5 Refund Workflow
- **Stripe Integration**: Full Stripe refund processing
- **Database Recording**: All refunds recorded in `refunds` table
- **Audit Logging**: Complete audit trail
- **Student Notifications**: In-app and email notifications for refunds
- **Refund History**: Complete refund history display

### 9.6 Manual Payment Recording

**Admin Manual Payment Entry Page** (`/admin/manual-payment-entry`):
- Allows accountants to record payments before applications exist
- Form fields: Payment type (deposit/instalment), amount, payment method (cash/card/bank_transfer/cheque), receipt/cheque number (required, unique), payment date, notes
- List view of unlinked payments (orphaned payments waiting for student verification)
- Search functionality by receipt number
- Payments stored with `application_id = NULL` until student verifies

**Student Payment Verification (Step 5)**:
- "I've already paid the deposit" checkbox option
- Receipt/cheque number input field with real-time validation
- Visual indicators: ✓ for valid unlinked payment, ✗ for invalid/already linked
- Shows payment details when verified (amount, date, payment method)
- Automatic payment linking on Step 5 submission
- Updates deposit status and allows application submission without online payment

**Database Features**:
- `application_id` is nullable in `manual_payments` table (allows orphaned payments)
- Unique index on `receipt_number` (where not null) for fast lookup and duplicate prevention
- Index for orphaned payments (`application_id IS NULL`)
- RPC functions: `verify_payment_by_receipt()` and `link_payment_to_application()`
- RLS policies: Staff can view all payments (including orphaned), students can only view payments linked to their applications

### 9.7 Mobile Responsiveness
- **Mobile Menus**: Collapsible navigation for both portals
- **Responsive Layouts**: Tables on desktop, cards on mobile
- **Touch-Friendly**: Optimized button sizes and spacing
- **Mobile Forms**: Bottom-sheet dialogs, zero bottom margin

### 9.9 Academic Year Tabs UI Pattern
- **Design**: Red-themed segmented control with compact width
- **Container**: Lighter red background (`bg-primary/60`), rounded-full, auto width
- **Active State**: Darker red (`bg-primary`) with shadow for visual prominence
- **Inactive State**: Transparent background showing container color
- **Text Format**: Full year format "2026/2027" (not abbreviated)
- **Location**: Studio catalog page for academic year selection
- **Reference**: See `docs/UI_UX_STANDARDS.md` for detailed implementation

### 9.10 Additional Features
- **Skeleton Loaders**: Component-specific loaders on all pages
- **Color-Coded Badges**: Status indicators throughout the system
- **Studio Roster Filters**: 
  - Allocation filter (Student, OTA, Keyworkers, Unallocated)
  - Floor filter (dynamically populated)
  - Status filter (Available, Reserved, Occupied, Maintenance)
  - Academic year filter for per-year status view
- **Bulk Studio Management**: 
  - Multi-select with checkboxes
  - Bulk allocation updates (Student/OTA/Keyworkers/Unallocated)
  - Bulk status updates (Available/Maintenance)
  - Confirmation dialogs for bulk operations
- **Sign-Out Confirmation**: Confirmation dialogs for security
- **Auto-Allocation**: Automatic studio allocation to 'Student' on confirmation, clears allocation on unconfirmation
- **Reservation Expiry**: Automatic release of expired reservations
- **OTA/Keyworkers Exclusion**: Studios allocated to OTA or Keyworkers are automatically excluded from student selection and availability calculations

### 9.9 Partner Referral System ✅ IMPLEMENTED
- **Referral Code Management**: 
  - One unique referral code per partner (manually created by admin)
  - Real-time validation in student application wizard
  - Auto-assignment of partner when valid code is entered
- **Partner Authentication**:
  - Separate partner portal (`/partner/*`)
  - Partner registration with referral code validation (`/partner/register`)
  - Partner login page (`/partner/login`) with "Forgot password" functionality
  - Password reset page (`/partner/reset-password`) for setting initial password or resetting forgotten password
  - Admin can create partner accounts directly (automatically sends password reset email via `create-partner-account` edge function)
  - Auto-linking of accounts to partner records via referral code
  - Password reset email handling:
    - Uses Supabase `resetPasswordForEmail()` API
    - Redirects to `/partner/reset-password` with token in URL hash
    - Token validation and session management handled automatically
    - Supports both hash fragments and query parameters for email client compatibility
- **Partner Dashboard**:
  - Overview metrics (total referrals, confirmed applications, commissions)
  - Recent referrals list
  - Payment tracking per referred student
  - Commission history with status tracking
- **Payment Tracking**: Partners can see payment status (fully paid, partially paid, unpaid) for each referred student
- **Commission Management**: 
  - Automatic commission calculation on application confirmation
  - Commission status tracking (pending, approved, paid, cancelled)
  - Exportable commission reports (CSV, PDF)
- **Privacy**: Partners only see student names, not email/phone numbers

### 9.10 Cashback System ✅ IMPLEMENTED
- **Campaign Management**:
  - Create cashback campaigns (amount, applies_to: all/new/rebooking, dates, max_uses, academic_year_id)
  - Academic year context: Campaigns can be associated with specific academic years or apply to all years (null academic_year_id)
  - Filter campaigns by academic year in admin interface
  - Dashboard displays active campaigns filtered by selected academic year
  - Admin can apply cashbacks to applications
  - Campaign usage tracking
- **Application Integration**:
  - Cashback deducted from total booking amount (not given as money)
  - Adjusted payment schedules (final installment reduced by cashback)
  - Student portal displays cashback information
  - Payment summary accounts for cashback
- **Auto-Application**: Eligible cashbacks automatically applied when application is confirmed
- **Academic Year Filtering**:
  - When an academic year is selected, shows campaigns for that year OR campaigns with no academic year (applies to all)
  - AcademicYearSelector auto-selects default year on page load to ensure campaigns display immediately

### 9.11 Name Synchronization System
- **Multi-Source Name Resolution**: `useStudentName` hook that checks multiple sources in priority order:
  1. `profiles` table (first_name, last_name)
  2. `user.app_metadata` (first_name, last_name)
  3. `student_application_steps` step 1 payload (first_name, last_name)
  4. Falls back to "Student" if none found
- **Automatic Sync**: Names are automatically synced to `profiles` table during:
  - User registration (from signup form)
  - Application step 1 submission (from personal details)
  - Profile page load (from app_metadata if profile is missing names)
- **Display Locations**: Names are displayed in:
  - Student portal sidebar (desktop and mobile)
  - Profile page form fields
  - Notifications (replaces "Student" with actual name)
- **Non-Breaking**: All sync logic is additive and non-blocking, ensuring existing workflows continue to function

See `docs/SYSTEM_IMPROVEMENTS_AND_CONFIG.md` for detailed documentation of all improvements and configurations.

### 9.12 Production Readiness & Infrastructure ✅ IMPLEMENTED
- **Status:** ✅ Complete
- **Priority:** CRITICAL
- **Implementation Date:** November 2025
- **Features:**
  - ✅ **Environment Configuration**: `.env.example` file with all required variables documented
  - ✅ **Deployment Documentation**: Comprehensive `DEPLOYMENT.md` guide covering:
    - Environment setup
    - Database migrations
    - Edge functions deployment
    - Frontend deployment
    - Scheduled jobs configuration
    - Post-deployment checklist
    - Troubleshooting guide
  - ✅ **Production Checklist**: `PRODUCTION_CHECKLIST.md` with pre-deployment, deployment, and post-deployment items
  - ✅ **Scheduled Jobs**: 
    - Database migration for pg_cron setup (`20251120_setup_cron_jobs.sql`)
    - GitHub Actions workflow for external cron (`cron-jobs.yml`)
    - Automated release of expired studio reservations every 15 minutes
  - ✅ **Error Tracking**: Sentry integration (optional, won't break if not configured)
    - Frontend error tracking via `@sentry/react`
    - Automatic error capture and reporting
    - Performance monitoring
    - Session replay (optional)
  - ✅ **CI/CD Pipeline**: GitHub Actions workflow (`.github/workflows/ci.yml`)
    - Automated linting
    - Automated testing
    - Automated builds
    - Automated deployment to production
  - ✅ **Testing Infrastructure**: Vitest setup
    - Unit test configuration
    - Test utilities and setup
    - Coverage reporting
    - Example tests
  - ✅ **Improved Error Handling**:
    - Partner registration rollback improvements
    - Sentry error reporting integration
    - Better error messages and recovery
- **Files:**
  - `DEPLOYMENT.md` - Complete deployment guide
  - `PRODUCTION_CHECKLIST.md` - Production readiness checklist
  - `.env.example` - Environment variable template
  - `supabase/migrations/20251120_setup_cron_jobs.sql` - Cron job setup
  - `.github/workflows/ci.yml` - CI/CD pipeline
  - `.github/workflows/cron-jobs.yml` - Scheduled jobs
  - `src/utils/sentry.ts` - Sentry integration
  - `vitest.config.ts` - Test configuration
  - `src/test/setup.ts` - Test setup
  - `src/test/utils.test.ts` - Example tests
- **Configuration:**
  - Sentry DSN: Set `VITE_SENTRY_DSN` environment variable (optional)
  - Cron jobs: Configure via GitHub Actions secrets or Supabase pg_cron
  - CI/CD: Configure GitHub Actions secrets for deployment

See `COMPREHENSIVE_SYSTEM_ANALYSIS.md` for complete system assessment and gap analysis.

## 11. Outstanding Inputs

- ~~Stripe webhook signing secret~~ ✅ Configured
- ~~Adobe Sign client credentials + endpoint~~ ✅ DocuSign configured
- ~~Email provider choice + API key~~ ✅ Resend configured
- ~~Confirmation of payment approach~~ ✅ Manual Payment Intents implemented

## 12. Next Deliverables

- ✅ SQL migration scripts + Supabase CLI commands
- ✅ RLS policy definitions
- ✅ Implementation completed
- ✅ Deployment documentation (`DEPLOYMENT.md`)
- ✅ Production checklist (`PRODUCTION_CHECKLIST.md`)
- ✅ Environment variable documentation (`.env.example`)
- ✅ CI/CD pipeline (GitHub Actions)
- ✅ Scheduled jobs configuration
- ✅ Error tracking integration (Sentry)
- ✅ Testing infrastructure (Vitest)
- User guides (student and admin portals)
- API documentation
- Maintenance guides

## 13. Future Enhancements (Planned)

### 12.1 Studio Availability Tracking & Dynamic Tags ✅ IMPLEMENTED
- **Status:** ✅ Complete
- **Priority:** HIGH
- **Implementation Date:** February 2025
- Real-time availability calculation per studio grade
- **Availability Calculations**: 
  - Uses `get_studio_availability()` function and `studio_grade_availability_by_year` view
  - Studios allocated to OTA or Keyworkers are excluded from student availability counts
  - Per-academic-year availability tracking via `studio_status_by_academic_year` view
- Dynamic availability tags on catalog:
  - "Going Fast" when < 20% available
  - "X Left" when low availability (e.g., "2 Left", "1 Left")
  - "Fully Booked" when 0 available
- "Book Now" button changes to "Fully Booked" when no availability
- **Studio Allocation System**:
  - Allocation options: Student, OTA, Keyworkers, Unallocated
  - Temporary reservations use UUID format (30-min hold period)
  - Auto-allocation to 'Student' on application confirmation
  - OTA/Keyworkers studios excluded from student selection
- See `docs/STUDIO_ALLOCATION_DEEP_ANALYSIS.md` for detailed implementation analysis

### 12.2 Rebooking System ✅ IMPLEMENTED
- **Status:** ✅ Complete
- **Priority:** MEDIUM
- **Implementation Date:** November 2025
- **Features:**
  - ✅ Database fields added to `student_applications`:
    - `is_rebooking` (BOOLEAN)
    - `previous_application_id` (UUID)
    - `rebooking_reason` (TEXT)
    - `rebooking_approved_at` (TIMESTAMPTZ)
    - `rebooking_approved_by` (UUID)
  - ✅ Database functions:
    - `can_student_rebook(p_user_id, p_contract_id)` - Checks eligibility
    - `get_rebooking_data(p_previous_application_id)` - Fetches previous application data
  - ✅ Frontend integration:
    - **Contract Detail Page**: Shows rebooking alert and "Rebook for This Contract" button when eligible
    - **Application Wizard**: Automatically pre-fills all form steps (1-5) with data from previous application
    - **Student Dashboard**: Displays rebooking opportunities section with available contracts
  - ✅ React hooks (`src/hooks/useRebooking.ts`):
    - `useCanRebook(contractId)` - Checks rebooking eligibility
    - `useRebookingData(previousApplicationId)` - Fetches previous application data
    - `useMarkAsRebooking()` - Marks application as rebooking
  - **Workflow:**
    1. Student views contract detail page → System checks if they can rebook
    2. If eligible, shows "Rebook for This Contract" button
    3. Clicking button creates application with `is_rebooking = true` and links to previous application
    4. Application wizard automatically pre-fills all steps with previous data
    5. Student reviews and updates any changed information
  - **Files:**
    - `supabase/migrations/20251118_rebooking_system.sql` - Database schema
    - `supabase/migrations/20251118_fix_rebooking_user_id.sql` - Bug fix (uses `student_id` instead of `user_id`)
    - `src/pages/ContractDetail.tsx` - Rebooking check and UI
    - `src/pages/portal/ApplicationWizard.tsx` - Data pre-fill logic
    - `src/pages/portal/Dashboard.tsx` - Rebooking opportunities section
    - `src/hooks/useRebooking.ts` - React hooks
  - See `docs/COMPREHENSIVE_ANALYSIS_AND_IMPLEMENTATION_PLAN.md` for original analysis

### 12.3 Historical Data Management & CSV Import
- **Status:** Planned
- **Priority:** MEDIUM
- Academic year-based data organization
- CSV bulk upload for past academic years
- Complete record import (applications, payments, documents, contracts)
- Historical data viewer with academic year filtering
- See `docs/COMPREHENSIVE_ANALYSIS_AND_IMPLEMENTATION_PLAN.md` for details

### 12.4 Finance Department Enhancements
- **Status:** Planned
- **Priority:** HIGH
- Unified payment history (Stripe + manual payments)
- Weekly payment reports (exportable CSV)
- "Fully Paid Students" report
- Comprehensive owner dashboard:
  - Total revenue (current vs target)
  - Payment collection rate
  - Outstanding balances
  - Occupancy metrics
  - Student retention metrics
- See `docs/COMPREHENSIVE_ANALYSIS_AND_IMPLEMENTATION_PLAN.md` for details

### 12.5 Multi-Tenant Architecture
- **Status:** Planned (Long-term)
- **Priority:** LOW
- Organization/tenant isolation
- White-labeling capability (branding, colors, logos)
- Organization configuration system
- Support for deploying system to other student accommodations
- See `docs/COMPREHENSIVE_ANALYSIS_AND_IMPLEMENTATION_PLAN.md` for details

## 14. Data Seeding

- Run `npm run seed` (with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment) to populate the remote database.
- The seeder ingests `studios-data.csv`, creating studio records linked to their grades, and sets status/alignment automatically.
- Seeds academic year `2026/2027`, five studio grades in order Silver → Gold → Platinum → Rhodium → Rhodium Plus, grade pricing (Silver £165 PW, Gold £179 PW, Platinum £205 PW, Rhodium £231 PW, Rhodium Plus £247 PW), three payment plans (3, 4, and 10 instalments with £99 deposit), and two contracts (45-week ending 18 July 2027, 51-week ending 29 August 2027) per grade.

## 15. Recent Implementations

### 15.1 Booking Calendar Feature
- **Status:** ✅ Implemented & Deployed (2025-01-27), Enhanced (2025-01-30)
- **Overview**: Airbnb-style calendar view for viewing studio occupancy and bookings by date
- **Location**: `/admin/booking-calendar`
- **Features**:
  - **Calendar Layout**: Studios as rows, dates as columns (monthly view)
  - **Filtering**: By allocation type (Student, OTA, Keyworkers, Unallocated), studio grade, and academic year
  - **Date Navigation**: Previous/Next month buttons and "Today" button
  - **Occupied Dates**: Highlighted with student name and contract information
  - **Click to View**: Click on occupied dates to open check-in/check-out dialog (or navigate to applications page if no booking)
  - **Check-in/Check-out Management** (Added 2025-01-30):
    - Set actual check-in and check-out dates regardless of contract dates
    - Add check-in and check-out notes
    - Calendar displays effective dates (actual if set, otherwise contract dates)
    - Dialog to manage check-in/check-out for each booking
  - **Export**: CSV export with all booked studios and details
  - **Mobile Responsive**: Horizontal scrolling calendar on mobile devices with drag scrolling
- **Technical Implementation**:
  - Database view: `booking_calendar_data` - Joins studios with confirmed applications, includes contract dates
  - RPC function: `get_booking_calendar_data(p_allocation TEXT, p_studio_grade_id UUID, p_academic_year_id UUID)` - Uses `SECURITY DEFINER` to access `auth.users` for student email. Includes `actual_check_in_date`, `actual_check_out_date`, `check_in_notes`, `check_out_notes`, and calculates `effective_check_in_date` and `effective_check_out_date`
  - React hook: `useBookingCalendar` - Fetches and filters booking calendar data
  - React hook: `useCheckInCheckOut` - Mutations for updating check-in/check-out dates and notes
  - Component: `BookingCalendar.tsx` - Main calendar component with filtering, export, and check-in/check-out dialog
- **Files**:
  - `supabase/migrations/20250127_booking_calendar_view.sql` - Database view and function
  - `supabase/migrations/20251210_check_in_check_out_system.sql` - Check-in/check-out fields and function updates
  - `src/hooks/useBookingCalendar.ts` - Data fetching hook
  - `src/hooks/useCheckInCheckOut.ts` - Check-in/check-out mutations
  - `src/pages/admin/BookingCalendar.tsx` - Main component
  - `src/App.tsx` - Route configuration
  - `src/components/admin/AdminLayout.tsx` - Navigation menu
- **See**: `docs/BOOKING_CALENDAR_IMPLEMENTATION.md` for complete documentation

### 15.2 Targeted Messages Feature
- **Status:** ✅ Implemented & Deployed (2025-11-25)
- **Overview**: Separate feature from bulk messages that allows staff to send messages to specific students or students matching particular criteria
- **Location**: `/admin/targeted-messages`
- **Features**:
  - **Direct Student Selection**: Searchable multi-select dropdown to choose specific students by name/email
  - **Filter by Category**: 
    - Application Status (draft, awaiting_deposit, awaiting_signature, awaiting_verification, confirmed, cancelled, expired)
    - Studio Grade
    - Academic Year
  - **Same Email Template Workflow**: Reuses bulk messages email template system with variable replacement
  - **Message History**: Tracks all targeted messages separately from bulk messages
  - **Mobile Responsive**: Tabbed interface with mobile-friendly bottom-sheet dialogs
- **Technical Implementation**:
  - Uses same `bulk_messages` table with `message_type: "targeted"` stored in `filters` JSONB column
  - Edge function `send-bulk-message` detects `mode: "targeted"` parameter
  - When `student_ids` provided, sends directly to those students (even without applications)
  - When filters provided, queries `student_applications` based on filter criteria
  - Separated from bulk messages in UI (targeted messages don't show in bulk list and vice versa)
- **Files**:
  - `src/pages/admin/TargetedMessages.tsx` - Main component
  - `src/hooks/useTargetedMessages.ts` - Hooks for targeted messages
  - `supabase/functions/send-bulk-message/index.ts` - Updated to support both modes
  - `supabase/migrations/20250222_add_bulk_messages_filters_index.sql` - Optional GIN index for performance

### 15.3 Maintenance Requests System
- **Status:** ✅ Implemented & Deployed (2025-01-30)
- **Overview**: Complete system for students to log maintenance, cleaning, and general requests
- **Student Portal** (`/portal/maintenance`):
  - Submit requests with title, description, type (maintenance, cleaning, general, other), priority (low, normal, high, urgent)
  - Upload up to 5 images per request
  - View request history with status tracking
  - Filter by status, priority, type
  - Mobile-responsive with optimized font sizes
  - "New Request" button in mobile header
- **Admin Portal** (`/admin/maintenance`):
  - View all student requests
  - Filter by status, priority, type, academic year
  - Search functionality
  - Update request status and priority
  - Add resolution notes
  - View uploaded images (with signed URLs for private bucket)
  - Statistics dashboard (total, pending, in progress, urgent)
  - Mobile-responsive with optimized font sizes
- **Database**:
  - `maintenance_requests` table with RLS policies (students manage own, staff manage all)
  - `maintenance_request_comments` table for comments
  - `maintenance-images` storage bucket (private, students upload to own folder, staff can view all)
- **Files**:
  - `supabase/migrations/20251210_maintenance_requests_system.sql` - Database schema
  - `src/pages/portal/Maintenance.tsx` - Student portal page
  - `src/pages/admin/Maintenance.tsx` - Admin portal page
  - `src/hooks/useMaintenanceRequests.ts` - React hooks
  - `SETUP_STORAGE_POLICIES.sql` - Storage bucket policies
  - `docs/STORAGE_BUCKET_SETUP_INSTRUCTIONS.md` - Setup guide

### 15.4 Check-in/Check-out System
- **Status:** ✅ Implemented & Deployed (2025-01-30)
- **Overview**: System for tracking actual student check-in and check-out dates, independent of contract dates
- **Features**:
  - Set actual check-in and check-out dates regardless of contract dates
  - Add check-in and check-out notes
  - Calendar displays effective dates (actual if set, otherwise contract dates)
  - Dialog in booking calendar to manage check-in/check-out for each booking
  - Updates `actual_check_in_date`, `actual_check_out_date`, `check_in_notes`, `check_out_notes` fields
- **Database**:
  - Added fields to `student_applications`: `actual_check_in_date`, `actual_check_out_date`, `check_in_notes`, `check_out_notes`
  - Updated `get_booking_calendar_data` RPC function to include these fields and calculate effective dates
- **Files**:
  - `supabase/migrations/20251210_check_in_check_out_system.sql` - Database schema
  - `src/hooks/useCheckInCheckOut.ts` - React hooks
  - `src/pages/admin/BookingCalendar.tsx` - Updated with check-in/check-out dialog

### 15.5 Utility Payments/Expenses System
- **Status:** ✅ Implemented & Deployed (2025-01-30)
- **Overview**: System for tracking utility payments and operational expenses per academic year
- **Admin Portal** (`/admin/expenses`):
  - Create, edit, delete expense records
  - Expense categories: electricity, gas, water, internet, council_tax, maintenance, cleaning, insurance, salaries, marketing, other
  - Upload receipt/invoice images (images or PDFs)
  - Filter by academic year, category, date range
  - Search functionality
  - Export to CSV
  - Statistics dashboard (total expenses, total amount, categories)
  - Mobile-responsive with optimized font sizes
- **Database**:
  - `utility_payments` table with RLS policies (staff only)
  - `expense-receipts` storage bucket (private, staff only)
- **Files**:
  - `supabase/migrations/20251210_utility_payments_system.sql` - Database schema
  - `src/pages/admin/Expenses.tsx` - Admin portal page
  - `src/hooks/useUtilityPayments.ts` - React hooks
  - `SETUP_STORAGE_POLICIES.sql` - Storage bucket policies

### 15.6 Login Message Dialog
- **Status:** ✅ Implemented & Deployed (2025-01-30)
- **Overview**: Dialog shown once at login if student has unread bulk or targeted messages
- **Features**:
  - Shows dialog once per unread message
  - Displays messages one at a time with "Next Message" or "Got It!" button
  - Automatically marks messages as read when dismissed
  - Prevents duplicate dialogs (only shows once per message)
  - Tracks message reads in `student_message_reads` table
- **Database**:
  - `student_message_reads` table to track when a student has seen a message
- **Files**:
  - `supabase/migrations/20251210_login_dialog_tracking.sql` - Database schema
  - `src/components/portal/LoginMessageDialog.tsx` - Dialog component
  - `src/pages/portal/Dashboard.tsx` - Integrated dialog

### 15.7 Contract Payment Plans RLS Fix
- **Status:** ✅ Implemented & Deployed (2025-01-30)
- **Issue**: Missing GRANT statements for `contract_payment_plans` table causing 403 errors when editing contracts
- **Fix**: Added GRANT statements and ensured `is_staff()` function is properly configured with SECURITY DEFINER
- **Files**:
  - `supabase/migrations/20250130_fix_contract_payment_plans_rls.sql` - Migration fix

### 15.3 Bulk Message Filters
- **Status:** ✅ Implemented & Deployed
- Filter bulk messages by:
  - Contract ID
  - Studio Grade ID
  - Academic Year ID
- Filters applied before sending emails
- See `supabase/functions/send-bulk-message/index.ts`

### 15.4 DocuSign Signed Document Download
- **Status:** ✅ Implemented & Deployed
- Automatically fetches signed PDFs from DocuSign API
- Saves to Supabase Storage (`contracts` bucket)
- Updates envelope records with storage path
- Returns signed URLs for immediate access
- See `supabase/functions/download-signed-document/index.ts`

### 15.5 Partner Password Reset System
- **Status:** ✅ Implemented & Deployed (2025-11-20)
- **Features:**
  - **Request Password Reset Page** (`/partner/request-password-reset`):
    - Beautiful two-column layout matching login page design
    - Email input form for requesting password reset
    - Success state with confirmation message and email address
    - "Try Again" and "Back to Login" buttons
    - Skeleton loaders during initial load
    - Mobile responsive design
  - Password reset page at `/partner/reset-password` for setting new password
  - Automatic password reset email sending when admin creates partner accounts
  - Token handling for Supabase hash fragments and query parameters
  - "Forgot password" functionality on partner login page (navigates to request page instead of browser prompt)
  - Complete workflow: Request reset → Email sent → Click link → Set password → Login
- **Technical Details:**
  - Uses Supabase `resetPasswordForEmail()` API
  - Handles URL hash fragments (`#access_token=...&type=recovery`)
  - Falls back to query parameters for email client compatibility
  - Automatic session management after token validation
  - Production URL configuration via `PORTAL_URL` secret
- **Files:**
  - `src/pages/partner/RequestPasswordReset.tsx` - Request password reset page
  - `src/pages/partner/ResetPassword.tsx` - Password reset page
  - `supabase/functions/create-partner-account/index.ts` - Updated to send emails automatically
  - `src/pages/partner/Login.tsx` - Updated to navigate to request page instead of browser prompt
  - `src/App.tsx` - Added route for request password reset page

### 14.6 Partner Login Page Redesign
- **Status:** ✅ Implemented & Deployed (2025-11-20)
- **Design:**
  - Beautiful two-column layout inspired by modern partner portal designs
  - **Left Section** (Desktop only):
    - Red gradient background with geometric wave patterns
    - Logo (favicon) in white rounded square
    - Headline: "EARN MORE WITH EVERY REFERRAL"
    - Tagline: "Track sign-ups, commissions and payouts in real time."
    - Statistics display:
      - Active Partners: 10
      - Total Payouts: £23,116
      - Avg. Commission: 5%
    - Dashboard visualization with bar charts, line graphs, and progress cards
  - **Right Section:**
    - White background with login form
    - Logo (favicon) in red rounded square
    - "PARTNER PORTAL" title
    - Email and password input fields with icons
    - "Keep me signed in" checkbox
    - Sign in button with arrow icon
    - Register and password reset links
    - Security message at bottom
  - **Mobile Responsive:**
    - Left section hidden on mobile
    - Condensed header with stats shown on mobile
    - Full-width form on mobile
  - **Loading States:**
    - Skeleton loaders for all elements during initial load
    - "SC" text placeholder for favicon while loading
    - Smooth transitions when content loads
  - **Branding:**
    - Uses Big Shoulders Display font for headings (uppercase, bold/black)
    - Uses Inter Tight font for body text
    - Favicon from branding settings
    - Primary red color for accents and gradients
- **Files:**
  - `src/pages/partner/Login.tsx` - Complete redesign with two-column layout

### 14.4 Production URL Configuration
- **Status:** ✅ Implemented & Deployed (2025-11-20)
- **Configuration:**
  - Supabase Auth Site URL: Set to production domain (`https://iskabookingportal.netlify.app`)
  - Supabase Edge Function Secrets:
    - `PORTAL_URL` - Production frontend URL (used in email links)
    - `DOCUSIGN_SIGNING_RETURN_URL` - DocuSign return URL
    - `RESEND_FROM_EMAIL` - Email sender address
  - Netlify Environment Variables: Frontend environment variables configured
  - Email links now use production URLs instead of localhost
- **Files:**
  - `supabase/functions/send-bulk-message/index.ts` - Updated to use `PORTAL_URL` secret
  - `supabase/functions/docusign-recipient-view/index.ts` - Updated default return URL
  - `PRODUCTION_URL_CONFIGURATION.md` - Complete configuration guide
  - `PRODUCTION_SUPABASE_SECRETS.md` - All secrets documentation

### 14.5 Settings Page Integrations
- **Status:** ✅ Implemented & Deployed
- Real-time connection status for:
  - Stripe (payment processing)
  - DocuSign (document signing)
  - Resend (email service)
- Status badges, account information, error messages
- Refresh functionality
- See `src/pages/admin/Settings.tsx` and `supabase/functions/check-integration-status/index.ts`

### 14.6 Partner Login Page Redesign
- **Status:** ✅ Implemented & Deployed (2025-11-20)
- **Design:**
  - Beautiful two-column layout inspired by modern partner portal designs
  - **Left Section** (Desktop only):
    - Red gradient background with geometric wave patterns
    - Logo (favicon) in white rounded square
    - Headline: "EARN MORE WITH EVERY REFERRAL"
    - Tagline: "Track sign-ups, commissions and payouts in real time."
    - Statistics display:
      - Active Partners: 10
      - Total Payouts: £23,116
      - Avg. Commission: 5%
    - Dashboard visualization with bar charts, line graphs, and progress cards
  - **Right Section:**
    - White background with login form
    - Logo (favicon) in red rounded square
    - "PARTNER PORTAL" title
    - Email and password input fields with icons
    - "Keep me signed in" checkbox
    - Sign in button with arrow icon
    - Register and password reset links
    - Security message at bottom
  - **Mobile Responsive:**
    - Left section hidden on mobile
    - Condensed header with stats shown on mobile
    - Full-width form on mobile
  - **Loading States:**
    - Skeleton loaders for all elements during initial load
    - "SC" text placeholder for favicon while loading
    - Smooth transitions when content loads
  - **Branding:**
    - Uses Big Shoulders Display font for headings (uppercase, bold/black)
    - Uses Inter Tight font for body text
    - Favicon from branding settings
    - Primary red color for accents and gradients
- **Files:**
  - `src/pages/partner/Login.tsx` - Complete redesign with two-column layout