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
- `studios` – existing dataset extended with `status`, `allocation`, `is_active`.
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
- `cashback_campaigns` – cashback campaign definitions (amount, applies_to, dates, max_uses).
- `application_cashbacks` – applied cashbacks to student applications.
- `student_applications` – booking pipeline state machine.
- `student_application_steps` – JSON payload per form step.
- `student_documents` – uploads metadata & verification status.
- `student_signatures` – signature audit trail (student/guarantor).
- `staff_activity_logs` – immutable audit log.
- `notifications` – in-app notifications with email template support, starring, read/unread status.
- `email_templates` – HTML email templates with dynamic variable replacement.
- `bulk_messages` – bulk message tracking and history.
- `refunds` – refund processing and audit trail.
- `financial_forecasts` – revenue forecasting calculations.

### 3.2 Storage Buckets

- `studio-media/{studio_grade_slug}/{uuid}` – public via signed URLs.
- `documents/{student_id}/{application_id}/{type}/{uuid}` – private.
- `contracts/{application_id}/signed-{timestamp}.pdf` – private.

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
- Selected studio reserved (set `status = 'reserved'`, `reservation_expires_at`). Scheduled job releases expired reservations.

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
- Adobe Sign integration recommended for compliant e-signatures; embed signing ceremony. Webhook updates stored in `student_signatures` and uploads signed PDF to storage.

### 4.6 Payments

- Deposit: Stripe Payment Intent created via edge function, success transitions application to signature step.
- Instalments: Option A – Stripe Billing (invoices scheduled per `payment_plan_installments`). Option B – manual triggers with Payment Intents; record status in `contract_payment_schedule`.

### 4.7 Confirmation & Allocation

- Upon deposit + signature + verification, application status → `confirmed`; studio `status = 'occupied'`. Notification dispatched.

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
  - Contracts (link to academic year/grade, associate multiple payment plans, weekly rent, deposit, date range).
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
  - Occupancy reports
  - Revenue reports
  - All exportable to CSV
- **Communication**: 
  - **Bulk Messaging**: Template-first workflow, email preview, per-student variable replacement, notification and email sending
  - **Email Templates**: Beautiful, type-specific templates (welcome, application_received, deposit_reminder, payment_reminder, overdue_payment, application_confirmed, document_approved, document_rejected, signature_reminder, custom), dynamic variable system, template preview, default template loading
  - Notification management
- **Studio Management**: 
  - Studio roster with color-coded status badges
  - Allocation filter (All allocations, Student, Staff, Unallocated)
  - Status-based filtering
  - Studio import functionality
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
  - Create cashback campaigns (amount, applies_to: all/new/rebooking, dates, max_uses)
  - Apply cashbacks to applications
  - Track campaign usage
- **Payment History**:
  - Unified view of Stripe and manual payments
  - Payment summaries per application
  - Export functionality

### 6.3 Partner Portal ✅ IMPLEMENTED

- **Authentication**:
  - Separate partner login page (`/partner/login`) with "Forgot password" functionality
  - Partner registration with referral code validation (`/partner/register`)
  - Password reset page (`/partner/reset-password`) for setting initial password or resetting forgotten password
  - Real-time referral code validation during registration
  - Auto-linking of accounts to partner records via referral code
  - Admin can create partner accounts directly (automatically sends password reset email)
  - **Password Reset Workflow**:
    1. Admin creates partner account via admin UI
    2. System automatically sends password reset email using `resetPasswordForEmail()`
    3. Partner clicks link in email → redirected to `/partner/reset-password` with token
    4. Partner sets new password (validates token, creates session, updates password)
    5. Partner can then log in with their password
    6. "Forgot password" on login page allows existing partners to request new reset email
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
  - `send-bulk-message` – Bulk notification and email sending with template variable replacement, enhanced error handling with HTML response detection and detailed logging
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
- **Stripe** – capture payment method, deposit, instalment payments, webhook for payment updates, refund processing.
- **DocuSign** – agreement creation, embedded signing, status polling, signed document retrieval, envelope management.
- **Email Service (Resend)** – transactional notifications, bulk messaging, template-based emails with variable replacement. Configured with dedicated sending domain `send.portal.urbanhub.uk` for high deliverability. Enhanced error handling with HTML response detection, detailed logging, and API key validation. See `docs/SYSTEM_IMPROVEMENTS_AND_CONFIG.md` for complete setup instructions.

