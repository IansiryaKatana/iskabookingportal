# Next Steps - Production Setup

The migration ran successfully! Here's what to do next:

## ✅ Completed
- [x] Database migration for cron jobs (ran successfully)
- [x] Helper function created

## 🔧 Immediate Next Steps

### 1. Set Up GitHub Actions Cron Job (Recommended)

Since `pg_cron` isn't available, use GitHub Actions for scheduled jobs:

#### Step 1: Configure GitHub Secrets
Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret

Add these secrets:
- `SUPABASE_URL` - Your Supabase project URL (e.g., `https://xxxxx.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

#### Step 2: Enable GitHub Actions
The workflow file (`.github/workflows/cron-jobs.yml`) is already created. GitHub Actions will automatically:
- Run every 15 minutes
- Call your edge function to release expired reservations

#### Step 3: Test the Workflow
1. Go to your GitHub repository → Actions tab
2. Find "Scheduled Jobs" workflow
3. Click "Run workflow" → "Run workflow" to test manually
4. Verify it completes successfully

### 2. Configure Environment Variables

#### Frontend (Local Development - .env.local)
Create `.env.local` file in project root:

```bash
# Copy from ENV_VARIABLES.md and fill in your values
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

#### Netlify (Production)
1. Go to Netlify Dashboard → Your site → Site settings → Environment variables
2. Add all `VITE_*` variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_STRIPE_PUBLISHABLE_KEY`
   - `VITE_SENTRY_DSN` (optional)

**Note:** Netlify will use these for production builds. Local `.env.local` is only for development.

#### Edge Functions (Supabase Secrets)
Set these in Supabase Dashboard → Edge Functions → Secrets:

```bash
# Required
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...

# DocuSign (if using)
DOCUSIGN_CLIENT_ID=...
DOCUSIGN_USER_ID=...
DOCUSIGN_ACCOUNT_ID=...
DOCUSIGN_PRIVATE_KEY=...
DOCUSIGN_TENANCY_TEMPLATE_ID=...
DOCUSIGN_GUARANTOR_TEMPLATE_ID=...

# Optional
VITE_SENTRY_DSN=https://...@sentry.io/... (if using Sentry)
```

See `ENV_VARIABLES.md` for complete list.

### 3. Deploy Edge Functions

```bash
# Install Supabase CLI if not already
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Deploy all functions
supabase functions deploy

# Or deploy individually
supabase functions deploy release-expired-reservations
```

### 4. Set Up CI/CD (Optional but Recommended)

#### Configure GitHub Secrets for CI/CD (Netlify)
Add these secrets to GitHub (Settings → Secrets → Actions):
- `NETLIFY_AUTH_TOKEN` - Get from Netlify Dashboard → User settings → Applications → New access token
- `NETLIFY_SITE_ID` - Get from Netlify Dashboard → Site settings → General → Site details
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Your Supabase anon key
- `VITE_STRIPE_PUBLISHABLE_KEY` - Your Stripe publishable key
- `VITE_SENTRY_DSN` - (Optional) Your Sentry DSN

The CI/CD workflow (`.github/workflows/ci.yml`) will automatically:
- Lint code on every push
- Run tests
- Build the application
- Deploy to Netlify production (on main branch)

**To get Netlify tokens:**
1. Go to Netlify Dashboard → User settings → Applications
2. Click "New access token"
3. Copy the token → Add to GitHub secrets as `NETLIFY_AUTH_TOKEN`
4. Go to Site settings → General → Site details
5. Copy Site ID → Add to GitHub secrets as `NETLIFY_SITE_ID`

### 5. Test the System

#### Test Scheduled Job
1. Create a test reservation that expires soon
2. Wait for cron job to run (or trigger manually in GitHub Actions)
3. Verify reservation is released

#### Test Edge Function Directly
```bash
# Test the release-expired-reservations function
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "apikey: YOUR_SERVICE_ROLE_KEY" \
  "https://your-project.supabase.co/functions/v1/release-expired-reservations"
```

### 6. Set Up Monitoring (Optional)

#### Sentry Error Tracking
1. Create account at sentry.io
2. Create a new project (React)
3. Copy the DSN
4. Add to `.env.local`: `VITE_SENTRY_DSN=https://...@sentry.io/...`
5. Restart dev server

#### Uptime Monitoring
Set up monitoring for:
- Frontend URL
- Critical edge functions
- Database connectivity

## 📋 Pre-Production Checklist

Before going live, complete `PRODUCTION_CHECKLIST.md`:

1. [ ] All environment variables configured
2. [ ] Edge functions deployed
3. [ ] GitHub Actions cron job configured and tested
4. [ ] CI/CD pipeline configured
5. [ ] Stripe webhook configured
6. [ ] DocuSign integration tested
7. [ ] Email delivery tested
8. [ ] Error tracking configured (Sentry)
9. [ ] Database backups enabled
10. [ ] All functional tests passed

## 🚀 Quick Start Commands

```bash
# 1. Install dependencies
npm install

# 2. Set up environment (local development)
# Create .env.local file with your values (see ENV_VARIABLES.md)

# 3. Deploy edge functions
supabase functions deploy

# 4. Test locally
npm run dev

# 5. Build for production
npm run build

# 6. Run tests
npm test

# 7. Deploy to Netlify (manual)
netlify deploy --prod

# Or let GitHub Actions deploy automatically on push to main
```

## 📦 Netlify Deployment

### First-Time Setup

1. **Install Netlify CLI:**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify:**
   ```bash
   netlify login
   ```

3. **Initialize site:**
   ```bash
   netlify init
   ```
   - Choose "Create & configure a new site"
   - Follow prompts

4. **Configure in Netlify Dashboard:**
   - Site settings → Build & deploy
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Add environment variables (all `VITE_*` variables)

### Automatic Deployment (Recommended)

The `netlify.toml` file is already configured. Just:
1. Connect your GitHub repo to Netlify
2. Configure GitHub secrets (see CI/CD section above)
3. Push to `main` branch → Auto-deploys via GitHub Actions

### Manual Deployment

```bash
# Preview deployment
netlify deploy

# Production deployment
netlify deploy --prod
```

## 📚 Documentation Reference

- `DEPLOYMENT.md` - Complete deployment guide
- `PRODUCTION_CHECKLIST.md` - Pre-production checklist
- `ENV_VARIABLES.md` - All environment variables
- `COMPREHENSIVE_SYSTEM_ANALYSIS.md` - System analysis
- `docs/architecture-spec.md` - Architecture documentation

## 🆘 Need Help?

1. Check `DEPLOYMENT.md` for detailed instructions
2. Review `COMPREHENSIVE_SYSTEM_ANALYSIS.md` for known issues
3. Check Supabase Dashboard logs for edge function errors
4. Review GitHub Actions logs for cron job issues

---

**Priority Order:**
1. ✅ Set up GitHub Actions cron (5 minutes)
2. ✅ Configure environment variables (10 minutes)
3. ✅ Deploy edge functions (5 minutes)
4. ✅ Test scheduled job (5 minutes)
5. ✅ Set up CI/CD (optional, 10 minutes)

**Total Time:** ~35 minutes for critical setup

