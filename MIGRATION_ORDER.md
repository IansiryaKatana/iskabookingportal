# Migration Order - IMPORTANT

## ✅ Migration 1: Studio Availability Tracking
**File:** `20251118_studio_availability_tracking.sql`  
**Status:** ✅ Already run successfully

## ⚠️ Migration 2: Create Stripe Payments Table (NEW - RUN THIS FIRST!)
**File:** `20251118_create_stripe_payments_table.sql`  
**Status:** ⚠️ **MUST RUN BEFORE Migration 3**

**Why:** The unified payment history view requires the `stripe_payments` table to exist.

**What it does:**
- Creates `stripe_payments` table
- Migrates existing deposit payment intents from `student_applications` table
- Sets up RLS policies
- Creates indexes

## Migration 3: Unified Payment History
**File:** `20251118_unified_payment_history.sql`  
**Status:** ⏳ Waiting for Migration 2

**Dependencies:** Requires `stripe_payments` table (from Migration 2)

## Migration 4: Rebooking System
**File:** `20251118_rebooking_system.sql`  
**Status:** ⏳ Pending

## Migration 5: Fully Paid Students Report
**File:** `20251118_fully_paid_students_report.sql`  
**Status:** ⏳ Pending

---

## Correct Order:

1. ✅ `20251118_studio_availability_tracking.sql` (DONE)
2. ⚠️ **`20251118_create_stripe_payments_table.sql`** (RUN THIS NEXT!)
3. `20251118_unified_payment_history.sql`
4. `20251118_rebooking_system.sql`
5. `20251118_fully_paid_students_report.sql`

---

**Note:** The `stripe_payments` table migration will automatically migrate existing deposit payment intents from your `student_applications` table, so you won't lose any existing payment data.