## 8. UI/UX Principles

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
  - Bulk message statuses (pending, sending, completed, failed)
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
- **In-Person Payments**: Support for recording in-person payments
- **Payment History**: Integrated with payment schedules
- **Manual Payment Dialog**: Easy-to-use interface for staff

### 9.7 Mobile Responsiveness
- **Mobile Menus**: Collapsible navigation for both portals
- **Responsive Layouts**: Tables on desktop, cards on mobile
- **Touch-Friendly**: Optimized button sizes and spacing
- **Mobile Forms**: Bottom-sheet dialogs, zero bottom margin

### 9.8 Additional Features
- **Skeleton Loaders**: Component-specific loaders on all pages
- **Color-Coded Badges**: Status indicators throughout the system
- **Studio Roster Filters**: Allocation and status filtering
- **Sign-Out Confirmation**: Confirmation dialogs for security
- **Auto-Allocation**: Automatic studio allocation on confirmation
- **Reservation Expiry**: Automatic release of expired reservations

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
  - Create cashback campaigns (amount, applies_to: all/new/rebooking, dates, max_uses)
  - Admin can apply cashbacks to applications
  - Campaign usage tracking
- **Application Integration**:
  - Cashback deducted from total booking amount (not given as money)
  - Adjusted payment schedules (final installment reduced by cashback)
  - Student portal displays cashback information
  - Payment summary accounts for cashback
- **Auto-Application**: Eligible cashbacks automatically applied when application is confirmed

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

### 12.1 Studio Availability Tracking & Dynamic Tags
- **Status:** Planned
- **Priority:** HIGH
- Real-time availability calculation per studio grade
- Dynamic availability tags on catalog:
  - "Going Fast" when < 20% available
  - "X Left" when low availability (e.g., "2 Left", "1 Left")
  - "Fully Booked" when 0 available
- "Book Now" button changes to "Fully Booked" when no availability
- See `docs/COMPREHENSIVE_ANALYSIS_AND_IMPLEMENTATION_PLAN.md` for details

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

### 14.1 Bulk Message Filters
- **Status:** ✅ Implemented & Deployed
- Filter bulk messages by:
  - Contract ID
  - Studio Grade ID
  - Academic Year ID
- Filters applied before sending emails
- See `supabase/functions/send-bulk-message/index.ts`

### 14.2 DocuSign Signed Document Download
- **Status:** ✅ Implemented & Deployed
- Automatically fetches signed PDFs from DocuSign API
- Saves to Supabase Storage (`contracts` bucket)
- Updates envelope records with storage path
- Returns signed URLs for immediate access
- See `supabase/functions/download-signed-document/index.ts`

### 14.3 Partner Password Reset System
- **Status:** ✅ Implemented & Deployed (2025-11-20)
- **Features:**
  - Password reset page at `/partner/reset-password`
  - Automatic password reset email sending when admin creates partner accounts
  - Token handling for Supabase hash fragments and query parameters
  - "Forgot password" functionality on partner login page
  - Complete workflow: Account creation → Email sent → Password set → Login
- **Technical Details:**
  - Uses Supabase `resetPasswordForEmail()` API
  - Handles URL hash fragments (`#access_token=...&type=recovery`)
  - Falls back to query parameters for email client compatibility
  - Automatic session management after token validation
  - Production URL configuration via `PORTAL_URL` secret
- **Files:**
  - `src/pages/partner/ResetPassword.tsx` - Password reset page
  - `supabase/functions/create-partner-account/index.ts` - Updated to send emails automatically
  - `src/pages/partner/Login.tsx` - Added "Forgot password" link
  - `src/App.tsx` - Added route for reset password page

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