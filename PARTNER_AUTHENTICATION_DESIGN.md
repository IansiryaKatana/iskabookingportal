# Partner Authentication Design

## 🎯 Problem Statement

We need partner authentication that supports:
1. **Admin creates partner record** → Partner exists in `partners` table
2. **Partner self-registers** → Partner creates their own account using referral code
3. **Admin creates partner account** → Admin creates user account directly

**Challenge:** How do we link self-registered accounts to existing partner records?

---

## ✅ Solution: Referral Code-Based Linking

### **Flow 1: Partner Self-Registration (Primary)**

1. Admin creates partner in Partners page → Partner record with `referral_code` (e.g., "UNI2025")
2. Partner visits `/partner/register`
3. Partner enters:
   - Email
   - Password
   - First Name
   - Last Name
   - **Referral Code** (their unique code)
4. System validates referral code:
   - Checks if code exists in `partners` table
   - Checks if partner is active
   - Checks if code is not already linked to another account
5. If valid:
   - Create auth user
   - Create profile with `role = 'partner'`
   - Link `profile.partner_id = partner.id`
   - Redirect to partner dashboard
6. If invalid:
   - Show error: "Invalid referral code. Please contact admin."

### **Flow 2: Admin Creates Partner Account**

1. Admin creates partner in Partners page
2. Admin clicks "Create Account" button on partner card
3. Admin enters:
   - Email (pre-filled from `contact_email` if available)
   - First Name (pre-filled from `contact_name` if available)
   - Last Name
4. System:
   - Creates auth user
   - Sends password reset email to partner
   - Creates profile with `role = 'partner'`
   - Links `profile.partner_id = partner.id`
5. Partner receives email, sets password, logs in

### **Flow 3: Email Matching (Fallback)**

If partner registers with email that matches `partners.contact_email`:
- Auto-link to partner record (if referral code not provided)
- Still require referral code for security, but show helpful message

---

## 🏗️ Implementation Details

### **Database Changes**

Already done in `20251118_partner_referral_code_system.sql`:
- ✅ `partners.referral_code` (unique)
- ✅ `profiles.partner_id` (links to partner)
- ✅ `profiles.role = 'partner'` support

### **New Pages**

1. **`/partner/login`** - Partner login page
2. **`/partner/register`** - Partner registration with referral code
3. **`/partner`** - Partner dashboard (protected)

### **New Functions**

1. **`link_partner_account(referral_code, user_id)`** - Links profile to partner record
2. **`check_referral_code_available(referral_code)`** - Checks if code is available (not already linked)

### **Admin Features**

1. **"Create Account" button** on Partners page
2. **"Send Invitation" button** - Sends email with registration link
3. **Account status indicator** - Shows if partner has account or not

---

## 🔐 Security Considerations

1. **Referral Code Uniqueness:**
   - One referral code = one partner account
   - Once linked, code cannot be used again
   - Admin can reset link if needed

2. **Email Verification:**
   - Partners must verify email before accessing dashboard
   - Same flow as student registration

3. **RLS Policies:**
   - Partners can only see their own data
   - Partners cannot see other partners' data
   - Already implemented in migration

---

## 📋 Registration Form Fields

```
Partner Registration Form:
- Email *
- Password *
- Confirm Password *
- First Name *
- Last Name *
- Referral Code * (unique code from admin)
- Phone (optional)
```

---

## 🎨 UI/UX Flow

### **Partner Registration Page:**

```
┌─────────────────────────────────────┐
│  Partner Portal Registration        │
├─────────────────────────────────────┤
│  Email: [________________]          │
│  Password: [________________]       │
│  Confirm: [________________]        │
│  First Name: [________________]     │
│  Last Name: [________________]      │
│  Referral Code: [UNI2025] ✅ Valid  │
│                                     │
│  [Register]                         │
│                                     │
│  Already have account? [Login]      │
└─────────────────────────────────────┘
```

### **Admin Partner Card:**

```
┌─────────────────────────────────────┐
│  University Partnership             │
│  Referral Code: UNI2025             │
│  Status: Active                     │
│                                     │
│  Account: ❌ Not Created            │
│  [Create Account] [Send Invitation] │
└─────────────────────────────────────┘
```

---

## 🚀 Implementation Steps

1. ✅ Database schema (already done)
2. ⏳ Create partner registration page
3. ⏳ Create partner login page
4. ⏳ Update AuthContext to support partner role
5. ⏳ Create database function to link accounts
6. ⏳ Add "Create Account" button to Partners admin page
7. ⏳ Create partner dashboard
8. ⏳ Add routing for partner portal

---

## 💡 Alternative: Invitation System (Future Enhancement)

For better UX, we could add:
- Admin sends invitation email with unique token
- Partner clicks link, auto-fills referral code
- More secure, better user experience

But for now, referral code entry is simpler and works well.

