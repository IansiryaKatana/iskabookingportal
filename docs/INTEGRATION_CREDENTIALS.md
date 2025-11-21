# Integration Credentials Guide

This document explains where to find and configure credentials for third-party integrations.

## ⚠️ Security Note

**NEVER commit these values to version control!**
- Store them in Supabase Edge Function secrets
- Use environment variables for local development
- Never share them in chat, emails, or documentation

---

## DocuSign Credentials

### Where to Find Them

1. **DocuSign Dashboard** → **Admin** → **Integrations**
2. Create a new Integration Key (if you don't have one)
3. Generate RSA keypair for authentication

### Required Values

#### DOCUSIGN_CLIENT_ID
- **Location:** DocuSign Dashboard → Integrations → Your Integration → Integration Key
- **Format:** UUID (e.g., `12345678-1234-1234-1234-123456789abc`)
- **How to get:** Copy from Integration settings

#### DOCUSIGN_USER_ID
- **Location:** DocuSign Dashboard → Settings → My Account → API User ID
- **Format:** GUID (e.g., `12345678-1234-1234-1234-123456789abc`)
- **How to get:** Your DocuSign account's API User ID

#### DOCUSIGN_ACCOUNT_ID
- **Location:** DocuSign Dashboard → Settings → My Account → Account ID
- **Format:** Usually a number (e.g., `123456`)
- **How to get:** Your DocuSign account ID

#### DOCUSIGN_PRIVATE_KEY
- **Location:** Generated when you create RSA keypair
- **Format:** PKCS8 PEM format (starts with `-----BEGIN PRIVATE KEY-----`)
- **How to get:** 
  1. Create RSA keypair in DocuSign Integration settings
  2. Download the private key
  3. **Important:** Escape newlines as `\n` when setting as environment variable
  4. Example format for Supabase secrets:
     ```
     -----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n
     ```

#### DOCUSIGN_AUTH_SERVER
- **Demo/Development:** `https://account-d.docusign.com`
- **Production:** `https://account.docusign.com`
- **How to choose:** Use demo for testing, production for live

#### DOCUSIGN_BASE_URL
- **Demo/Development:** `https://demo.docusign.net/restapi`
- **Production:** `https://www.docusign.net/restapi`
- **How to choose:** Use demo for testing, production for live

#### DOCUSIGN_TENANCY_TEMPLATE_ID
- **Location:** DocuSign Dashboard → Templates → Your Tenancy Agreement Template → Template ID
- **Format:** GUID (e.g., `12345678-1234-1234-1234-123456789abc`)
- **How to get:** 
  1. Create or upload tenancy agreement template in DocuSign
  2. Copy the Template ID from template settings

#### DOCUSIGN_GUARANTOR_TEMPLATE_ID
- **Location:** DocuSign Dashboard → Templates → Your Guarantor Agreement Template → Template ID
- **Format:** GUID (e.g., `12345678-1234-1234-1234-123456789abc`)
- **How to get:** 
  1. Create or upload guarantor agreement template in DocuSign
  2. Copy the Template ID from template settings

#### DOCUSIGN_TENANCY_STUDENT_ROLE (Optional)
- **Default:** `"Tenant"`
- **Location:** Template settings → Roles → Role name
- **How to get:** Check your template's role names

#### DOCUSIGN_TENANCY_WITNESS_ROLE (Optional)
- **Default:** `"Witness"`
- **Location:** Template settings → Roles → Role name
- **How to get:** Check your template's role names

#### DOCUSIGN_GUARANTOR_ROLE (Optional)
- **Default:** `"Guarantor"`
- **Location:** Template settings → Roles → Role name
- **How to get:** Check your template's role names

#### DOCUSIGN_SIGNING_RETURN_URL (Optional)
- **Format:** Full URL (e.g., `https://portal.urbanhub.uk/portal`)
- **Purpose:** Where users are redirected after signing
- **How to set:** Your production portal URL

---

## Resend Credentials

### Where to Find Them

1. **Resend Dashboard** → **API Keys**
2. Create a new API key if needed
3. Verify your domain

### Required Values

#### RESEND_API_KEY
- **Location:** Resend Dashboard → API Keys → Create API Key
- **Format:** Starts with `re_` (e.g., `re_1234567890abcdef`)
- **How to get:** 
  1. Go to Resend Dashboard
  2. Navigate to API Keys
  3. Click "Create API Key"
  4. Copy the key (only shown once!)

#### RESEND_FROM_EMAIL
- **Location:** Resend Dashboard → Domains → Your Domain → Verified
- **Format:** Email address (e.g., `noreply@send.portal.urbanhub.uk`)
- **How to get:** 
  1. Add and verify your domain in Resend
  2. Use any email address from that domain
  3. Common formats:
     - `noreply@yourdomain.com`
     - `hello@yourdomain.com`
     - `notifications@yourdomain.com`

**Note:** The email domain must be verified in Resend before you can send from it.

---

## How to Set These Values

### For Supabase Edge Functions (Production)

```bash
# Using Supabase CLI
supabase secrets set DOCUSIGN_CLIENT_ID=your-client-id
supabase secrets set DOCUSIGN_USER_ID=your-user-id
supabase secrets set DOCUSIGN_ACCOUNT_ID=your-account-id
supabase secrets set DOCUSIGN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
supabase secrets set DOCUSIGN_AUTH_SERVER=https://account-d.docusign.com
supabase secrets set DOCUSIGN_BASE_URL=https://demo.docusign.net/restapi
supabase secrets set DOCUSIGN_TENANCY_TEMPLATE_ID=your-template-id
supabase secrets set DOCUSIGN_GUARANTOR_TEMPLATE_ID=your-template-id
supabase secrets set RESEND_API_KEY=re_your-api-key
supabase secrets set RESEND_FROM_EMAIL=noreply@yourdomain.com
```

### Via Supabase Dashboard

1. Go to **Project Settings** → **Edge Functions** → **Secrets**
2. Add each secret as a key-value pair
3. For `DOCUSIGN_PRIVATE_KEY`, paste the full key including `\n` for newlines

---

## Testing Your Configuration

### Test DocuSign Connection

The Settings page (`/admin/settings`) has an integration status checker that will verify:
- ✅ DocuSign credentials are valid
- ✅ Templates exist and are accessible
- ✅ Authentication works

### Test Resend Connection

The Settings page also checks:
- ✅ Resend API key is valid
- ✅ From email domain is verified
- ✅ Can send test emails

---

## Troubleshooting

### DocuSign Issues

**Error: "Invalid client_id"**
- Check that `DOCUSIGN_CLIENT_ID` matches your Integration Key exactly
- Ensure the integration is active in DocuSign

**Error: "Invalid private key"**
- Ensure newlines are escaped as `\n`
- Check that the full key is included (including BEGIN/END lines)
- Verify it's PKCS8 format

**Error: "Template not found"**
- Verify template IDs are correct
- Ensure templates are in the same DocuSign account
- Check template is not deleted or archived

### Resend Issues

**Error: "Domain not verified"**
- Verify your domain in Resend Dashboard
- Add required DNS records
- Wait for verification (can take up to 24 hours)

**Error: "Invalid API key"**
- Regenerate API key in Resend Dashboard
- Ensure key starts with `re_`
- Check key hasn't been revoked

---

## Security Best Practices

1. ✅ **Never commit** these values to Git
2. ✅ **Rotate keys** regularly (every 90 days recommended)
3. ✅ **Use different keys** for development and production
4. ✅ **Limit API key permissions** where possible
5. ✅ **Monitor usage** in both DocuSign and Resend dashboards
6. ✅ **Revoke keys** immediately if compromised

---

## Need Help?

1. **DocuSign Support:** https://support.docusign.com
2. **Resend Support:** https://resend.com/support
3. **Check integration status:** `/admin/settings` page
4. **Review logs:** Supabase Dashboard → Edge Functions → Logs

---

## Supabase Database Connection URL

### SUPABASE_DB_URL (Optional - Only for Scripts/Backups)

**What it is:** Direct PostgreSQL connection string (not the REST API URL)

**When needed:**
- Database backups (`pg_dump`)
- Direct SQL scripts (not using Supabase client)
- Migration tools that need direct DB access

**When NOT needed:**
- Normal application usage (use `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` instead)
- Edge functions (use `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)
- Frontend (use `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`)

### Where to Find It

1. **Supabase Dashboard** → **Project Settings** → **Database**
2. Look for **"Connection string"** or **"Connection pooling"**
3. You'll see two options:

#### Transaction Mode (Port 5432)
```
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
```

#### Session Mode (Port 6543)
```
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

**Format:**
```
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@[HOST]:[PORT]/postgres
```

**Example:**
```
postgresql://postgres.abcdefghijklmnop:your-password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

### How to Get the Password

1. **Supabase Dashboard** → **Project Settings** → **Database**
2. Click **"Reset database password"** (if you don't know it)
3. Copy the password shown (only shown once!)
4. Replace `[PASSWORD]` in the connection string

### Direct Connection (Without Pooler)

If you need a direct connection (not pooled):

1. **Supabase Dashboard** → **Project Settings** → **Database**
2. Look for **"Connection string"** → **"Direct connection"**
3. Format:
```
postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

### Usage Examples

#### For Backups (pg_dump)
```bash
pg_dump "postgresql://postgres.[PROJECT_REF]:[PASSWORD]@[HOST]:5432/postgres" > backup.sql
```

#### For Scripts
```javascript
// In .env.local (for local scripts only)
SUPABASE_DB_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@[HOST]:5432/postgres
```

#### For Node.js Scripts
```javascript
import pg from 'pg';
const client = new pg.Client(process.env.SUPABASE_DB_URL);
await client.connect();
```

### Security Notes

⚠️ **IMPORTANT:**
- **Never commit** this to version control
- **Never expose** in frontend code
- **Use connection pooling** when possible (port 5432)
- **Rotate password** if exposed
- **Use service role key** for most operations instead

---

**Last Updated:** 2025-11-20

