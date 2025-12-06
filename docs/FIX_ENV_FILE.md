# Fix .env.local Parsing Error

**Error:** `failed to parse environment file: .env.local (unexpected character '/' in variable name)`

This happens when a URL or path in your `.env.local` file isn't properly formatted.

## Quick Fix Options

### Option 1: Deploy Without Env File Check (Temporary)

```bash
# Deploy functions without checking .env.local
supabase functions deploy send-bulk-message --no-verify-jwt
supabase functions deploy send-transactional-email --no-verify-jwt
supabase functions deploy docusign-recipient-view --no-verify-jwt
```

### Option 2: Fix .env.local File

The error means there's a line in `.env.local` with a `/` character that's being interpreted as part of a variable name.

**Common issues:**
1. **Unquoted URLs:**
   ```bash
   # ❌ WRONG
   PORTAL_URL=https://iskabookingportal.netlify.app
   
   # ✅ CORRECT (quotes optional but safer)
   PORTAL_URL=https://iskabookingportal.netlify.app
   ```

2. **URLs in comments:**
   ```bash
   # ❌ WRONG (if comment has special chars)
   # URL: https://example.com
   
   # ✅ CORRECT
   # URL https://example.com
   ```

3. **Malformed lines:**
   ```bash
   # ❌ WRONG
   https://example.com=value
   
   # ✅ CORRECT
   EXAMPLE_URL=https://example.com
   ```

**To fix:**
1. Open `.env.local` in a text editor
2. Look for lines with URLs that aren't properly formatted
3. Ensure all variable names are on the left side of `=`
4. Ensure all values (especially URLs) are properly formatted
5. Remove any lines that look like URLs without variable names

### Option 3: Use .env Instead

If `.env.local` is causing issues, you can:
1. Rename `.env.local` to `.env.local.backup`
2. Create a new `.env.local` with only the variables you need
3. Or use `.env` file instead

## Recommended: Fix and Deploy

1. **Check your `.env.local` file** for any malformed lines
2. **Fix the syntax** (see examples above)
3. **Deploy again:**
   ```bash
   supabase functions deploy send-bulk-message
   supabase functions deploy send-transactional-email
   supabase functions deploy docusign-recipient-view
   ```

## Note

Supabase functions use **secrets** (set via `supabase secrets set`), not `.env.local` files. The `.env.local` file is only used for local development.

If you're deploying to production, make sure you've set the secrets:
```bash
supabase secrets set PORTAL_URL=https://iskabookingportal.netlify.app
supabase secrets set DOCUSIGN_SIGNING_RETURN_URL=https://iskabookingportal.netlify.app/portal
```

The `.env.local` parsing error won't affect production deployment if you use secrets.

