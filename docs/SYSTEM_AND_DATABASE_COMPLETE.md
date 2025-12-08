# STUCOMMS Booking Portal - Complete System & Database Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Database Schema](#database-schema)
4. [Database Setup](#database-setup)
5. [System Architecture](#system-architecture)
6. [Key Features](#key-features)
7. [Integration Points](#integration-points)
8. [Deployment Guide](#deployment-guide)

---

## System Overview

The STUCOMMS Booking Portal is a comprehensive student accommodation booking and management system built as a SaaS platform. It enables student accommodation providers to manage their entire booking lifecycle from studio discovery to contract signing, payment processing, and ongoing student management.

### Core Personas

- **Student**: Discovers studio grades, logs in, selects a studio, completes application journey, signs contract, pays deposit/instalments, manages documents
- **Staff**: Manages academic years, studio content, amenities, contracts, payment plans, reviews applications/documents, allocates studios
- **Partner**: Tracks referred students, views payment status, monitors commission earnings, manages referral codes
- **Superadmin**: Full system control, including role management and audit oversight

---

## Technology Stack

### Frontend
- **Framework**: React 18.3.1 with TypeScript
- **Build Tool**: Vite 5.4.19
- **UI Library**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS 3.4.17
- **State Management**: TanStack Query (React Query) 5.83.0
- **Routing**: React Router DOM 6.30.1
- **Forms**: React Hook Form 7.61.1 with Zod validation
- **Icons**: Lucide React 0.462.0

### Backend & Database
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage
- **Edge Functions**: Supabase Edge Functions (Deno runtime)

### Integrations
- **Payments**: Stripe (react-stripe-js 5.3.0)
- **E-Signatures**: DocuSign (via Edge Functions)
- **Error Tracking**: Sentry 10.26.0
- **PDF Generation**: jsPDF 3.0.3 with jsPDF-AutoTable

### Development Tools
- **Testing**: Vitest 4.0.12
- **Linting**: ESLint 9.32.0
- **Type Checking**: TypeScript 5.8.3

---

## Database Schema

### Core Tables

#### 1. User Management

**`profiles`**
- Extends Supabase `auth.users` with role-based access
- Fields: `id` (UUID, FK to auth.users), `role` (student|staff|partner|superadmin), `first_name`, `last_name`, `phone`, `avatar_url`
- RLS: Users can read/update own profile; staff can manage all

**`staff_activity_logs`**
- Immutable audit trail for staff actions
- Fields: `staff_id`, `action`, `entity_type`, `entity_id`, `payload` (JSONB), `created_at`

#### 2. Academic Structure

**`academic_years`**
- Defines academic year periods
- Fields: `id`, `name` (unique), `start_date`, `end_date`, `is_active`
- Constraint: `start_date < end_date`

**`studio_grades`**
- Studio tier/type definitions (Silver, Gold, Platinum, Rhodium, Rhodium Plus)
- Fields: `id`, `slug` (unique), `name` (unique), `short_description`, `long_description`, `max_occupancy`, `display_order`, `is_active`

**`studio_grade_media`**
- Media assets per studio grade (6 images + optional video)
- Fields: `id`, `studio_grade_id`, `media_type` (image|video), `title`, `description`, `url`, `position` (0-5 for images)
- Unique constraint: `(studio_grade_id, media_type, position)`

**`studios`**
- Individual studio units (uploaded once, reusable across academic years)
- Fields: `id`, `studio_number` (unique), `studio_grade_id`, `floor`, `status` (available|reserved|occupied|maintenance), `allocation` (NULL|'Student'|'OTA'|'Keyworkers'|UUID), `is_active`, `reservation_expires_at`
- Allocation: NULL = Unallocated, UUID = temporary student reservation (30-min hold)

**`studio_grade_amenities`** (Junction Table)
- Links studio grades to amenities
- Fields: `id`, `studio_grade_id`, `amenity_id`, `description_override`
- Unique constraint: `(studio_grade_id, amenity_id)`

**`amenities`**
- Amenity catalog
- Fields: `id`, `name` (unique), `description`, `icon_url`

#### 3. Pricing & Payment Plans

**`studio_grade_prices`**
- Pricing per academic year + grade
- Fields: `id`, `academic_year_id`, `studio_grade_id`, `weekly_price`, `deposit_amount_override`, `currency_code` (default: GBP), `is_active`
- Unique constraint: `(academic_year_id, studio_grade_id)`

**`payment_plans`**
- Payment plan definitions per academic year
- Fields: `id`, `academic_year_id`, `name`, `description`, `deposit_amount`, `is_active`

**`payment_plan_installments`**
- Ordered schedule items with offsets/percentages
- Fields: `id`, `payment_plan_id`, `sequence`, `label`, `due_date_offset_days` OR `due_date`, `amount_type` (percentage|fixed), `amount_value`
- Constraints: Percentage must be 0-100; either offset or date required

**`contracts`**
- Contract templates per academic year + grade
- Fields: `id`, `academic_year_id`, `studio_grade_id`, `payment_plan_id`, `slug` (unique), `name`, `summary`, `contract_start`, `contract_end`, `weeks`, `weekly_price_override`, `deposit_override`, `cta_label`, `display_order`, `is_active`
- Constraint: `contract_start < contract_end`

**`contract_payment_schedule`**
- Resolved due dates/amounts for generated contracts
- Fields: `id`, `contract_id`, `label`, `sequence`, `due_date`, `amount`
- Unique constraint: `(contract_id, sequence)`

#### 4. Student Applications

**`student_applications`**
- Main application record with status machine
- Fields: `id`, `student_id` (FK to auth.users), `studio_grade_id`, `contract_id`, `assigned_studio_id` (nullable), `status` (draft|awaiting_deposit|awaiting_signature|awaiting_verification|confirmed|cancelled|expired), `stripe_customer_id`, `deposit_payment_intent_id`, `reserved_studio_expires_at`, `submitted_at`, `cancelled_at`, `is_rebooking`, `previous_application_id`

**`student_application_steps`**
- Form step data (JSONB payloads)
- Fields: `id`, `application_id`, `step_number` (1-6), `payload` (JSONB), `is_complete`
- Unique constraint: `(application_id, step_number)`

**`student_documents`**
- Document uploads metadata
- Fields: `id`, `application_id`, `document_type` (passport|visa|utility_bill|id_document|bank_statement), `storage_path`, `original_filename`, `mime_type`, `status` (pending|approved|rejected), `uploaded_by`, `uploaded_at`, `verified_by`, `verified_at`, `notes`
- Storage path: `documents/{student_id}/{application_id}/{type}/{uuid}`

**`student_signatures`**
- Signature audit trail (student/guarantor/staff)
- Fields: `id`, `application_id`, `signature_type` (student|guarantor|staff), `storage_path`, `signature_external_id`, `metadata` (JSONB), `signed_at`

#### 5. Payments

**`stripe_payments`**
- Individual Stripe payment transactions
- Fields: `id`, `student_application_id`, `payment_plan_id`, `stripe_payment_intent_id` (unique), `amount`, `currency` (default: GBP), `status` (pending|processing|succeeded|failed|canceled|completed), `payment_type` (deposit|instalment), `metadata` (JSONB)

**`manual_payments`**
- Manual payment records (cash, bank transfer, etc.)
- Fields: `id`, `student_application_id`, `amount`, `currency`, `payment_method`, `reference_number`, `notes`, `recorded_by`, `recorded_at`

**`refunds`**
- Refund processing and audit trail
- Fields: `id`, `student_application_id`, `stripe_payment_id`, `amount`, `currency`, `reason`, `status` (pending|approved|processed|rejected), `processed_by`, `processed_at`, `stripe_refund_id`

#### 6. Partner & Referral System

**`partners`**
- Partner referral organizations
- Fields: `id`, `name`, `contact_name`, `contact_email`, `contact_phone`, `commission_percentage` (default: 5.00), `is_active`, `notes`

**`partner_referrals`**
- Tracks which applications are referred by partners
- Fields: `id`, `partner_id`, `application_id` (unique), `referral_code`, `commission_percentage` (snapshot), `total_contract_value` (snapshot), `commission_amount` (calculated), `commission_status` (pending|approved|paid|cancelled), `paid_at`, `paid_by`, `notes`

**`partner_referral_codes`**
- Referral code management
- Fields: `id`, `partner_id`, `code` (unique), `is_active`, `expires_at`, `max_uses`, `current_uses`

#### 7. Cashback System

**`cashback_campaigns`**
- Cashback campaign definitions
- Fields: `id`, `name`, `description`, `amount`, `applies_to` (all|specific_grades|specific_contracts), `academic_year_id`, `start_date`, `end_date`, `max_uses`, `current_uses`, `is_active`

**`application_cashbacks`**
- Applied cashbacks to student applications
- Fields: `id`, `application_id`, `campaign_id`, `amount`, `applied_at`

#### 8. Rebooking System

**`rebookings`**
- Tracks rebooking requests
- Fields: `id`, `student_id`, `previous_application_id`, `new_application_id`, `status` (pending|approved|rejected), `requested_at`, `processed_at`, `processed_by`

#### 9. DocuSign Integration

**`docusign_envelopes`**
- DocuSign envelope tracking
- Fields: `id`, `application_id`, `envelope_id` (unique), `template_type` (tenancy|guarantor), `status`, `created_at`, `completed_at`, `metadata` (JSONB)

**`docusign_templates`**
- DocuSign template configuration per academic year
- Fields: `id`, `academic_year_id`, `template_type` (tenancy|guarantor), `template_id`, `is_active`

#### 10. Notifications & Messaging

**`notifications`**
- In-app notifications
- Fields: `id`, `user_id`, `title`, `message`, `type` (info|success|warning|error), `is_read`, `read_at`, `link`, `is_starred`, `created_at`

**`email_templates`**
- HTML email templates with dynamic variable replacement
- Fields: `id`, `name` (unique), `subject`, `body_html`, `body_text`, `template_type` (welcome|application_received|deposit_reminder|payment_reminder|overdue_payment|application_confirmed|document_approved|document_rejected|signature_reminder|custom|email_confirmation), `variables` (JSONB), `is_active`, `created_by`

**`bulk_messages`**
- Bulk and targeted message tracking
- Fields: `id`, `title`, `message`, `notification_type`, `email_template_id`, `sent_by`, `filters` (JSONB - includes `message_type`: 'bulk'|'targeted'), `total_recipients`, `notifications_sent`, `emails_sent`, `status` (pending|sending|completed|failed), `created_at`, `completed_at`

#### 11. Financial Management

**`financial_forecasts`**
- Revenue forecasting scenarios
- Fields: `id`, `name`, `academic_year_id`, `target_revenue`, `current_revenue`, `revenue_gap`, `forecast_date`, `created_by`

**`financial_forecast_breakdowns`**
- Forecast breakdown per contract type
- Fields: `id`, `forecast_id`, `contract_id`, `studio_grade_id`, `contract_name`, `studio_grade_name`, `contract_weeks`, `weekly_price`, `total_contract_value`, `current_bookings`, `students_needed`, `new_bookings_needed`, `revenue_contribution`

#### 12. Branding & Content

**`branding_settings`**
- Branding assets paths, text content, colors, and fonts
- Fields: `id`, `setting_key` (unique), `setting_value`, `setting_type` (text|url|file_path), `description`
- Keys include: logo_path, favicon_path, footer_description, contact info, 17 color settings, 4 font settings

**`navigation_items`**
- Navigation items for header and footer
- Fields: `id`, `title`, `url`, `display_order`, `is_active`, `location` (header|footer), `opens_in_new_tab`

**`opening_hours`**
- Structured opening hours for each day
- Fields: `id`, `day_name` (unique), `day_order` (1-7), `open_time`, `close_time`, `is_closed`, `special_note`

**`social_media_settings`**
- Social media links and settings
- Fields: `id`, `platform` (unique), `url`, `is_active`, `display_order`

#### 13. Studio Availability Tracking

**`studio_availability_tracking`**
- Historical availability snapshots
- Fields: `id`, `academic_year_id`, `studio_grade_id`, `date`, `available_count`, `reserved_count`, `occupied_count`, `total_count`

### Database Functions & Views

#### Key Functions

1. **`get_payment_summary(application_id UUID)`**
   - Returns payment summary with total due, total paid, remaining balance, payment status

2. **`get_unified_payment_history(application_id UUID)`**
   - Unified view of Stripe payments, manual payments, cashbacks, refunds

3. **`get_fully_paid_students(academic_year_id UUID)`**
   - Returns list of students who have fully paid their contracts

4. **`get_studio_availability(academic_year_id UUID, studio_grade_id UUID)`**
   - Calculates available studios per grade for academic year

5. **`get_partner_referral(application_id UUID)`**
   - Returns partner referral information for an application

6. **`get_admin_dashboard_stats(academic_year_id UUID)`**
   - Returns dashboard statistics for admin portal

7. **`auto_allocate_studio()`**
   - Trigger function that auto-allocates studios when application is confirmed

#### Key Views

1. **`studio_status_by_academic_year`**
   - Studio status aggregated by academic year

2. **`studio_availability_by_academic_year`**
   - Availability counts per grade per academic year

### Row Level Security (RLS)

All tables have RLS enabled with policies for:
- **Public Read**: Academic years, studio grades, media, amenities, contracts, payment plans (for public browsing)
- **Student Access**: Own applications, documents, signatures, payments, notifications
- **Staff Access**: Full CRUD on all tables (except superadmin-only tables)
- **Partner Access**: Own referrals, commissions, profile

### Storage Buckets

1. **`studio-media`** (public read)
   - Studio grade images and videos

2. **`documents`** (private)
   - Student documents (passport, visa, etc.)
   - Path: `documents/{student_id}/{application_id}/{type}/{uuid}`

3. **`contracts`** (private)
   - Generated contract PDFs

4. **`branding`** (public read)
   - Logo, favicon, branding assets

---

## Database Setup

### Prerequisites

1. **Supabase Account**: Create account at https://supabase.com
2. **Supabase CLI**: Install via npm or standalone binary
3. **Node.js**: Version 18+ recommended

### Initial Setup

1. **Install Dependencies**
```bash
npm install
```

2. **Configure Environment Variables**
Create `.env.local` file:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

3. **Link to Supabase Project**
```bash
npx supabase link --project-ref your-project-ref
```

4. **Run Migrations**
```bash
npx supabase db push
```

This will apply all migrations in `supabase/migrations/` in chronological order.

5. **Seed Initial Data** (Optional)
```bash
npm run seed
```

This will create:
- Academic year (2026/2027)
- Studio grades (Silver, Gold, Platinum, Rhodium, Rhodium Plus)
- Payment plans (3, 4, 10 instalments)
- Contracts for each grade
- Studios from `studios-data.csv`

### Migration Order

Migrations are applied in chronological order based on filename:
- `20250209_dynamic_portal_schema.sql` - Foundation schema
- `20250312_*.sql` - Student portal RLS and studio policies
- `20250317_financial_forecasts.sql` - Financial forecasting
- `20250319_notifications_email_templates.sql` - Notifications system
- `20251118_*.sql` - Payment system, partner referrals, cashback, rebooking
- `20250210_branding_system.sql` - Branding and navigation
- And many more...

### Database Maintenance

1. **Backup Database**
```bash
npx supabase db dump -f backup.sql
```

2. **Reset Database** (Development only)
```bash
npx supabase db reset
```

3. **Generate TypeScript Types**
```bash
npx supabase gen types typescript --local > src/integrations/supabase/types.generated.ts
```

---

## System Architecture

### Frontend Architecture

```
src/
├── pages/              # Route components
│   ├── Index.tsx       # Landing page
│   ├── admin/          # Admin portal pages
│   ├── portal/         # Student portal pages
│   └── partner/        # Partner portal pages
├── components/         # Reusable UI components
│   ├── ui/             # shadcn/ui primitives
│   ├── admin/          # Admin-specific components
│   ├── portal/         # Student portal components
│   └── partner/        # Partner portal components
├── hooks/              # Custom React hooks
├── contexts/           # React contexts (Auth, etc.)
├── integrations/       # External service clients
│   └── supabase/       # Supabase client & types
├── lib/                # Utility functions
└── utils/              # Helper utilities
```

### Backend Architecture

```
supabase/
├── migrations/         # Database migrations (SQL)
├── functions/          # Edge Functions (Deno/TypeScript)
│   ├── docusign-envelopes/
│   ├── send-bulk-message/
│   ├── calculate-forecast/
│   └── ...
└── config.toml         # Supabase configuration
```

### Data Flow

1. **Student Application Flow**
   - Student browses public pages → Selects contract → Creates application
   - Completes 6-step wizard → Reserves studio (30-min hold)
   - Pays deposit via Stripe → Signs contract via DocuSign
   - Uploads documents → Staff verifies → Application confirmed

2. **Payment Flow**
   - Deposit: Stripe Payment Intent → `stripe_payments` record
   - Installments: Scheduled via `contract_payment_schedule` → Stripe payments
   - Manual payments: Staff records in `manual_payments`
   - Unified view: `get_unified_payment_history()` combines all payment types

3. **Partner Referral Flow**
   - Partner creates referral code → Student uses code during application
   - System auto-applies referral → Creates `partner_referrals` record
   - Commission calculated on confirmation → Staff approves/pays commission

---

## Key Features

### Student Portal
- Studio discovery and browsing
- Application wizard (6 steps)
- Studio selection with 30-minute reservation
- Stripe payment integration
- DocuSign contract signing
- Document upload and management
- Payment history and schedule
- Contract management
- Notifications

### Admin Portal
- Academic year management
- Studio grade and media management
- Studio inventory management
- Contract and payment plan configuration
- Application review and approval
- Document verification
- Studio allocation (manual and auto)
- Payment management (Stripe + manual)
- Financial forecasting
- Reports and analytics
- Bulk messaging system
- Email template management
- Partner and commission management
- Cashback campaign management
- Refund processing
- Audit logs
- User management
- Branding customization

### Partner Portal
- Referral code management
- Referred students tracking
- Commission tracking
- Payment status monitoring
- Profile management

### Public Features
- Studio catalog browsing
- Studio grade detail pages
- Contract detail pages
- Amenity showcase
- Contact information
- Responsive design

---

## Integration Points

### Stripe Integration
- **Payment Intents**: Created for deposits and installments
- **Webhooks**: Handle payment status updates
- **Customer Management**: Stripe customer IDs stored in `student_applications`
- **Payment Records**: All payments tracked in `stripe_payments` table

### DocuSign Integration
- **Templates**: Configured per academic year in `docusign_templates`
- **Envelopes**: Created via Edge Function, tracked in `docusign_envelopes`
- **Embedded Signing**: Students sign contracts within portal
- **Status Tracking**: Envelope status synced to database

### Email System
- **Templates**: Managed in `email_templates` table
- **Variable Replacement**: Dynamic variables in templates
- **Transactional Emails**: Sent via Edge Function
- **Bulk Emails**: Sent via bulk messaging system

### Storage Integration
- **File Uploads**: Via Supabase Storage
- **Public Assets**: Studio media, branding assets
- **Private Documents**: Student documents with RLS
- **Path Structure**: Organized by student/application/type

---

## Deployment Guide

### Environment Variables

**Frontend (.env.production)**
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
```

**Supabase Edge Functions**
Set via Supabase Dashboard or CLI:
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set DOCUSIGN_CLIENT_ID=...
# ... other secrets
```

### Build & Deploy

1. **Build Frontend**
```bash
npm run build
```

2. **Deploy Frontend**
Deploy `dist/` folder to:
- Netlify (configured via `netlify.toml`)
- Vercel
- Any static hosting provider

3. **Deploy Database Migrations**
```bash
npx supabase db push
```

4. **Deploy Edge Functions**
```bash
npx supabase functions deploy function-name
```

### Post-Deployment Checklist

- [ ] Verify all migrations applied
- [ ] Configure RLS policies
- [ ] Set up storage bucket policies
- [ ] Configure Stripe webhooks
- [ ] Configure DocuSign redirect URIs
- [ ] Set up cron jobs (if any)
- [ ] Test authentication flows
- [ ] Test payment flows
- [ ] Test document uploads
- [ ] Configure email sending
- [ ] Set up error tracking (Sentry)

---

## Database Indexes

Key indexes for performance:

- `student_applications`: `(student_id)`, `(contract_id)`, `(status)`
- `stripe_payments`: `(student_application_id)`, `(stripe_payment_intent_id)`, `(status)`
- `notifications`: `(user_id)`, `(is_read)`, `(created_at DESC)`
- `bulk_messages`: `(status)`, `(created_at DESC)`
- `studio_grade_prices`: `(academic_year_id, studio_grade_id)` (unique)
- `contracts`: `(studio_grade_id)`, `(academic_year_id)`

---

## Security Considerations

1. **Row Level Security (RLS)**: All tables have RLS enabled
2. **Authentication**: Supabase Auth with JWT tokens
3. **API Security**: Edge Functions verify JWT tokens
4. **Storage Security**: Private buckets with RLS policies
5. **Payment Security**: Stripe handles PCI compliance
6. **Document Security**: Private storage with student-only access
7. **Audit Logging**: All staff actions logged in `staff_activity_logs`

---

## Support & Maintenance

### Common Tasks

1. **Add New Academic Year**
   - Create record in `academic_years`
   - Create `studio_grade_prices` for each grade
   - Create `payment_plans` and installments
   - Create `contracts` for each grade/plan combination

2. **Add New Studio Grade**
   - Create record in `studio_grades`
   - Upload media to `studio_grade_media`
   - Link amenities via `studio_grade_amenities`
   - Create pricing for each academic year

3. **Process Refund**
   - Create record in `refunds` table
   - Process via Stripe API (if Stripe payment)
   - Update payment status

4. **Bulk Import Data**
   - Use bulk import functions in `supabase/functions/`
   - Or use `scripts/seed-data.mjs` as template

---

## Version History

- **v1.0.0** (Current): Complete system with all core features
  - Student application system
  - Payment processing (Stripe + manual)
  - DocuSign integration
  - Partner referral system
  - Cashback campaigns
  - Financial forecasting
  - Bulk messaging
  - Admin portal
  - Partner portal

---

## License

Proprietary - All rights reserved

---

**Last Updated**: January 2025
**Database Version**: 104 migrations applied
**System Status**: Production Ready

