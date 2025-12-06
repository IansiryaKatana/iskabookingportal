# CORS Error Fix Instructions
**Date:** 2025-01-25  
**Issue:** All Supabase API calls blocked by CORS from `http://localhost:8080`

## Problem
```
Access to fetch at 'https://pzptocwdaqpczexlbajr.supabase.co/rest/v1/...' 
from origin 'http://localhost:8080' has been blocked by CORS policy: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Solution: Add CORS Origin in Supabase Dashboard

### Step-by-Step Instructions

1. **Go to Supabase Dashboard**
   - URL: https://supabase.com/dashboard/project/pzptocwdaqpczexlbajr
   - Or: https://supabase.com/dashboard → Select your project

2. **Navigate to API Settings**
   - Click **Settings** (gear icon) in left sidebar
   - Click **API** in the settings menu

3. **Add CORS Origin**
   - Find **"Additional Allowed Origins"** or **"CORS Origins"** section
   - Click **"Add new origin"** or **"+"** button
   - Enter: `http://localhost:8080`
   - Click **Save**

4. **Alternative: If using Supabase CLI**
   - Check if there's a local Supabase instance running
   - CORS might be configured in `supabase/config.toml`

### Expected Result
After adding the origin:
- ✅ CORS errors disappear
- ✅ Supabase API calls work
- ✅ Payment sync works
- ✅ All data loads correctly

### If CORS Setting Not Found
Some Supabase projects have CORS enabled by default for localhost. If you can't find the setting:
1. Check Supabase project status (might be paused/restricted)
2. Verify you're using the correct project
3. Contact Supabase support if the setting is missing

---

## About Other Console Messages

### CSP Violations (Harmless Warnings)
- **Source:** Stripe iframes trying to load Google Fonts
- **Impact:** None - payment functionality works fine
- **Action:** Can be ignored or fixed later with CSP headers

### Stripe Warnings (Informational)
- "appearance is not a recognized parameter" - Cosmetic only
- "Apple Pay/Google Pay requires HTTPS" - Only affects those payment methods
- "Domain not registered for Apple Pay" - Only affects Apple Pay

**These don't affect payment functionality.**

---

## Quick Test After Fix

1. Refresh the page
2. Check browser console - CORS errors should be gone
3. Verify data loads (applications, payments, etc.)
4. Test payment flow - should work normally

---

**Status:** ⚠️ Requires Supabase Dashboard Configuration


