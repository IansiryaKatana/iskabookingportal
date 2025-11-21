# Production URL Configuration Guide

**⚠️ CRITICAL:** You're now in production! All URLs must point to your production domain, not localhost.

---

## 🔴 IMMEDIATE FIXES REQUIRED

### 1. Supabase Auth Site URL (MOST IMPORTANT - Fixes Password Reset Links)

**This is why password reset emails show localhost links!**

1. Go to **Supabase Dashboard** → **Authentication** → **URL Configuration**
2. Set **Site URL** to your production domain:
   ```
   https://iskabookingportal.netlify.app
   ```

3. Set **Redirect URLs** to include:
   ```
   https://iskabookingportal.netlify.app/**
   https://iskabookingportal.netlify.app/portal/**
   https://iskabookingportal.netlify.app/partner/**
   https://iskabookingportal.netlify.app/admin/**
   ```

4. **Save changes**

**This will fix password reset emails immediately!**

---

## 📋 Complete Supabase Secrets Checklist

Run these commands to set all production URLs:

```bash
# Set production portal URL (used in emails, notifications)
supabase secrets set PORTAL_URL=https://portal.urbanhub.uk

# DocuSign return URL (where users land after signing)
supabase secrets set DOCUSIGN_SIGNING_RETURN_URL=https://portal.urbanhub.uk/portal

# Email from address (must be verified in Resend)
supabase secrets set RESEND_FROM_EMAIL=noreply@send.portal.urbanhub.uk

# Staff notification email
supabase secrets set NOTIFICATIONS_STAFF_EMAIL=admin@urbanhub.uk
supabase secrets set NOTIFICATIONS_FROM_EMAIL=Urban Hub <noreply@send.portal.urbanhub.uk>
```

---

## 🔧 Edge Functions That Need URL Updates

### 1. send-bulk-message (Line 339, 377)

Currently constructs URLs from `SUPABASE_URL`. Needs `PORTAL_URL` secret.

**Current code:**
```typescript
const portalUrl = `${Deno.env.get("SUPABASE_URL")?.replace("/rest/v1", "") || ""}/portal`;
```

**Should use:**
```typescript
const portalUrl = Deno.env.get("PORTAL_URL") || "https://portal.urbanhub.uk";
```

### 2. send-transactional-email

May need portal URL updates.

### 3. docusign-recipient-view (Line 24)

Currently defaults to production URL, but should use secret:
```typescript
Deno.env.get("DOCUSIGN_SIGNING_RETURN_URL") ?? "https://portal.urbanhub.uk/portal"
```

---

## 🚀 Quick Fix Commands

Run these **RIGHT NOW** to fix password reset emails:

```bash
# 1. Set portal URL secret
supabase secrets set PORTAL_URL=https://iskabookingportal.netlify.app

# 2. Set DocuSign return URL
supabase secrets set DOCUSIGN_SIGNING_RETURN_URL=https://iskabookingportal.netlify.app/portal

# 3. Redeploy edge functions (to pick up new secrets)
supabase functions deploy send-bulk-message
supabase functions deploy send-transactional-email
supabase functions deploy docusign-recipient-view
```

**Then:**
1. Go to Supabase Dashboard → Authentication → URL Configuration
2. Set Site URL to: `https://portal.urbanhub.uk`
3. Add redirect URLs as shown above
4. Save

---

## 📝 All Production URLs to Configure

### Supabase Dashboard Settings

1. **Authentication → URL Configuration:**
   - Site URL: `https://iskabookingportal.netlify.app`
   - Redirect URLs: `https://iskabookingportal.netlify.app/**`

2. **Project Settings → API:**
   - Project URL: `https://your-project.supabase.co` (already correct)
   - Anon key: (keep existing)
   - Service role key: (keep existing)

### Supabase Edge Function Secrets

Set these via CLI or Dashboard:

```bash
# Portal/Frontend URL (for emails, links)
supabase secrets set PORTAL_URL=https://iskabookingportal.netlify.app

# DocuSign return URL
supabase secrets set DOCUSIGN_SIGNING_RETURN_URL=https://iskabookingportal.netlify.app/portal

# Email settings
supabase secrets set RESEND_FROM_EMAIL=noreply@send.portal.urbanhub.uk
supabase secrets set NOTIFICATIONS_STAFF_EMAIL=admin@urbanhub.uk
supabase secrets set NOTIFICATIONS_FROM_EMAIL=Urban Hub <noreply@send.portal.urbanhub.uk>
```

### Netlify Environment Variables

Set these in Netlify Dashboard → Site settings → Environment variables:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_... (production key)
VITE_SENTRY_DSN=... (if using Sentry)
```

---

## 🔍 Where URLs Are Used

### Password Reset Emails
- **Source:** Supabase Auth (uses Site URL from Dashboard)
- **Fix:** Set Site URL in Supabase Dashboard → Authentication

### Email Templates (portal_url variable)
- **Source:** `send-bulk-message` edge function
- **Current:** Constructs from `SUPABASE_URL`
- **Fix:** Use `PORTAL_URL` secret instead

### DocuSign Return URLs
- **Source:** `docusign-recipient-view` edge function
- **Current:** Has production default but should use secret
- **Fix:** Set `DOCUSIGN_SIGNING_RETURN_URL` secret

### Notification Links
- **Source:** Email templates and bulk messages
- **Fix:** Ensure `PORTAL_URL` secret is set

---

## ✅ Verification Checklist

After making changes:

- [ ] Supabase Auth Site URL set to production domain
- [ ] Supabase Auth Redirect URLs include production domain
- [ ] `PORTAL_URL` secret set in Supabase
- [ ] `DOCUSIGN_SIGNING_RETURN_URL` secret set
- [ ] Edge functions redeployed
- [ ] Test password reset email (should show `https://iskabookingportal.netlify.app`)
- [ ] Test partner account creation (password reset should work)
- [ ] Test DocuSign signing (return URL should be correct)

---

## 🧪 Test Password Reset

1. Go to Admin → Partners
2. Create a partner account
3. Check the password reset email
4. Verify the link points to `https://iskabookingportal.netlify.app` (not localhost)
5. Click the link and verify it works

---

**Last Updated:** 2025-11-20  
**Status:** Production configuration required

