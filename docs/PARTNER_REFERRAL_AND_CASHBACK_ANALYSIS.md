# Partner Referral & Cashback System - Comprehensive Analysis

## 📋 Overview

Two new features to implement:
1. **Partner Referral Commission System** - Track partner referrals, calculate 5% commission (configurable)
2. **Cashback System** - Campaign-based cashbacks (e.g., £500) deducted from total booking amount

---

## 🔍 Current System Analysis

### Current Payment & Contract Structure

**Contract Value Calculation:**
- `contracts.weeks` × `studio_grade_prices.weekly_price` (or `contracts.weekly_price_override`)
- Total = Weekly Price × Number of Weeks
- Deposit = `payment_plans.deposit_amount` or `contracts.deposit_override` or `studio_grade_prices.deposit_amount_override`

**Payment Flow:**
- Deposit paid first (Step 5 of application wizard)
- Installments paid according to `contract_payment_schedule` or `payment_plan_installments`
- Payments tracked in `stripe_payments` and `manual_payments`
- Unified view: `unified_payment_history`

**Current Tables:**
- `student_applications` - Main application record
- `contracts` - Contract details (weeks, dates, price overrides)
- `studio_grade_prices` - Weekly prices per grade/academic year
- `payment_plans` - Payment plan definitions
- `contract_payment_schedule` - Resolved payment schedule
- `stripe_payments` - Stripe payment records
- `manual_payments` - Manual payment entries

---

## 🎯 Feature 1: Partner Referral Commission System

### Requirements
- Track which applications are referred by partners
- Calculate commission: 5% of total booking value (configurable percentage)
- Commission = Total Contract Value × Commission Percentage
- Track commission status (pending, paid, etc.)
- Admin interface to manage partners and view commissions

### Database Changes Needed

#### New Table: `partners`
```sql
CREATE TABLE public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  commission_percentage NUMERIC(5,2) NOT NULL DEFAULT 5.00, -- Configurable, default 5%
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### New Table: `partner_referrals`
```sql
CREATE TABLE public.partner_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  application_id UUID NOT NULL REFERENCES public.student_applications(id) ON DELETE CASCADE,
  referral_code TEXT, -- Optional: tracking code
  commission_percentage NUMERIC(5,2) NOT NULL, -- Snapshot at time of referral
  total_contract_value NUMERIC(10,2) NOT NULL, -- Snapshot of contract value
  commission_amount NUMERIC(10,2) NOT NULL, -- Calculated: total_contract_value × commission_percentage
  commission_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'paid', 'cancelled'
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES auth.users(id), -- Staff who marked as paid
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Update: `student_applications`
```sql
ALTER TABLE public.student_applications
ADD COLUMN partner_referral_id UUID REFERENCES public.partner_referrals(id) ON DELETE SET NULL;
-- OR simpler: just add partner_id directly
ALTER TABLE public.student_applications
ADD COLUMN referred_by_partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL;
```

### Areas That Will Be Affected

#### 1. Application Creation Flow
**Files:**
- `src/pages/ContractDetail.tsx` - Add partner referral field
- `src/pages/portal/ApplicationWizard.tsx` - Add partner referral input in Step 1 or Step 5
- `src/hooks/useStudentApplication.ts` - Handle partner referral data

**Changes:**
- Add partner referral code/selection field in application wizard
- Store `referred_by_partner_id` when application is created
- Create `partner_referral` record when application is confirmed

#### 2. Commission Calculation
**Files:**
- New function: `calculate_partner_commission(application_id)`
- Trigger: Auto-calculate commission when application is confirmed

**Logic:**
```sql
-- Calculate total contract value
total_value = (contract.weeks × studio_grade_price.weekly_price)
-- OR use contract.weekly_price_override if exists

-- Calculate commission
commission = total_value × (partner.commission_percentage / 100)
```

#### 3. Admin Interface
**New Pages/Components:**
- `src/pages/admin/Partners.tsx` - CRUD for partners
- `src/pages/admin/PartnerCommissions.tsx` - View and manage commissions
- Update `src/pages/admin/ApplicationDetail.tsx` - Show partner referral info
- Update `src/components/admin/AdminLayout.tsx` - Add navigation items

