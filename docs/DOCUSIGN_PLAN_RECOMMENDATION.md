# DocuSign Plan Recommendation - STUCOMMS Booking Portal

## Executive Summary

**Recommendation: Request a Custom Enhanced Plan from DocuSign Sales**

Your business requirements exceed all standard DocuSign eSignature plans. You need approximately **825-850 envelopes per academic year**, which is 8-9x the limit of the highest standard plan (100 envelopes/user/year).

---

## Current Integration Analysis

### Envelope Creation Pattern

Based on your codebase (`supabase/functions/docusign-envelopes/index.ts`):

**Per Application:**
1. **Tenancy Envelope** (always created)
   - Type: `envelope_type = "tenancy"`
   - Signers: Tenant (routing order 1) + Guarantor (routing order 2/3, if required)
   - Optional: Witness (viewer only, routing order 2)
   - Template: Uses `docusign_templates` table (per academic year)

2. **Guarantor Envelope** (conditionally created)
   - Type: `envelope_type = "guarantor"`
   - Signers: Guarantor only (routing order 1)
   - Created only when: `requiresGuarantor = true`
   - Condition: Application has payment plan AND payment plan is NOT "Pay in Full"

### Guarantor Requirement Logic

From your code (lines 505-533):
```typescript
// Pay in Full plans don't require a guarantor
const isPayInFullPlan = 
  installment.amount_type === 'percentage' && 
  installment.amount_value === 100 &&
  installments.length === 1;

const requiresGuarantor = Boolean(application.selected_payment_plan_id) && !isPayInFullPlan;
```

**Guarantor Required When:**
- Application has a payment plan selected
- Payment plan is NOT "Pay in Full" (i.e., has multiple installments or is not 100% upfront)

**Guarantor NOT Required When:**
- Application has "Pay in Full" plan (single 100% installment)
- No payment plan selected (edge case)

---

## Annual Envelope Calculation

### Business Requirements
- **425 applications per academic year** (as stated)

### Envelope Breakdown

**Scenario 1: All Applications Require Guarantor (Worst Case)**
- Tenancy envelopes: 425 (always created)
- Guarantor envelopes: 425 (all require guarantor)
- **Total: 850 envelopes/year**

**Scenario 2: Realistic Mix (Recommended for Planning)**
- Assumption: ~6% choose "Pay in Full" (25 applications), ~94% require guarantor (400 applications)
- Tenancy envelopes: 425 (always created)
- Guarantor envelopes: 400 (only when guarantor required)
- **Total: 825 envelopes/year**

**Scenario 3: Conservative Estimate (Buffer for Growth)**
- Assumption: 10% Pay in Full (43 applications), 90% require guarantor (382 applications)
- Tenancy envelopes: 425
- Guarantor envelopes: 382
- **Total: 807 envelopes/year**

### Recommended Planning Volume
**Use 850 envelopes/year** for planning purposes to account for:
- Growth in applications
- Edge cases
- Testing/development envelopes
- Buffer for retries/resends

---

## DocuSign Plan Comparison

### Standard Plans (Insufficient)

| Plan | Price (Annual) | Envelope Limit | Your Need | Status |
|------|----------------|----------------|-----------|--------|
| **Personal** | $120/year | 5/month = **60/year** | 850/year | ❌ **14x over limit** |
| **Standard** | $300/user/year | **100/user/year** | 850/year | ❌ **8.5x over limit** |
| **Business Pro** | $480/user/year | **100/user/year** | 850/year | ❌ **8.5x over limit** |

**Why Standard Plans Don't Work:**
- Even with 9 users on Standard ($2,700/year) or Business Pro ($4,320/year), you'd only get 900 envelopes/year
- This assumes ALL users need full access, which you don't
- You're paying for user licenses you don't need
- No room for growth or error margin

### Enhanced Plans (Custom - Recommended)

**What to Request:**
- **Envelope Limit**: 1,000 envelopes/year (provides 15% buffer)
- **User Licenses**: 1-2 admin users (for template management)
- **Features Needed**:
  - ✅ Template management (you use `docusign_templates` table)
  - ✅ API access (you use JWT authentication)
  - ✅ Webhooks (you have `docusign-webhook` function)
  - ✅ Embedded signing (you use `docusign-recipient-view`)
  - ✅ Custom branding (optional, but nice to have)

**Expected Pricing:**
- Typically $40-60/month per user + envelope overage fees
- Or custom annual contract with envelope bundle
- **Estimated: $600-1,200/year** (negotiable with sales)

---

## What to Tell DocuSign Sales

### Key Talking Points

1. **Your Volume:**
   - "We need approximately 850 envelopes per academic year"
   - "Each application requires 1-2 envelopes (tenancy + optional guarantor)"
   - "We process ~425 student applications annually"

2. **Your Integration:**
   - "We have a fully integrated DocuSign API implementation"
   - "We use JWT authentication, templates, webhooks, and embedded signing"
   - "We need API access, not just web interface access"

3. **Your Requirements:**
   - "We need a custom envelope limit (850-1,000/year)"
   - "We only need 1-2 admin user licenses (for template management)"
   - "Most envelopes are sent programmatically via API"
   - "We need webhook support for status updates"

4. **Your Budget:**
   - "We're looking for a cost-effective solution"
   - "We're open to annual contracts for better pricing"
   - "We need a plan that scales with our growth (potential 20-30% increase)"

