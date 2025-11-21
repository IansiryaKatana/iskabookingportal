# Urban Hub Booking Portal - Deployment Guide

This guide covers the complete deployment process for the Urban Hub Booking Portal from development to production.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Database Migrations](#database-migrations)
4. [Edge Functions Deployment](#edge-functions-deployment)
5. [Frontend Deployment](#frontend-deployment)
6. [Scheduled Jobs Configuration](#scheduled-jobs-configuration)
7. [Post-Deployment Checklist](#post-deployment-checklist)
8. [Monitoring Setup](#monitoring-setup)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Accounts & Services

- ✅ **Supabase Account** - Database, Auth, Storage, Edge Functions
- ✅ **Stripe Account** - Payment processing
- ✅ **DocuSign Account** - Document signing
- ✅ **Resend Account** - Email delivery
- ✅ **GitHub Account** - Version control (if using CI/CD)
- ⚠️ **Sentry Account** (Optional) - Error tracking

### Required Tools

- Node.js 18+ and npm
- Supabase CLI (`npm install -g supabase`)
- Git

---

## Environment Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd "Urban Hub Booking Portal"
npm install
```

### 2. Configure Environment Variables

#### Frontend (.env.local)

Copy `.env.example` to `.env.local` and fill in values:

```bash
cp .env.example .env.local
```

**Required Frontend Variables:**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_STRIPE_PUBLISHABLE_KEY`
- `VITE_SENTRY_DSN` (optional)

#### Supabase Edge Functions Secrets

Set secrets via Supabase Dashboard or CLI:

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Set secrets
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
supabase secrets set DOCUSIGN_CLIENT_ID=your-client-id
supabase secrets set DOCUSIGN_USER_ID=your-user-id
supabase secrets set DOCUSIGN_ACCOUNT_ID=your-account-id
supabase secrets set DOCUSIGN_PRIVATE_KEY="your-private-key"
supabase secrets set DOCUSIGN_TENANCY_TEMPLATE_ID=your-template-id
supabase secrets set DOCUSIGN_GUARANTOR_TEMPLATE_ID=your-template-id
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set RESEND_FROM_EMAIL=noreply@send.portal.urbanhub.uk
supabase secrets set NOTIFICATIONS_STAFF_EMAIL=admin@urbanhub.uk
```

**See `.env.example` for complete list of required variables.**

---

## Database Migrations

### 1. Run Migrations

All migrations are in `supabase/migrations/`. Run them in order:

```bash
# Using Supabase CLI (recommended)
supabase db push

# Or manually via Supabase Dashboard > SQL Editor
# Run each migration file in chronological order
```

### 2. Verify Migrations

```sql
-- Check migration history
SELECT * FROM supabase_migrations.schema_migrations 
ORDER BY version DESC;

-- Verify critical tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'academic_years', 'studio_grades', 'contracts', 
  'student_applications', 'profiles'
);
```

### 3. Enable pg_cron (Optional - Requires Superuser)

**⚠️ Important:** pg_cron requires superuser privileges. Most Supabase projects don't have superuser access.

If you have superuser access and want to use pg_cron:

```sql
-- Enable extension (requires superuser - usually not available)
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

**However, most users should use external cron service instead** (see Scheduled Jobs section below).

The migration `20251120_setup_cron_jobs.sql` will:
- ✅ Check if pg_cron is available
- ✅ Schedule the job if available
- ✅ Skip gracefully if not available (no error)
- ✅ Provide helpful messages

**Recommendation:** Use GitHub Actions cron (see below) - it's easier and doesn't require superuser access.

---

## Edge Functions Deployment

### 1. Deploy All Functions

```bash
# Deploy all functions
supabase functions deploy

# Or deploy individually
supabase functions deploy create-payment
supabase functions deploy release-expired-reservations
# ... etc
```

### 2. Verify Deployment

```bash
# List deployed functions
supabase functions list

# Test a function
supabase functions invoke get-publishable-key
```

### 3. Configure Webhooks

#### Stripe Webhook

1. Go to Stripe Dashboard > Developers > Webhooks
2. Add endpoint: `https://your-project.supabase.co/functions/v1/stripe-webhook`
3. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
4. Copy webhook signing secret to Supabase secrets

#### DocuSign Webhook (if applicable)

Configure DocuSign webhooks for envelope status updates.

---

## Frontend Deployment

### 1. Build for Production

```bash
npm run build
```

This creates optimized production build in `dist/` directory.

### 2. Deploy to Hosting Provider

#### Netlify (Recommended)

**Option 1: Netlify CLI**

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Login
netlify login

# Initialize (first time only)
netlify init

# Deploy
netlify deploy --prod
```

**Option 2: Netlify Dashboard**

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Click "Add new site" → "Import an existing project"
3. Connect your GitHub repository
4. Configure build settings:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Base directory:** (leave empty)
5. Add environment variables (all `VITE_*` variables)
6. Click "Deploy site"

**Netlify Configuration:**
- Framework Preset: Vite (auto-detected)
- Build Command: `npm run build`
- Publish Directory: `dist`
- Environment Variables: Add all `VITE_*` variables in Site settings → Environment variables

**Netlify Configuration File (`netlify.toml`):**
Create `netlify.toml` in project root (optional but recommended):

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[build.environment]
  NODE_VERSION = "18"
```

#### Vercel (Alternative)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

**Vercel Configuration:**
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment Variables: Add all `VITE_*` variables

#### Other Providers

Upload `dist/` directory to your hosting provider (AWS S3, Azure, etc.).

### 3. Configure Custom Domain

1. Add custom domain in hosting provider
2. Configure DNS records
3. Update CORS settings in Supabase if needed

---

## Scheduled Jobs Configuration

### Option 1: Supabase pg_cron (If Available)

If you have superuser access:

```sql
-- Already configured in migration
-- Runs every 15 minutes automatically
SELECT * FROM cron.job WHERE jobname = 'release-expired-reservations';
```

### Option 2: External Cron Service (Recommended)

#### GitHub Actions

Create `.github/workflows/cron-jobs.yml`:

```yaml
name: Release Expired Reservations

on:
  schedule:
    - cron: '*/15 * * * *' # Every 15 minutes
  workflow_dispatch: # Manual trigger

jobs:
  release-reservations:
    runs-on: ubuntu-latest
    steps:
      - name: Call Edge Function
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json" \
            https://your-project.supabase.co/functions/v1/release-expired-reservations
```

#### Netlify Scheduled Functions (Alternative)

Netlify doesn't have built-in cron, but you can use:
1. **GitHub Actions** (Recommended - already configured)
2. **External cron service** (cron-job.org, EasyCron, etc.)
3. **Netlify Functions with external trigger**

For external cron service, create a simple endpoint or use the GitHub Actions workflow (`.github/workflows/cron-jobs.yml`) which is already set up.

---

## Post-Deployment Checklist

### Critical Checks

- [ ] All environment variables configured
- [ ] Database migrations completed
- [ ] Edge functions deployed and tested
- [ ] Frontend deployed and accessible
- [ ] Scheduled jobs configured
- [ ] Stripe webhook configured
- [ ] DocuSign integration tested
- [ ] Email delivery tested
- [ ] Error tracking configured (Sentry)

### Functional Tests

- [ ] User registration/login works
- [ ] Studio catalog displays correctly
- [ ] Application wizard functions properly
- [ ] Payment processing works (test mode)
- [ ] Document upload works
- [ ] Email notifications sent
- [ ] Admin portal accessible
- [ ] Partner portal accessible

### Security Checks

- [ ] CORS configured for production domain
- [ ] RLS policies active and tested
- [ ] Service role key not exposed
- [ ] HTTPS enabled
- [ ] Environment variables secured

### Performance Checks

- [ ] Page load times acceptable
- [ ] Images optimized
- [ ] Database queries performant
- [ ] Edge functions respond quickly

---

## Monitoring Setup

### 1. Sentry Error Tracking

#### Frontend Integration

Sentry is integrated via `src/utils/sentry.ts` (if configured).

Set `VITE_SENTRY_DSN` in environment variables.

#### Edge Functions Integration

Add Sentry to edge functions if needed (see Sentry Deno SDK).

### 2. Supabase Monitoring

- Monitor edge function logs in Supabase Dashboard
- Set up alerts for function failures
- Monitor database performance

### 3. Uptime Monitoring

Use services like:
- UptimeRobot
- Pingdom
- StatusCake

Monitor:
- Frontend URL
- Critical edge functions
- Database connectivity

---

## Troubleshooting

### Common Issues

#### Edge Functions Not Deploying

```bash
# Check Supabase CLI version
supabase --version

# Re-authenticate
supabase login

# Check project link
supabase projects list
```

#### Environment Variables Not Working

- Frontend: Ensure `VITE_` prefix
- Edge Functions: Set via `supabase secrets set`
- Restart dev server after changes

#### Database Connection Issues

- Verify `SUPABASE_URL` is correct
- Check RLS policies
- Verify service role key

#### Scheduled Jobs Not Running

- Check cron configuration
- Verify edge function is accessible
- Check logs for errors

### Getting Help

1. Check Supabase Dashboard logs
2. Review edge function logs
3. Check browser console for frontend errors
4. Review this documentation
5. Check `COMPREHENSIVE_SYSTEM_ANALYSIS.md` for known issues

---

## Production Best Practices

1. **Never commit `.env.local`** to version control
2. **Use separate Supabase projects** for staging/production
3. **Enable database backups** in Supabase Dashboard
4. **Monitor error rates** daily
5. **Review audit logs** regularly
6. **Test payment flows** in test mode before going live
7. **Set up alerts** for critical failures
8. **Keep dependencies updated**
9. **Regular security audits**
10. **Document all customizations**

---

## Rollback Procedure

If deployment fails:

1. **Frontend:** Revert to previous deployment in hosting provider
2. **Edge Functions:** Deploy previous version
   ```bash
   supabase functions deploy <function-name> --version <previous-version>
   ```
3. **Database:** Restore from backup if needed
4. **Environment:** Revert environment variable changes

---

## Support

For issues or questions:
- Review `COMPREHENSIVE_SYSTEM_ANALYSIS.md`
- Check `docs/architecture-spec.md`
- Review Supabase/Stripe/DocuSign documentation

---

**Last Updated:** 2025-11-20

