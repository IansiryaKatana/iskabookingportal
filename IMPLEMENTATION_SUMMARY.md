# Partner Referral & Cashback System - Implementation Summary

## ✅ Completed Implementation

### 1. Database Schema ✅
- **Migration:** `20251118_partner_referral_and_cashback_system.sql`
  - Created `partners` table
  - Created `partner_referrals` table
  - Created `cashback_campaigns` table
  - Created `application_cashbacks` table
  - Added columns to `student_applications`:
    - `referred_by_partner_id`
    - `cashback_amount`
  - Created database functions:
    - `get_contract_value()` - Calculate contract value
    - `get_application_total_with_cashback()` - Get total with cashback applied
    - `calculate_partner_commission()` - Calculate commission
    - `check_cashback_eligibility()` - Check if application qualifies
    - `apply_cashback_to_application()` - Apply cashback
    - `create_partner_referral()` - Create partner referral record
  - Added RLS policies for all tables
  - Added indexes for performance

- **Migration:** `20251118_update_payment_summary_for_cashback.sql`
  - Updated `get_payment_summary()` function to account for cashback

### 2. React Hooks ✅
- **`src/hooks/useCashback.ts`**
  - `useActiveCashbackCampaigns()` - Get active campaigns
  - `useCheckCashbackEligibility()` - Check eligibility
  - `useApplicationCashback()` - Get cashback for application
  - `useApplyCashback()` - Apply cashback mutation

- **`src/hooks/usePartners.ts`**
  - `usePartners()` - Get all partners
  - `useApplicationPartnerReferral()` - Get referral for application
  - `useCreatePartnerReferral()` - Create referral mutation
  - `useUpdateCommissionStatus()` - Update commission status

### 3. Student Portal Integration ✅
- **`src/pages/portal/Payments.tsx`**
  - Shows cashback alert when cashback is applied
  - Displays payment summary with cashback discount
  - Adjusts final installment amount by cashback (reduces final installment)
  - Shows original amount with strikethrough and adjusted amount
  - Displays cashback badge on discounted installment

### 4. Admin Portal Integration ✅
- **`src/pages/admin/CashbackCampaigns.tsx`** (NEW)
  - CRUD interface for cashback campaigns
  - Create/edit/delete campaigns
  - Set amount, dates, eligibility (all/new/rebooking)
  - Track usage (current_uses vs max_uses)
  - View active/inactive status

- **`src/pages/admin/Partners.tsx`** (NEW)
  - CRUD interface for partners
  - Set commission percentage (configurable, default 5%)
  - Manage partner contact information
  - View active/inactive status

- **`src/pages/admin/ApplicationDetail.tsx`** (UPDATED)
  - Shows cashback information in Payment & Contract card
  - Shows adjusted total (original - cashback)
  - "Apply Cashback" button to apply campaigns
  - Shows partner referral information
  - "Assign Partner" button to assign referral
  - Displays commission amount and status
  - Dialogs for applying cashback and assigning partners

- **`src/components/admin/AdminLayout.tsx`** (UPDATED)
  - Added navigation items:
    - "Cashback Campaigns" → `/admin/cashback-campaigns`
    - "Partners" → `/admin/partners`

- **`src/App.tsx`** (UPDATED)
  - Added routes for new admin pages

### 5. Payment Calculations ✅
- **Payment Summary Function** - Updated to subtract cashback from total_due
- **Student Payments Page** - Shows cashback-adjusted amounts
- **Final Installment Reduction** - Cashback reduces final installment (recommended approach)

## 📋 How It Works

### Cashback System
1. **Admin creates campaign:**
   - Sets amount (e.g., £500)
   - Sets eligibility (all/new/rebooking)
   - Sets dates and max uses

2. **Admin applies to application:**
   - Opens Application Detail page
   - Clicks "Apply Cashback"
   - Selects campaign
   - System checks eligibility and applies

3. **Student sees cashback:**
   - Alert on Payments page showing cashback amount
   - Payment summary shows:
     - Total Due: £5,000
     - Cashback: -£500
     - Remaining Balance: £4,500
   - Final installment shows:
     - Original: £1,000 (strikethrough)
     - Adjusted: £500 (with cashback badge)

### Partner Referral System
1. **Admin creates partner:**
   - Sets name, contact info
   - Sets commission percentage (default 5%, configurable)

2. **Admin assigns to application:**
   - Opens Application Detail page
   - Clicks "Assign Partner"
   - Selects partner
   - System creates referral record

3. **Commission calculation:**
   - When application is confirmed, commission is calculated:
     - Commission = Total Contract Value × (Commission % / 100)
   - Commission status: pending → approved → paid

4. **Admin views commission:**
   - Application Detail shows:
     - Partner name
     - Commission amount
     - Commission percentage
     - Commission status

## 🔄 Next Steps (Optional Enhancements)

1. **Auto-apply cashback on confirmation:**
   - Create database trigger to auto-apply eligible cashback when application status → 'confirmed'

2. **Auto-create partner referral:**
   - Create database trigger to auto-create referral when application with `referred_by_partner_id` is confirmed

3. **Commission Reports Page:**
   - Create `/admin/partner-commissions` page
   - View all commissions
   - Filter by partner, status, date range
   - Export to CSV
   - Mark as paid

4. **Payment Processing:**
   - Update `create-payment` Edge Function to account for cashback when creating payment intents
   - Ensure final installment amount is reduced by cashback

5. **Application Wizard:**
   - Add partner referral code field in Step 1
   - Auto-check cashback eligibility and show available campaigns

## 📝 Migration Order

Run these migrations in order:

1. ✅ `20251118_partner_referral_and_cashback_system.sql`
2. ✅ `20251118_update_payment_summary_for_cashback.sql`

## ⚠️ Important Notes

- **Cashback reduces final installment** - This is the recommended approach (simplest and clearest)
- **Commission is calculated on confirmation** - Only confirmed bookings generate commissions
- **Cashback is one per application** - UNIQUE constraint on `application_cashbacks.application_id`
- **Partner referral is one per application** - UNIQUE constraint on `partner_referrals.application_id`
- **Commission percentage is configurable per partner** - Default is 5%, but can be changed
- **Cashback campaigns can target** - All applications, new only, or rebooking only

## 🧪 Testing Checklist

- [ ] Create a cashback campaign
- [ ] Apply cashback to an application
- [ ] Verify cashback shows in student Payments page
- [ ] Verify final installment is reduced
- [ ] Create a partner
- [ ] Assign partner to application
- [ ] Verify commission is calculated on confirmation
- [ ] Test payment summary with cashback
- [ ] Test payment summary without cashback
- [ ] Test with multiple installments
- [ ] Test cashback eligibility (new vs rebooking)

