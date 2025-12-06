# Quick Fix Commands - Production URLs

**Your live domain:** `iskabookingportal.netlify.app`

## 🔴 IMMEDIATE FIX (Copy & Paste)

### 1. Supabase Dashboard (Do This First!)
1. Go to **Supabase Dashboard** → **Authentication** → **URL Configuration**
2. Set **Site URL** to: `https://iskabookingportal.netlify.app`
3. Add **Redirect URLs**:
   ```
   https://iskabookingportal.netlify.app/**
   https://iskabookingportal.netlify.app/portal/**
   https://iskabookingportal.netlify.app/partner/**
   https://iskabookingportal.netlify.app/admin/**
   ```
4. **Save**

### 2. Set Supabase Secrets (Run These Commands)

```bash
supabase secrets set PORTAL_URL=https://iskabookingportal.netlify.app
supabase secrets set DOCUSIGN_SIGNING_RETURN_URL=https://iskabookingportal.netlify.app/portal
supabase secrets set RESEND_FROM_EMAIL=noreply@send.portal.urbanhub.uk
```

### 3. Redeploy Edge Functions

```bash
supabase functions deploy send-bulk-message
supabase functions deploy send-transactional-email
supabase functions deploy docusign-recipient-view
```

## ✅ Test

1. Create a partner account in Admin → Partners
2. Check password reset email
3. Verify link is `https://iskabookingportal.netlify.app/...` (NOT localhost)

---

**Done!** Password reset emails will now use production URLs.