### Questions to Ask Sales

1. **Envelope Pricing:**
   - "What's the cost per envelope over the base limit?"
   - "Do you offer envelope bundles for annual contracts?"
   - "Is there a discount for API-only usage (no web interface needed)?"

2. **User Licenses:**
   - "Can we have minimal user licenses (1-2) with high envelope limits?"
   - "Do admin-only accounts cost less than full user licenses?"

3. **Contract Terms:**
   - "What's the minimum contract term?"
   - "Can we adjust envelope limits mid-year if needed?"
   - "What happens if we exceed the limit?"

4. **Features:**
   - "Are webhooks included in all plans?"
   - "Is API access standard or requires upgrade?"
   - "Can we customize branding on envelopes?"

---

## Alternative Considerations

### Option 1: Multiple Standard Accounts (Not Recommended)
- **Cost**: 9 × $300 = $2,700/year
- **Envelopes**: 900/year
- **Issues**: 
  - Managing 9 separate accounts
  - No unified reporting
  - Complex integration (would need account rotation)
  - ❌ **Not viable**

### Option 2: Business Pro with Overage Fees
- **Cost**: 1-2 users × $480 = $480-960/year + overage fees
- **Envelopes**: 100 base + overage charges
- **Issues**:
  - Overage fees can be expensive ($0.10-0.50 per envelope)
  - 750 overage envelopes × $0.30 = $225/month = $2,700/year
  - **Total: $3,180-3,660/year** (more expensive than custom)
  - ❌ **Not cost-effective**

### Option 3: Custom Enhanced Plan (Recommended) ✅
- **Cost**: $600-1,200/year (negotiable)
- **Envelopes**: 850-1,000/year (custom limit)
- **Benefits**:
  - Single account, unified reporting
  - Predictable pricing
  - Room for growth
  - All features included
  - ✅ **Best option**

---

## Implementation Notes

### Current Integration Status

Your integration is **production-ready** and uses:
- ✅ JWT authentication (`getAccessToken()`)
- ✅ Template-based envelopes (`docusign_templates` table)
- ✅ Dynamic role assignment (per academic year)
- ✅ Webhook handling (`docusign-webhook` function)
- ✅ Embedded signing (`docusign-recipient-view`)
- ✅ Status polling (`docusign-check-status`)
- ✅ Signed document retrieval (`download-signed-document`)

### No Code Changes Needed

Once you upgrade to a paid plan:
1. Update environment variables (if needed):
   - `DOCUSIGN_AUTH_SERVER`: Change from `account-d.docusign.com` (demo) to `account.docusign.com` (production)
2. Test with a few real envelopes
3. Monitor envelope usage via DocuSign dashboard

### Migration Checklist

- [ ] Contact DocuSign Sales (1-877-720-2040 or sales@docusign.com)
- [ ] Negotiate custom plan (850-1,000 envelopes/year)
- [ ] Sign contract and set up production account
- [ ] Update `DOCUSIGN_AUTH_SERVER` environment variable
- [ ] Update `DOCUSIGN_BASE_URL` if needed
- [ ] Test envelope creation with production account
- [ ] Verify webhooks are working
- [ ] Monitor first 10-20 envelopes for issues
- [ ] Set up usage alerts in DocuSign dashboard

---

## Cost-Benefit Analysis

### Custom Enhanced Plan
- **Annual Cost**: $600-1,200 (estimated)
- **Envelopes**: 850-1,000/year
- **Cost per Envelope**: $0.60-1.41
- **Benefits**: Predictable, scalable, all features

### Business Pro with Overage
- **Annual Cost**: $3,180-3,660 (estimated)
- **Envelopes**: 850/year
- **Cost per Envelope**: $3.74-4.31
- **Issues**: Unpredictable, expensive, no growth room

### Savings with Custom Plan
- **Annual Savings**: $1,980-3,060
- **ROI**: 165-255% better value

---

## Recommendation Summary

**✅ Request a Custom Enhanced Plan from DocuSign Sales**

**Key Specifications:**
- **Envelope Limit**: 1,000/year (15% buffer)
- **User Licenses**: 1-2 admin accounts
- **Features**: API access, webhooks, templates, embedded signing
- **Budget Target**: $600-1,200/year
- **Contract**: Annual preferred (better pricing)

**Next Steps:**
1. Call DocuSign Sales: **1-877-720-2040**
2. Reference this document for your requirements
3. Negotiate based on your volume (850 envelopes/year)
4. Request custom pricing for API-heavy usage
5. Ask for annual contract discount

**Expected Timeline:**
- Sales call: 1-2 days
- Contract negotiation: 3-5 days
- Account setup: 1-2 days
- Testing: 2-3 days
- **Total: 1-2 weeks to go live**

---

## Contact Information

**DocuSign Sales:**
- Phone: 1-877-720-2040
- Email: sales@docusign.com
- Website: https://www.docusign.com/pricing/esignature

**Your Integration Details:**
- Integration Type: API-based (JWT authentication)
- Primary Use Case: Student tenancy agreements
- Envelope Types: Tenancy (multi-signer) + Guarantor (single-signer)
- Annual Volume: 850 envelopes/year
- Growth Projection: 20-30% potential increase

---

*Document created: January 2025*
*Based on codebase analysis of STUCOMMS Booking Portal*

