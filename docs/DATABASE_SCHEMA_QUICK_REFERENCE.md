# Database Schema Quick Reference

## Table Relationships Diagram

```
auth.users
    ↓
profiles (extends auth.users)
    ↓
student_applications
    ├──→ studio_grades
    ├──→ contracts
    │       ├──→ academic_years
    │       ├──→ studio_grades
    │       └──→ payment_plans
    │               └──→ payment_plan_installments
    ├──→ studios
    │       └──→ studio_grades
    ├──→ student_application_steps
    ├──→ student_documents
    ├──→ student_signatures
    ├──→ stripe_payments
    ├──→ manual_payments
    ├──→ refunds
    ├──→ partner_referrals
    │       └──→ partners
    ├──→ application_cashbacks
    │       └──→ cashback_campaigns
    │               └──→ academic_years
    └──→ docusign_envelopes
            └──→ docusign_templates
                    └──→ academic_years

studio_grades
    ├──→ studio_grade_media
    ├──→ studio_grade_amenities
    │       └──→ amenities
    ├──→ studio_grade_prices
    │       └──→ academic_years
    └──→ studios

notifications
    └──→ auth.users

bulk_messages
    └──→ email_templates
```

## Core Tables Summary

| Table | Primary Purpose | Key Fields |
|-------|----------------|------------|
| `profiles` | User roles & profile data | `id`, `role`, `first_name`, `last_name` |
| `academic_years` | Academic year definitions | `id`, `name`, `start_date`, `end_date`, `is_active` |
| `studio_grades` | Studio tier definitions | `id`, `slug`, `name`, `max_occupancy` |
| `studios` | Individual studio units | `id`, `studio_number`, `studio_grade_id`, `status`, `allocation` |
| `contracts` | Contract templates | `id`, `slug`, `academic_year_id`, `studio_grade_id`, `weeks` |
| `payment_plans` | Payment plan definitions | `id`, `academic_year_id`, `name`, `deposit_amount` |
| `payment_plan_installments` | Installment schedule | `id`, `payment_plan_id`, `sequence`, `amount_type`, `amount_value` |
| `student_applications` | Main application record | `id`, `student_id`, `contract_id`, `status`, `assigned_studio_id` |
| `stripe_payments` | Stripe payment records | `id`, `student_application_id`, `stripe_payment_intent_id`, `amount`, `status` |
| `partner_referrals` | Partner referral tracking | `id`, `partner_id`, `application_id`, `commission_amount` |
| `cashback_campaigns` | Cashback campaign definitions | `id`, `name`, `cashback_amount`, `applies_to`, `start_date`, `end_date`, `academic_year_id`, `max_uses`, `current_uses`, `is_active` |
| `application_cashbacks` | Applied cashbacks to applications | `id`, `application_id`, `campaign_id`, `cashback_amount` |

## Status Enums

### Application Status
- `draft` - Application in progress
- `awaiting_deposit` - Waiting for deposit payment
- `awaiting_signature` - Waiting for contract signature
- `awaiting_verification` - Waiting for document verification
- `confirmed` - Application confirmed
- `cancelled` - Application cancelled
- `expired` - Application expired

### Studio Status
- `available` - Available for booking
- `reserved` - Reserved (temporary hold)
- `occupied` - Occupied by student
- `maintenance` - Under maintenance

### Payment Status (Stripe)
- `pending` - Payment pending
- `processing` - Payment processing
- `succeeded` - Payment succeeded
- `failed` - Payment failed
- `canceled` - Payment canceled
- `completed` - Payment completed

### Document Status
- `pending` - Awaiting verification
- `approved` - Document approved
- `rejected` - Document rejected

## Common Queries

### Get Student Application with Details
```sql
SELECT 
  sa.*,
  sg.name as studio_grade_name,
  c.name as contract_name,
  s.studio_number,
  p.first_name || ' ' || p.last_name as student_name
FROM student_applications sa
JOIN studio_grades sg ON sg.id = sa.studio_grade_id
JOIN contracts c ON c.id = sa.contract_id
LEFT JOIN studios s ON s.id = sa.assigned_studio_id
JOIN profiles p ON p.id = sa.student_id
WHERE sa.id = $1;
```

### Get Payment Summary
```sql
SELECT * FROM get_payment_summary($1); -- application_id
```

### Get Available Studios for Grade
```sql
SELECT * FROM get_studio_availability($1, $2); -- academic_year_id, studio_grade_id
```

### Get Student's Applications
```sql
SELECT * FROM student_applications 
WHERE student_id = $1 
ORDER BY created_at DESC;
```

### Get Payment History
```sql
SELECT * FROM get_unified_payment_history($1); -- application_id
```

## Indexes

Key indexes for performance:
- `student_applications(student_id)`
- `student_applications(contract_id)`
- `student_applications(status)`
- `stripe_payments(student_application_id)`
- `stripe_payments(stripe_payment_intent_id)` (unique)
- `notifications(user_id, is_read)`
- `studio_grade_prices(academic_year_id, studio_grade_id)` (unique)

## Storage Paths

- **Studio Media**: `studio-media/{grade_id}/{media_type}/{position}.{ext}`
- **Documents**: `documents/{student_id}/{application_id}/{type}/{uuid}.{ext}`
- **Contracts**: `contracts/{application_id}/{contract_id}.pdf`
- **Branding**: `branding/{asset_type}/{filename}`

## RLS Policy Summary

| Table | Public Read | Student Access | Staff Access |
|-------|------------|----------------|--------------|
| `academic_years` | ✅ | ✅ | ✅ Full |
| `studio_grades` | ✅ | ✅ | ✅ Full |
| `contracts` | ✅ | ✅ | ✅ Full |
| `student_applications` | ❌ | Own only | ✅ Full |
| `student_documents` | ❌ | Own only | ✅ Full |
| `stripe_payments` | ❌ | Own only | ✅ Full |
| `notifications` | ❌ | Own only | ✅ Full |
| `profiles` | ❌ | Own only | ✅ Full |

## Foreign Key Constraints

- `student_applications.student_id` → `auth.users(id)` ON DELETE CASCADE
- `student_applications.contract_id` → `contracts(id)` ON DELETE RESTRICT
- `student_applications.studio_grade_id` → `studio_grades(id)` ON DELETE RESTRICT
- `studios.studio_grade_id` → `studio_grades(id)` ON DELETE RESTRICT
- `contracts.academic_year_id` → `academic_years(id)` ON DELETE CASCADE
- `payment_plans.academic_year_id` → `academic_years(id)` ON DELETE CASCADE
- `stripe_payments.student_application_id` → `student_applications(id)` ON DELETE CASCADE

## Triggers

- `set_current_timestamp_updated_at()` - Auto-updates `updated_at` on all tables
- `handle_new_user()` - Creates profile when auth user is created
- `auto_allocate_studio()` - Auto-allocates studio when application confirmed

