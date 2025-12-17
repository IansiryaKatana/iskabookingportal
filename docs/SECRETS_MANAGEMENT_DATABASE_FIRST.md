# Secrets Management - Database-First Approach

## Overview

Secrets are now managed using a **database-first approach**, similar to how DocuSign templates work. Secrets are stored in the `credentials` table and Edge Functions read from the database with automatic fallback to environment variables.

## Key Benefits

✅ **Immediate Updates**: Changes take effect immediately - no sync needed  
✅ **Single Source of Truth**: Database is the primary source  
✅ **Safe Fallback**: Environment variables remain as backup  
✅ **Encrypted Storage**: Sensitive values are encrypted in database  
✅ **UI Management**: Full CRUD operations from admin interface  
✅ **Audit Trail**: All changes are logged  

## How It Works

### 1. Storage
- Secrets stored in `credentials` table
- Encrypted values stored in `encrypted_value` column (BYTEA)
- Plain values stored in `credential_value` column (for non-sensitive)

### 2. Edge Function Access
Edge Functions use the shared helper function:
```typescript
import { getCredential } from "../_shared/get-credential.ts";

const apiKey = await getCredential("RESEND_API_KEY", {
  supabase: supabaseAdmin,
  fallback: Deno.env.get("RESEND_API_KEY") ?? "",
});
```

**Priority Order:**
1. Database (`credentials` table)
2. Environment variable (`Deno.env.get()`)
3. Fallback value (if provided)

### 3. Caching
- Credentials are cached in memory for 5 minutes
- Reduces database queries
- Cache automatically expires

## Migration from Environment Variables

### Automatic Migration

Use the migration Edge Function to automatically migrate existing secrets:

1. Go to `/admin/secrets`
2. Click "Migrate from Env Vars"
3. The function will:
   - Read secrets from Edge Function environment variables
   - Insert them into the database (encrypted if sensitive)
   - Skip secrets that already exist

### Manual Migration

1. Go to Supabase Dashboard → Project Settings → Edge Functions → Secrets
2. Copy each secret value
3. Add them via the Secrets UI (`/admin/secrets`)

## Usage in Edge Functions

### Basic Usage

```typescript
import { getCredential } from "../_shared/get-credential.ts";

serve(async (req) => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Get single credential
  const apiKey = await getCredential("RESEND_API_KEY", {
    supabase: supabaseAdmin,
    fallback: Deno.env.get("RESEND_API_KEY") ?? "",
  });

  // Use the credential
  // ...
});
```

### Multiple Credentials

```typescript
import { getCredentials } from "../_shared/get-credential.ts";

const secrets = await getCredentials(
  ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  {
    supabase: supabaseAdmin,
  }
);

const stripeSecret = secrets.STRIPE_SECRET_KEY;
const webhookSecret = secrets.STRIPE_WEBHOOK_SECRET;
```

## Updated Edge Functions

The following Edge Functions have been updated to use database-first approach:

- ✅ `check-integration-status` - Stripe, DocuSign, Resend
- ✅ `stripe-webhook` - Stripe secrets, Resend API key
- ✅ `send-transactional-email` - Resend credentials

## Remaining Edge Functions

Other Edge Functions still use environment variables directly. They will continue to work (fallback), but you can gradually update them to use the database-first approach.

## Security

### Encryption
- Sensitive secrets are encrypted using `pgcrypto`
- Encryption key stored in Edge Function secrets: `SUPABASE_CREDENTIALS_ENCRYPTION_KEY`
- Decryption handled automatically by helper function

### Access Control
- Only `superadmin` role can access Secrets page
- RLS policies restrict database access
- All operations are audited

## Troubleshooting

### Import Error: Cannot find module `../_shared/get-credential.ts`

If Supabase doesn't support shared folders, you have two options:

1. **Copy the helper** into each Edge Function that needs it
2. **Use inline version** - Copy the helper code directly into each function

The helper is located at: `supabase/functions/_shared/get-credential.ts`

### Credential Not Found

1. Check if secret exists in database: `/admin/secrets`
2. Verify `sync_to_edge_function` is `true`
3. Check Edge Function logs for errors
4. Verify encryption key is set (if using encrypted secrets)

### Performance Concerns

- Credentials are cached for 5 minutes
- Database queries are fast (< 50ms typically)
- Cache can be disabled: `cache: false` in options

## Migration Checklist

- [x] Database migration created
- [x] Helper function created
- [x] Migration Edge Function created
- [x] Key Edge Functions updated
- [x] UI updated to reflect database-first approach
- [ ] Remaining Edge Functions updated (optional, gradual)
- [ ] Encryption key configured in production

## Next Steps

1. **Run migration**: `supabase db push`
2. **Deploy Edge Functions**: `supabase functions deploy`
3. **Migrate existing secrets**: Use "Migrate from Env Vars" button
4. **Test**: Verify Edge Functions work correctly
5. **Gradually update**: Update remaining Edge Functions as needed

## Notes

- Environment variables remain as fallback - **no breaking changes**
- Secrets can be managed entirely from UI
- Changes take effect immediately
- No manual sync required

