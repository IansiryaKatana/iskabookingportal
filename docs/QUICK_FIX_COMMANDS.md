# Quick Fix Commands - Production URLs

**Your live domain:** `iskabookingportal.netlify.app`

## 🔴 IMMEDIATE FIX (Copy & Paste)

### 1. Supabase Dashboard (Do This First!)
1. Go to **Supabase Dashboard** → **Authentication** → **URL Configuration**
2. Set **Site URL** to: `https://portal.urbanhub.uk`
3. Add **Redirect URLs**:
   ```
   https://portal.urbanhub.uk/**
   https://portal.urbanhub.uk/portal/**
   https://portal.urbanhub.uk/partner/**
   https://portal.urbanhub.uk/admin/**
   ```
4. **Save**

### 2. Set Supabase Secrets (Run These Commands)

```bash
supabase secrets set PORTAL_URL=https://portal.urbanhub.uk
supabase secrets set DOCUSIGN_SIGNING_RETURN_URL=https://portal.urbanhub.uk/portal
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
3. Verify link is `https://portal.urbanhub.uk/...` (NOT localhost)

---

**Done!** Password reset emails will now use production URLs.

