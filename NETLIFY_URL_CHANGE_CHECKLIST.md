# Netlify URL Change Checklist

If you change your Netlify project URL, you need to update the following places:

## Summary
**Total places to update: 4-5 locations**

---

## 1. Supabase Dashboard Configuration (External - Not in Code)

### 1.1 Supabase Auth Settings
- **Location**: Supabase Dashboard → Authentication → URL Configuration
- **What to update**:
  - **Site URL**: Update to your new Netlify URL
  - **Redirect URLs**: Add your new Netlify URL patterns:
    - `https://your-new-domain.netlify.app/*`
    - `https://your-new-domain.com/*` (if using custom domain)
  - **Email Templates**: Check if any email templates have hardcoded URLs (usually they use variables)

### 1.2 Supabase Edge Functions Environment Variables
- **Location**: Supabase Dashboard → Edge Functions → Environment Variables
- **What to check**: 
  - If you have any environment variables that reference the old URL
  - The `send-confirmation-email` function uses `SUPABASE_URL` which should be fine, but check for any custom redirect URLs

---

## 2. Code Files (In Repository)

### 2.1 `src/contexts/AuthContext.tsx` ✅ Uses `window.location.origin` (No change needed)
- **Line 238**: `emailRedirectTo: ${window.location.origin}/portal/reset-password`
- **Line 140**: `window.location.href = ${resetPath}...`
- **Status**: ✅ **No update needed** - Uses `window.location.origin` which automatically uses current domain

### 2.2 `supabase/functions/send-confirmation-email/index.ts` ⚠️ Partially dynamic
- **Line 120-121**: Uses `SUPABASE_URL` environment variable and constructs redirect URL
- **Line 121**: `const redirectUrl = redirect_to || ${baseUrl}/portal/reset-password`
- **Status**: ⚠️ **Check if needed** - Uses environment variable, but fallback uses Supabase URL (not Netlify URL)
- **Note**: The function receives `redirect_to` parameter from the frontend, which uses `window.location.origin`, so it should work automatically

### 2.3 `src/contexts/AuthContext.tsx` - Email function call
- **Line 277-280**: Calls `send-confirmation-email` function
- **Status**: ✅ **No update needed** - Passes `redirect_to` parameter which uses `window.location.origin`

---

## 3. Netlify Configuration

### 3.1 `netlify.toml`
- **Status**: ✅ **No update needed** - No hardcoded URLs in this file

### 3.2 Netlify Dashboard Settings
- **Location**: Netlify Dashboard → Site Settings → Domain Management
- **What to update**:
  - Update your custom domain if you have one
  - Update any environment variables in Netlify that reference the old URL

---

## 4. Environment Variables (If Any)

### 4.1 Netlify Environment Variables
- **Location**: Netlify Dashboard → Site Settings → Environment Variables
- **What to check**: 
  - Any variables like `VITE_APP_URL` or similar that might reference the old URL
  - Currently, the codebase doesn't seem to use such variables

### 4.2 Local `.env` files (Development only)
- **Status**: ✅ **No update needed** - These are for local development

---

## 5. External Services (If Configured)

### 5.1 Stripe (If using webhooks)
- **Location**: Stripe Dashboard → Developers → Webhooks
- **What to update**: Update webhook endpoint URLs if they point to your Netlify site

### 5.2 DocuSign (If configured)
- **Location**: DocuSign Admin → Integrations
- **What to update**: Update callback/redirect URLs if they point to your Netlify site

### 5.3 Other Third-Party Services
- Check any OAuth providers, webhook endpoints, or API integrations that reference your Netlify URL

---

## Quick Action Items

### ✅ Automatic (No Action Needed)
1. Frontend code uses `window.location.origin` - automatically adapts to new URL
2. Email redirects in AuthContext use dynamic URLs
3. `netlify.toml` has no hardcoded URLs

### ⚠️ Manual Updates Required
1. **Supabase Dashboard** → Authentication → URL Configuration:
   - Update Site URL
   - Add new Redirect URLs
   
2. **Supabase Dashboard** → Edge Functions → Environment Variables:
   - Check for any custom URL variables (if any)

3. **External Services** (if applicable):
   - Stripe webhooks
   - DocuSign callbacks
   - Other OAuth/webhook integrations

---

## Testing Checklist

After updating:
1. ✅ Test user registration - email confirmation links should work
2. ✅ Test password reset - reset links should work
3. ✅ Test OAuth sign-in (if configured) - should redirect correctly
4. ✅ Test email links - all email links should point to new domain
5. ✅ Test webhooks (if any) - should receive events at new URL

---

## Notes

- The codebase is **well-designed** for URL changes - most URLs are dynamic using `window.location.origin`
- The main manual work is in **Supabase Dashboard configuration**, not in code
- If you're using a custom domain, make sure DNS is properly configured
- Consider setting up URL redirects from old domain to new domain if you have existing users

