# Security Assessment Report

**Project:** STUCOMMS Booking Portal  
**Date:** December 18, 2025  
**Status:** Pre-Production Review

---

## ✅ COMPLETED FIXES

### 1. CORS Configuration (FIXED)
**Location:** `supabase/functions/_shared/cors.ts`

All Edge Functions now use restricted CORS with specific allowed domains:

```typescript
const ALLOWED_ORIGINS = [
  // Production
  "https://portal.urbanhub.uk",
  "https://www.portal.urbanhub.uk",
  // Netlify
  "https://portal.urbanhub.uk",
  "https://www.portal.urbanhub.uk",
  // Development
  "http://localhost:8080",
  "http://localhost:5173",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5173",
];
```

**To add a new domain:** Update the `ALLOWED_ORIGINS` array in `supabase/functions/_shared/cors.ts` and redeploy all functions.

---

## 🔴 CRITICAL ISSUES (Recommended Before Launch)

### 2. No Rate Limiting
**Issue:** No rate limiting found anywhere in the codebase.  
**Risk:** Vulnerable to brute force login attacks, API abuse, DDoS.  
**Fix:** Implement rate limiting at:
- Supabase Edge Functions level
- Login endpoints (max 5 attempts per IP per minute)
- Use Supabase's built-in rate limiting or implement via middleware

### 3. ✅ FIXED: Sensitive Data in Console Logs
**Issue:** `console.log` statements were present without environment guards.  
**Status:** All `console.log` statements are now wrapped with `import.meta.env.DEV` checks.  
**Result:** Debug logs only appear in development mode, not in production builds.

---

## 🟠 HIGH PRIORITY ISSUES

### 4. innerHTML Usage Without Sanitization
**Location:** 
- `src/pages/admin/BulkMessages.tsx:62`
- `src/pages/admin/TargetedMessages.tsx:98`

**Risk:** XSS vulnerability if template HTML contains malicious scripts.  
**Fix:** Install and use DOMPurify:
```bash
npm install dompurify @types/dompurify
```
```typescript
import DOMPurify from 'dompurify';
tempDiv.innerHTML = DOMPurify.sanitize(template.body_html);
```

### 5. dangerouslySetInnerHTML Usage
**Location:** `src/pages/admin/BulkMessages.tsx:453`  
**Risk:** XSS if preview content isn't properly sanitized.  
**Fix:** Sanitize before rendering:
```typescript
dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
```

### 6. Missing Password Strength Validation
**Location:** Login/Register forms  
**Issue:** Only validates minimum 6 characters.  
**Fix:** Add password strength requirements:
- Minimum 8 characters
- At least one uppercase letter
- At least one number
- At least one special character

---

## 🟡 MEDIUM PRIORITY ISSUES

### 7. Optimistic Permission Rendering
**Location:** `src/components/ProtectedRoute.tsx:118-121`  
**Issue:** Shows content before permission check completes.  
**Risk:** Brief exposure of unauthorized content.  
**Fix:** Show loading state until permission check completes.

### 8. Webhook Endpoints Without IP Whitelisting
**Location:** `supabase/functions/stripe-webhook/index.ts`, `docusign-webhook/index.ts`  
**Issue:** Webhooks verify signatures but don't whitelist IPs.  
**Fix:** Add IP whitelisting for webhook sources (Stripe IPs, DocuSign IPs).

---

## 🟢 LOW PRIORITY / RECOMMENDATIONS

### 10. Add Security Headers
Add these headers to your Netlify deployment (`netlify.toml` or `_headers` file):
```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com; frame-src https://js.stripe.com
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  X-XSS-Protection: 1; mode=block
  Referrer-Policy: strict-origin-when-cross-origin
```

### 11. Enable Supabase Security Features
Verify in Supabase Dashboard:
- ✅ Email confirmation enabled
- ✅ Password minimum length (recommend 8+)
- ✅ RLS policies on ALL tables
- ✅ API rate limiting enabled
- ✅ Captcha on auth forms (optional but recommended)

---

## 📋 PRE-LAUNCH SECURITY CHECKLIST

| Task | Priority | Status |
|------|----------|--------|
| Restrict CORS to specific domains | 🔴 Critical | ✅ Done |
| Implement rate limiting | 🔴 Critical | ❌ Pending |
| Remove/guard console.log statements | 🔴 Critical | ❌ Pending |
| Sanitize innerHTML with DOMPurify | 🟠 High | ❌ Pending |
| Add password strength validation | 🟠 High | ❌ Pending |
| Fix optimistic permission rendering | 🟡 Medium | ❌ Pending |
| Add security headers | 🟢 Low | ❌ Pending |
| Verify Supabase RLS policies | 🟢 Low | ⚠️ Verify |
| Enable Supabase rate limiting | 🟢 Low | ⚠️ Verify |

---

## 🔧 CORS MANAGEMENT

### Adding a New Domain
1. Edit `supabase/functions/_shared/cors.ts`
2. Add the new domain to `ALLOWED_ORIGINS` array
3. Deploy all functions: `supabase functions deploy --all`

### Current Allowed Origins
- `https://portal.urbanhub.uk`
- `https://www.portal.urbanhub.uk`
- `https://iskabookingportal.netlify.app`
- `https://www.iskabookingportal.netlify.app`
- `http://localhost:8080`
- `http://localhost:5173`
- `http://127.0.0.1:8080`
- `http://127.0.0.1:5173`

### Webhook Functions (Keep Wildcard CORS)
These functions are server-to-server and correctly use wildcard CORS:
- `stripe-webhook` - No CORS (correct)
- `docusign-webhook` - Wildcard CORS (correct for webhooks)

---

## 📝 Notes

- All 33 Edge Functions have been updated to use the shared CORS module
- Webhooks are excluded from CORS restrictions as they are server-to-server
- JWT authentication provides the primary security layer; CORS is defense-in-depth

