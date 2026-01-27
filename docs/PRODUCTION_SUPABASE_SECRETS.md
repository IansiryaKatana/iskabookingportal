# Production Supabase Secrets - Complete List

**⚠️ CRITICAL:** You're in production! Set these secrets immediately to fix password reset emails and all URL issues.

---

## 🔴 IMMEDIATE FIX (Password Reset Emails)

### 1. Supabase Dashboard - Authentication Settings

**This is the MAIN fix for password reset emails showing localhost!**

1. Go to **Supabase Dashboard** → **Authentication** → **URL Configuration**
2. Set **Site URL** to:
   ```
   https://portal.urbanhub.uk
   ```

3. Add **Redirect URLs**:
   ```
   https://portal.urbanhub.uk/**
   https://portal.urbanhub.uk/portal/**
   https://portal.urbanhub.uk/partner/**
   https://portal.urbanhub.uk/admin/**
   ```

4. **Save** - This fixes password reset emails immediately!

---

## 📋 All Supabase Edge Function Secrets

Run these commands to set all production secrets:

```bash
# ============================================
# CRITICAL - Portal/Frontend URL
# ============================================
supabase secrets set PORTAL_URL=https://portal.urbanhub.uk

# ============================================
# Supabase (Already set, verify these)
# ============================================
# These should already be set, but verify:
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ============================================
# Stripe (Switch to LIVE keys)
# ============================================
supabase secrets set STRIPE_SECRET_KEY=sk_live_... (NOT sk_test_)
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_... (from production webhook)

# ============================================
# DocuSign (Production URLs)
# ============================================
supabase secrets set DOCUSIGN_CLIENT_ID=your-client-id
supabase secrets set DOCUSIGN_USER_ID=your-user-id
supabase secrets set DOCUSIGN_ACCOUNT_ID=your-account-id
supabase secrets set DOCUSIGN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
supabase secrets set DOCUSIGN_AUTH_SERVER=https://account.docusign.com (NOT account-d)
supabase secrets set DOCUSIGN_BASE_URL=https://www.docusign.net/restapi (NOT demo)
supabase secrets set DOCUSIGN_TENANCY_TEMPLATE_ID=your-template-id
supabase secrets set DOCUSIGN_GUARANTOR_TEMPLATE_ID=your-template-id
supabase secrets set DOCUSIGN_SIGNING_RETURN_URL=https://portal.urbanhub.uk/portal

# ============================================
# Email (Resend)
# ============================================
supabase secrets set RESEND_API_KEY=re_... (production key)
supabase secrets set RESEND_FROM_EMAIL=noreply@send.portal.urbanhub.uk

# ============================================
# Notifications
# ============================================
supabase secrets set NOTIFICATIONS_STAFF_EMAIL=admin@urbanhub.uk
supabase secrets set NOTIFICATIONS_FROM_EMAIL=Urban Hub <noreply@send.portal.urbanhub.uk>
```

---

## 🚀 Quick Fix Script

Copy and paste this entire block (replace with your actual values):

```bash
# Portal URL (CRITICAL for emails and links)
supabase secrets set PORTAL_URL=https://portal.urbanhub.uk

# DocuSign Return URL (where users land after signing)
supabase secrets set DOCUSIGN_SIGNING_RETURN_URL=https://portal.urbanhub.uk/portal

# Email settings
supabase secrets set RESEND_FROM_EMAIL=noreply@send.portal.urbanhub.uk
supabase secrets set NOTIFICATIONS_STAFF_EMAIL=admin@urbanhub.uk
supabase secrets set NOTIFICATIONS_FROM_EMAIL="Urban Hub <noreply@send.portal.urbanhub.uk>"

# Redeploy edge functions to pick up new secrets
supabase functions deploy send-bulk-message
supabase functions deploy send-transactional-email
supabase functions deploy docusign-recipient-view
```

---

## ✅ Verification Steps

After setting secrets:

1. **Test Password Reset:**
   - Go to Admin → Partners
   - Create a partner account
   - Check the password reset email
   - Verify link is `https://portal.urbanhub.uk/...` (NOT localhost)

2. **Test Email Links:**
   - Send a bulk message
   - Check email - `{portal_url}` should be `https://portal.urbanhub.uk/portal`

3. **Test DocuSign:**
   - Complete a signing flow
   - Verify return URL is `https://portal.urbanhub.uk/portal`

---

## 🔍 Where Each Secret Is Used

| Secret | Used In | Purpose |
|--------|---------|---------|
| `PORTAL_URL` | send-bulk-message | Email template `{portal_url}` variable |
| `DOCUSIGN_SIGNING_RETURN_URL` | docusign-recipient-view | Where users land after signing |
| `RESEND_FROM_EMAIL` | All email functions | From email address |
| `SUPABASE_URL` | All edge functions | Supabase API endpoint (already set) |
| `SUPABASE_SERVICE_ROLE_KEY` | All edge functions | Admin access (already set) |

---

## 📝 Notes

- **PORTAL_URL** is NEW - I just added support for it in `send-bulk-message`
- **Supabase Auth Site URL** must be set in Dashboard (not a secret)
- All secrets are case-sensitive
- Redeploy edge functions after setting secrets

---

**Last Updated:** 2025-11-20  
**Status:** Production configuration required