**Features:**
- Create/edit/delete partners
- Set commission percentage per partner
- View all commissions (pending, paid, etc.)
- Filter by partner, status, date range
- Mark commissions as paid
- Export commission reports

#### 4. Payment Calculations
**Files:**
- `supabase/functions/create-payment/index.ts` - No changes (commission is separate)
- `src/pages/portal/Payments.tsx` - No changes (commission doesn't affect student payments)

**Note:** Commission is separate from student payments - it's a business expense, not a discount.

---

## 🎯 Feature 2: Cashback System

### Requirements
- Campaign-based cashbacks (e.g., £500)
- Can apply to new applications OR rebookers
- Cashback is deducted from total booking amount (not paid out)
- Track cashback in admin
- Show cashback in student portal
- Cashback reduces the total amount student pays

### Database Changes Needed

#### New Table: `cashback_campaigns`
```sql
CREATE TABLE public.cashback_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, -- e.g., "Summer 2025 Cashback"
  description TEXT,
  cashback_amount NUMERIC(10,2) NOT NULL, -- e.g., 500.00
  applies_to TEXT NOT NULL DEFAULT 'all', -- 'all', 'new', 'rebooking'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_uses INTEGER, -- Optional: limit number of uses
  current_uses INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### New Table: `application_cashbacks`
```sql
CREATE TABLE public.application_cashbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.student_applications(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.cashback_campaigns(id) ON DELETE RESTRICT,
  cashback_amount NUMERIC(10,2) NOT NULL, -- Snapshot of amount at time of application
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by UUID REFERENCES auth.users(id), -- Staff who applied it (or system)
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(application_id) -- One cashback per application
);
```

#### Update: `student_applications`
```sql
ALTER TABLE public.student_applications
ADD COLUMN cashback_amount NUMERIC(10,2) DEFAULT 0; -- Denormalized for quick access
-- OR calculate on-the-fly from application_cashbacks
```

### Areas That Will Be Affected

#### 1. Payment Calculations ⚠️ CRITICAL
**Files:**
- `src/pages/portal/Payments.tsx` - Show cashback discount
- `src/pages/portal/ApplicationWizard.tsx` - Show cashback in Step 5
- `supabase/functions/create-payment/index.ts` - Apply cashback to payment amounts
- `src/hooks/useUnifiedPayments.ts` - Account for cashback in totals
- `supabase/migrations/20251118_unified_payment_history.sql` - May need update

**Critical Changes:**
- **Total Due Calculation:**
  ```sql
  -- OLD:
  total_due = SUM(contract_payment_schedule.amount)
  
  -- NEW:
  total_due = SUM(contract_payment_schedule.amount) - COALESCE(cashback_amount, 0)
  ```

- **Payment Schedule Display:**
  - Show original total
  - Show cashback discount
  - Show adjusted total (original - cashback)
  - Update each installment proportionally OR reduce final installment

- **Payment Processing:**
  - When creating payment intent, reduce amount by cashback
  - Track that cashback was applied
  - Ensure student doesn't pay more than (total - cashback)

#### 2. Contract Value Display
**Files:**
- `src/pages/ContractDetail.tsx` - Show cashback if applicable
- `src/pages/admin/ApplicationDetail.tsx` - Show cashback amount
- `src/pages/portal/Dashboard.tsx` - Show cashback in application cards

**Changes:**
- Display: "Total: £5,000 (Cashback: -£500) = £4,500"
- Show cashback badge/indicator

#### 3. Application Wizard
**Files:**
- `src/pages/portal/ApplicationWizard.tsx` - Step 5 (Payment)

**Changes:**
- Check if cashback campaign is active
- Check if student qualifies (new vs rebooking)
- Auto-apply cashback if eligible
- Show cashback amount and adjusted total
- Allow staff to manually apply cashback in admin

#### 4. Admin Interface
**New Pages/Components:**
- `src/pages/admin/CashbackCampaigns.tsx` - CRUD for campaigns
- `src/pages/admin/ApplicationCashbacks.tsx` - View applied cashbacks
- Update `src/pages/admin/ApplicationDetail.tsx` - Apply/remove cashback
- Update `src/components/admin/AdminLayout.tsx` - Add navigation

**Features:**
- Create/edit/delete cashback campaigns
- Set amount, dates, eligibility (new/rebooking/all)
- View all applications with cashback
- Manually apply/remove cashback from applications
- Track campaign usage (current_uses vs max_uses)

#### 5. Reports & Analytics
**Files:**
- `src/pages/admin/PaymentHistory.tsx` - Account for cashback
- `src/pages/admin/FullyPaidStudents.tsx` - Account for cashback
- New: `src/pages/admin/CommissionReports.tsx` - Partner commission reports

**Changes:**
- Payment reports should show cashback-adjusted totals
- Commission reports should show partner earnings
- Financial reports should separate cashback from revenue

#### 6. Database Functions & Views
**New Functions:**
```sql
-- Calculate total with cashback
CREATE FUNCTION get_application_total_with_cashback(application_id UUID)
RETURNS NUMERIC AS $$
  SELECT 
    COALESCE(SUM(cps.amount), 0) - COALESCE(ac.cashback_amount, 0)
  FROM student_applications sa
  LEFT JOIN contract_payment_schedule cps ON sa.contract_id = cps.contract_id
  LEFT JOIN application_cashbacks ac ON sa.id = ac.application_id
  WHERE sa.id = application_id
  GROUP BY ac.cashback_amount;
$$;

-- Calculate partner commission
CREATE FUNCTION calculate_partner_commission(application_id UUID)
RETURNS NUMERIC AS $$
  SELECT 
    pr.total_contract_value * (pr.commission_percentage / 100)
  FROM partner_referrals pr
  WHERE pr.application_id = calculate_partner_commission.application_id;
$$;
```

**Updated Views:**
- `unified_payment_history` - May need to show cashback-adjusted amounts
- Payment summary functions - Account for cashback

---

## ⚠️ Critical Considerations

### 1. Cashback Application Logic
**Question:** How should cashback be applied to payment schedule?

**Option A: Reduce Final Installment**
- Keep all installments the same
- Reduce last installment by cashback amount
- **Pros:** Simple, predictable
- **Cons:** Large final reduction might be confusing

**Option B: Proportional Reduction**
- Reduce each installment proportionally
- **Pros:** Even distribution
- **Cons:** More complex calculation

**Option C: Reduce Deposit**
- Apply cashback to deposit first
- **Pros:** Immediate benefit
- **Cons:** Might reduce deposit below minimum

**Recommendation:** Option A (Reduce Final Installment) - Simplest and clearest

### 2. Commission Calculation Timing
**Question:** When should commission be calculated?

**Option A: On Application Confirmation**
- Calculate when status → 'confirmed'
- **Pros:** Only pay commission on confirmed bookings
- **Cons:** Partner doesn't see commission until confirmed

**Option B: On Deposit Payment**
- Calculate when deposit is paid
- **Pros:** Earlier visibility
- **Cons:** Might pay commission on cancelled bookings

**Recommendation:** Option A (On Confirmation) - Only pay for confirmed bookings

### 3. Cashback Eligibility
**Question:** How to determine if student qualifies for cashback?

**Logic:**
- Check `cashback_campaigns.applies_to`:
  - 'all' → Everyone qualifies
  - 'new' → Only if `is_rebooking = false`
  - 'rebooking' → Only if `is_rebooking = true`
- Check campaign dates: `start_date <= NOW() <= end_date`
- Check `is_active = true`
- Check `current_uses < max_uses` (if max_uses is set)

### 4. Data Integrity
**Concerns:**
- What if cashback is applied after payments are made?
- What if contract value changes after commission is calculated?
- What if cashback campaign is deleted?

**Solutions:**
- Snapshot values in `partner_referrals` and `application_cashbacks`
- Don't allow cashback changes after first payment
- Soft-delete campaigns (set `is_active = false`)

---

## 📊 Impact Summary

### Database
- **New Tables:** 4 (`partners`, `partner_referrals`, `cashback_campaigns`, `application_cashbacks`)
- **Modified Tables:** 1 (`student_applications` - add 2 columns)
- **New Functions:** 2-3 (commission calculation, cashback-adjusted totals)
- **New Views:** 0 (may update existing)

### Frontend - Student Portal
- **Modified Pages:** 3
  - `ApplicationWizard.tsx` - Show cashback, partner referral field
  - `Payments.tsx` - Show cashback discount
  - `Dashboard.tsx` - Show cashback indicator
- **New Components:** 0 (use existing UI components)

### Frontend - Admin Portal
- **New Pages:** 4
  - `Partners.tsx` - Manage partners
  - `PartnerCommissions.tsx` - View commissions
  - `CashbackCampaigns.tsx` - Manage campaigns
  - `ApplicationCashbacks.tsx` - View applied cashbacks
- **Modified Pages:** 2
  - `ApplicationDetail.tsx` - Show/apply cashback, show partner referral
  - `AdminLayout.tsx` - Add navigation items

### Backend/Edge Functions
- **Modified Functions:** 1
  - `create-payment/index.ts` - Apply cashback to payment amounts
- **New Functions:** 0 (calculations in database)

### Reports
- **Modified:** 2
  - `PaymentHistory.tsx` - Account for cashback
  - `FullyPaidStudents.tsx` - Account for cashback
- **New:** 1
  - `CommissionReports.tsx` - Partner commission reports

---

## 🚀 Implementation Plan

### Phase 1: Database Schema (Foundation)
1. Create `partners` table
2. Create `partner_referrals` table
3. Create `cashback_campaigns` table
4. Create `application_cashbacks` table
5. Add columns to `student_applications`
6. Create database functions for calculations
7. Add RLS policies

### Phase 2: Cashback System (Higher Priority - Affects Payments)
1. Admin: Cashback campaigns CRUD
2. Admin: Apply cashback to applications
3. Student: Show cashback in application wizard
4. Student: Show cashback in payments page
5. Payment processing: Apply cashback discount
6. Update payment calculations throughout

### Phase 3: Partner Referral System
1. Admin: Partners CRUD
2. Application wizard: Partner referral field
3. Commission calculation on confirmation
4. Admin: Commission management interface
5. Admin: Commission reports

### Phase 4: Integration & Testing
1. Test cashback with payment flow
2. Test commission calculations
3. Update all reports
4. End-to-end testing

---

## ⚠️ Breaking Changes Risk Assessment

### Low Risk ✅
- Adding new tables (no existing code depends on them)
- Adding columns to `student_applications` (nullable, backward compatible)
- New admin pages (isolated functionality)

### Medium Risk ⚠️
- Payment calculation changes (affects existing payment flow)
- Cashback application logic (must be tested thoroughly)
- Commission calculation (business logic, must be accurate)

### High Risk 🔴
- **Payment amount calculations** - Must ensure cashback is applied correctly
- **Total due calculations** - Must account for cashback in all places
- **Payment history** - Must show cashback-adjusted amounts correctly

---

## 🎯 Recommendations

1. **Start with Cashback System** - More critical, affects student payments
2. **Use database functions** - Centralize calculation logic
3. **Snapshot values** - Store amounts at time of application (don't recalculate)
4. **Comprehensive testing** - Test all payment scenarios with cashback
5. **Gradual rollout** - Test with one campaign first
6. **Documentation** - Document cashback and commission logic clearly

---

## 📝 Questions to Clarify

1. **Cashback Application:**
   - Should cashback reduce deposit or final installment?
   - Can cashback be applied retroactively to existing applications?
   - Can multiple cashbacks stack?

2. **Partner Referrals:**
   - How do partners refer students? (Code, link, manual entry?)
   - Can one application have multiple partner referrals?
   - When is commission paid? (Monthly, quarterly, per booking?)

3. **Commission Percentage:**
   - Is 5% fixed or can it vary per partner?
   - Can commission percentage change over time?
   - Should we track commission percentage history?

4. **Cashback Campaigns:**
   - Can cashbacks be combined with other discounts?
   - What happens if cashback amount > total contract value?
   - Should cashback be visible to students before they apply?

---

## ✅ Next Steps

1. **Review this analysis** - Confirm understanding
2. **Clarify questions** - Answer the questions above
3. **Create detailed migration** - Database schema changes
4. **Implement Phase 1** - Database foundation
5. **Implement Phase 2** - Cashback system
6. **Implement Phase 3** - Partner referral system
7. **Test thoroughly** - All payment scenarios

