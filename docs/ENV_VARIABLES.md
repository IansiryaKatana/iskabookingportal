# Environment Variables Reference

This document lists all environment variables required for the Urban Hub Booking Portal.

## Frontend Variables (VITE_ prefix required)

These variables are accessible in the browser and must be prefixed with `VITE_`.

### Supabase
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Supabase anon/public key

### Stripe
- `VITE_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key (starts with `pk_`). Optional for the student portal and booking panel: those pages load the key at runtime from the `get-publishable-key` Edge Function. The **Edge Function** must have `VITE_STRIPE_PUBLISHABLE_KEY` set in Supabase secrets so it can return the key; it must match the same Stripe mode (test/live) as `STRIPE_SECRET_KEY`.

### Sentry (Optional)
- `VITE_SENTRY_DSN` - Sentry DSN for error tracking
- `VITE_SENTRY_ENABLE_DEV` - Set to `true` to enable Sentry in development

## Backend Variables (Edge Functions)

These are set as Supabase Edge Function secrets, not in `.env` files.

### Supabase
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (NEVER expose in frontend)

### Supabase Database Connection (Optional - For Scripts/Backups Only)
- `SUPABASE_DB_URL` - Direct PostgreSQL connection string
  - **Format:** `postgresql://postgres.[PROJECT_REF]:[PASSWORD]@[HOST]:5432/postgres`
  - **Where to find:** Supabase Dashboard → Project Settings → Database → Connection string
  - **Example:** `postgresql://postgres.pzptocwdaqpczexlbajr:password@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`
  - **Only needed for:** Database backups (`pg_dump`), direct SQL scripts, migration tools
  - **NOT needed for:** Normal app usage (use `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` instead)

- `SUPABASE_DB_PASSWORD` - Database password (alternative to full URL)
  - **Where to find:** Supabase Dashboard → Project Settings → Database → Reset database password
  - **Used by:** `scripts/run-sql.mjs` to construct connection string

### Stripe
- `STRIPE_SECRET_KEY` - Stripe secret key (starts with `sk_`)
- `STRIPE_WEBHOOK_SECRET` - Webhook signing secret (starts with `whsec_`)

### DocuSign
- `DOCUSIGN_CLIENT_ID` - DocuSign integration key
- `DOCUSIGN_USER_ID` - DocuSign API user ID (GUID)
- `DOCUSIGN_ACCOUNT_ID` - DocuSign account ID
- `DOCUSIGN_PRIVATE_KEY` - PKCS8 PEM private key (newline-escaped)
- `DOCUSIGN_AUTH_SERVER` - Auth server URL (demo: `https://account-d.docusign.com`)
- `DOCUSIGN_BASE_URL` - Base API URL (demo: `https://demo.docusign.net/restapi`)
- `DOCUSIGN_TENANCY_TEMPLATE_ID` - Template ID for tenancy agreement
- `DOCUSIGN_GUARANTOR_TEMPLATE_ID` - Template ID for guarantor agreement
- `DOCUSIGN_TENANCY_STUDENT_ROLE` - Role name for student (default: "Tenant")
- `DOCUSIGN_TENANCY_WITNESS_ROLE` - Role name for witness (default: "Witness")
- `DOCUSIGN_GUARANTOR_ROLE` - Role name for guarantor (default: "Guarantor")
- `DOCUSIGN_SIGNING_RETURN_URL` - URL to redirect after signing (optional)

### Email (Resend)
- `RESEND_API_KEY` - Resend API key (starts with `re_`)
- `RESEND_FROM_EMAIL` - From email address (must be verified in Resend)

### Notifications
- `NOTIFICATIONS_STAFF_EMAIL` - Email for staff notifications
- `NOTIFICATIONS_FROM_EMAIL` - From email for notifications

## Setting Edge Function Secrets

### Via Supabase CLI
```bash
supabase secrets set KEY=value
```

### Via Supabase Dashboard
1. Go to Project Settings > Edge Functions > Secrets
2. Add each secret key-value pair

## Environment-Specific Values

### Development
- Use test/development keys for all services
- DocuSign: Use demo environment
- Stripe: Use test mode keys

### Production
- Use production keys for all services
- DocuSign: Use production environment
- Stripe: Use live mode keys
- Update CORS settings for production domain

## Security Notes

1. **Never commit `.env.local`** to version control
2. **Service role key** should NEVER be in frontend code
3. **Private keys** should be properly escaped (newlines as `\n`)
4. **Rotate keys** regularly, especially if exposed
5. **Use different keys** for development and production

## Validation

The application will work without optional variables (like Sentry), but will fail if required variables are missing.

Required for basic functionality:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (edge functions)

---

**Last Updated:** 2025-11-20

