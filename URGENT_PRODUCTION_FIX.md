# 🚨 URGENT: Production URL Fix

**Problem:** Password reset emails show localhost links instead of production URLs.

**Solution:** Follow these steps in order.

---

## ✅ STEP 1: Fix Supabase Auth Site URL (MOST IMPORTANT)

**This fixes password reset emails immediately!**

1. Go to **Supabase Dashboard** → **Authentication** → **URL Configuration**
2. Set **Site URL** to:
   ```
   https://iskabookingportal.netlify.app
   ```

3. Add **Redirect URLs** (one per line):
   ```
   https://iskabookingportal.netlify.app/**
   https://iskabookingportal.netlify.app/portal/**
   https://iskabookingportal.netlify.app/partner/**
   https://iskabookingportal.netlify.app/admin/**
   ```

4. Click **Save**

**✅ This alone will fix password reset emails!**

---

## ✅ STEP 2: Set Supabase Secrets

Run these commands (replace `portal.urbanhub.uk` with your actual domain):

```bash
# Portal URL for email links
supabase secrets set PORTAL_URL=https://iskabookingportal.netlify.app

# DocuSign return URL
supabase secrets set DOCUSIGN_SIGNING_RETURN_URL=https://iskabookingportal.netlify.app/portal

# Email from address (must be verified in Resend)
supabase secrets set RESEND_FROM_EMAIL=noreply@send.portal.urbanhub.uk
```

---

## ✅ STEP 3: Redeploy Edge Functions

```bash
supabase functions deploy send-bulk-message
supabase functions deploy send-transactional-email
supabase functions deploy docusign-recipient-view
```

---

## ✅ STEP 4: Test

1. Go to Admin → Partners
2. Create a partner account
3. Check the password reset email
4. Verify the link is `https://iskabookingportal.netlify.app/...` (NOT localhost)
5. Click the link and verify it works

---

## 📋 Complete Secret List (Optional - For Reference)

If you want to set all production secrets at once:

```bash
# Portal/Frontend
supabase secrets set PORTAL_URL=https://iskabookingportal.netlify.app
supabase secrets set DOCUSIGN_SIGNING_RETURN_URL=https://iskabookingportal.netlify.app/portal

# Email
supabase secrets set RESEND_FROM_EMAIL=noreply@send.portal.urbanhub.uk
supabase secrets set NOTIFICATIONS_STAFF_EMAIL=admin@urbanhub.uk
supabase secrets set NOTIFICATIONS_FROM_EMAIL="Urban Hub <noreply@send.portal.urbanhub.uk>"

# Stripe (switch to LIVE keys)
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...

# DocuSign (switch to PRODUCTION)
supabase secrets set DOCUSIGN_AUTH_SERVER=https://account.docusign.com
supabase secrets set DOCUSIGN_BASE_URL=https://www.docusign.net/restapi
```

---

## 🎯 Quick Summary

**Minimum required (fixes password reset):**
1. ✅ Set Site URL in Supabase Dashboard → Authentication
2. ✅ Set `PORTAL_URL` secret
3. ✅ Redeploy `send-bulk-message` function

**That's it!** Password reset emails will now use production URLs.

---

**Created:** 2025-11-20  
**Status:** URGENT - Fix immediately

