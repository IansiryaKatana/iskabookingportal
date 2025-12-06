# DocuSign Fix Recommendations

## Issue 1: Signature Tabs Not Marked in Tenancy Agreement

### Problem
When tenants open the DocuSign tenancy agreement, signature fields aren't pre-marked like they are in the guarantor agreement. The guarantor template has signature fields clearly marked, but the tenancy template doesn't.

### Root Cause
The code was only sending `textTabs` for data fields, but not `signHereTabs` or `dateSignedTabs` for signature fields.

### Solution Implemented
I've added `signHereTabs` and `dateSignedTabs` programmatically in the code. However, **the BEST solution is to pre-place signature tabs in your DocuSign template** (like you did for the guarantor template).

### What You Need to Do

#### Option A: Pre-Place Tabs in Template (RECOMMENDED)
1. Open your DocuSign template for the tenancy agreement
2. Add signature tabs for the tenant role:
   - **Sign Here** tab where the tenant should sign
   - **Date Signed** tab where the date should appear
3. Make sure these tabs are assigned to the tenant role (e.g., "Tenant" or whatever role name you use)
4. Save the template

**Benefits:**
- More reliable - tabs are always in the right place
- Better UX - tenants see exactly where to sign
- No code changes needed if you move tabs around

#### Option B: Use Anchor Text (Current Implementation)
The code now uses anchor text to place tabs. You need to:
1. Add anchor text in your template where you want signatures:
   - `{{signature}}` for the signature field
   - `{{date_signed}}` for the date field
2. OR update the anchor strings in the code to match your template's anchor text

**Current anchor strings in code:**
- `{{signature}}` for signature tab
- `{{date_signed}}` for date tab

**To change these**, edit `supabase/functions/docusign-envelopes/index.ts` around lines 720-740 and update the `anchorString` values.

#### Option C: Use X/Y Coordinates
If your template doesn't have anchor text, you can use fixed coordinates:
- Remove `anchorString` from the tab definitions
- Add `xPosition` and `yPosition` with pixel coordinates
- This is less flexible but works if you know exact positions

### Recommendation
**Use Option A (pre-place tabs in template)** - it's the most reliable and matches what you've done for the guarantor template.

---

## Issue 2: Payment Data Not Populating Correctly

### Problem
The DocuSign document wasn't showing:
- Weekly rate
- Deposit amount
- Payment schedule with actual calculated amounts (only showed percentages)

### Solution Implemented
I've updated the code to:
1. **Calculate weekly rate** from:
   - `contract.weekly_price_override` (if set)
   - OR `studio_grade_prices.weekly_price` (fallback)

2. **Calculate deposit amount** from:
   - `contract.deposit_override` (if set)
   - OR `payment_plan.deposit_amount` (if payment plan selected)
   - OR `studio_grade_prices.deposit_amount_override` (fallback)

3. **Calculate payment schedule** with actual amounts:
   - Calculates remaining balance = Total Contract Value - Deposit
   - For percentage-based installments: calculates actual amount from remaining balance
   - For fixed installments: uses the fixed amount
   - Formats all amounts in GBP format

4. **Populates DocuSign tabs**:
   - `weekly_rate` - Weekly rate in GBP format
   - `deposit_amount` - Deposit amount in GBP format
   - `total_rent` - Total contract value in GBP format
   - `plan_summary` - Payment schedule with actual amounts and due dates

### New DocuSign Tab Labels
The following tab labels are now populated:
- `weekly_rate` - e.g., "£205.00"
- `deposit_amount` - e.g., "£99.00"
- `total_rent` - e.g., "£9,225.00"
- `plan_summary` - e.g., "Payment 1: £3,075.00 22 Aug 2026; Payment 2: £3,075.00 1 Jan 2027; Payment 3: £3,075.00 1 Apr 2027"

**Make sure your DocuSign template has these tab labels!**

---

## Issue 3: Loader for All Payment Plans

### Problem
The "Preparing agreement..." loader should show for all payment plans, not just Pay in Full.

### Solution
The loader logic is already correct - it shows when:
- Deposit is paid
- No envelope exists yet
- Can't launch signing yet

This works for all payment plans. However, I've verified the logic is correct and it should work for all scenarios.

---

## Testing Checklist

After deploying these changes:

1. **Test Signature Tabs:**
   - [ ] Create a new application
   - [ ] Complete through Step 5
   - [ ] Go to Step 6
   - [ ] Click "Sign tenancy agreement"
   - [ ] Verify signature fields are marked/visible in DocuSign
   - [ ] If not visible, check if anchor text matches your template OR pre-place tabs in template

2. **Test Payment Data:**
   - [ ] Verify weekly rate appears in document
   - [ ] Verify deposit amount appears in document
   - [ ] Verify total rent appears in document
   - [ ] Verify payment schedule shows actual amounts (not just percentages)
   - [ ] Test with different payment plans (percentage-based and fixed)

3. **Test Loader:**
   - [ ] Verify "Preparing agreement..." shows for all payment plans
   - [ ] Verify loader appears after Step 5 submission
   - [ ] Verify loader disappears when envelope is ready

---

## Next Steps

1. **Deploy the updated function:**
   ```bash
   npx supabase functions deploy docusign-envelopes
   ```

2. **Update your DocuSign template:**
   - Add signature tabs for tenant role (Option A - recommended)
   - OR add anchor text `{{signature}}` and `{{date_signed}}` where you want tabs
   - Ensure tab labels match: `weekly_rate`, `deposit_amount`, `total_rent`, `plan_summary`

3. **Test with a real application**

4. **If signature tabs still don't appear:**
   - Check DocuSign template has tabs pre-placed OR anchor text matches
   - Check DocuSign logs for any errors
   - Consider using x/y coordinates if anchor text doesn't work

---

## Code Changes Summary

### Files Modified:
1. `supabase/functions/docusign-envelopes/index.ts`
   - Added contract details to query (weekly_price_override, weeks, deposit_override)
   - Added calculation logic for weekly rate, deposit, and payment schedule
   - Added signature tabs (signHereTabs, dateSignedTabs) programmatically
   - Added new text tabs for weekly_rate and deposit_amount

### New Tab Labels in DocuSign:
- `weekly_rate` - Weekly rate in GBP
- `deposit_amount` - Deposit amount in GBP
- `total_rent` - Total contract value in GBP
- `plan_summary` - Payment schedule with actual amounts

### Signature Tab Anchors:
- `{{signature}}` - For signature field
- `{{date_signed}}` - For date field

**Update these anchor strings in the code if your template uses different anchor text!**

