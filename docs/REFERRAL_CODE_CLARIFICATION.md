# Referral Code Use Cases - Clarification

## Two Different Use Cases

### 1. Partner Account Registration (ONE-TO-ONE) ⚠️ Has Race Condition

**What it is:**
- A partner user account gets **LINKED** to a referral code
- Only **ONE partner account** can be linked to a referral code
- This is for partner portal access

**Example:**
- Partner "ABC Agency" has referral code "PARTNER123"
- Partner User A registers and links their account to "PARTNER123" ✅
- Partner User B tries to register with "PARTNER123" ❌ (already linked)

**Race Condition:**
- If two partner users try to link to the same code simultaneously, one succeeds, one fails
- **Fix needed:** Atomic database operation with row locking

**Location:**
- `src/pages/partner/Register.tsx`
- `link_partner_account()` function

---

### 2. Students Using Referral Codes (ONE-TO-MANY) ✅ NO Race Condition

**What it is:**
- Multiple students can **USE** the same referral code during their application
- Each student application creates a separate `partner_referrals` record
- Many students can use code "PARTNER123" - each gets their own referral record

**Example:**
- Student A applies with referral code "PARTNER123" ✅
- Student B applies with referral code "PARTNER123" ✅
- Student C applies with referral code "PARTNER123" ✅
- All three create separate `partner_referrals` records
- Partner gets commission for all three applications

**Database Structure:**
```sql
-- partner_referrals table
CREATE TABLE partner_referrals (
  id UUID PRIMARY KEY,
  partner_id UUID,           -- Links to partner
  application_id UUID,        -- Links to student application
  referral_code TEXT,         -- The code used (e.g., "PARTNER123")
  commission_amount NUMERIC,
  ...
  UNIQUE(application_id)      -- One referral record per application
);
```

**No Race Condition:**
- Multiple students can use the same code simultaneously
- Each creates their own `partner_referrals` record
- No conflicts or race conditions
- ✅ **Safe for concurrent use**

**Location:**
- `src/pages/portal/ApplicationWizard.tsx`
- `validate_referral_code()` function
- `partner_referrals` table

---

## Summary

| Use Case | Relationship | Concurrent Safe? | Race Condition? |
|----------|-------------|------------------|-----------------|
| **Partner Account Registration** | One partner account → One referral code | ⚠️ No | ⚠️ Yes - needs fix |
| **Students Using Referral Codes** | Many students → One referral code | ✅ Yes | ✅ No - already safe |

---

## What Needs Fixing

**ONLY Partner Account Registration needs fixing:**
- The `link_partner_account()` function needs atomic operation
- Use `SELECT FOR UPDATE` to lock the partner record
- Prevent two partner users from linking to the same code simultaneously

**Students using referral codes:**
- ✅ Already safe
- ✅ Multiple students can use same code
- ✅ No changes needed

