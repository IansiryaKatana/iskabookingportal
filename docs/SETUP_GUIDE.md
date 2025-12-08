# Setup Guide - STUCOMMS Booking Portal

This guide will help you set up the STUCOMMS Booking Portal from scratch.

## Prerequisites

1. **Node.js** (v18 or higher)
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify installation: `node --version`

2. **npm** (comes with Node.js)
   - Verify installation: `npm --version`

3. **Supabase Account**
   - Sign up at [supabase.com](https://supabase.com)
   - Create a new project
   - Note your project URL and API keys

4. **Supabase CLI** (optional, for local development)
   ```bash
   npm install -g supabase
   ```

5. **Git** (for cloning the repository)
   - Download from [git-scm.com](https://git-scm.com/)

## Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd "STUCOMMS Booking Portal"
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages including:
- React and related libraries
- Supabase client
- Stripe integration
- UI components (shadcn/ui)
- Development tools

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe Configuration (optional for development)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Sentry Configuration (optional)
VITE_SENTRY_DSN=your-sentry-dsn
```

**Where to find Supabase credentials:**
1. Go to your Supabase project dashboard
2. Navigate to Settings → API
3. Copy the Project URL and anon/public key
4. Copy the service_role key (keep this secret!)

### 4. Set Up Database

#### Option A: Automated Setup (Recommended)

**Linux/Mac:**
```bash
bash scripts/setup-database.sh
```

**Windows (PowerShell):**
```powershell
.\scripts\setup-database.ps1
```

#### Option B: Manual Setup

1. **Link to Supabase project:**
   ```bash
   npx supabase link --project-ref your-project-ref
   ```
   Find your project ref in the Supabase dashboard URL: `https://supabase.com/dashboard/project/[PROJECT_REF]`

2. **Apply database migrations:**
   ```bash
   npx supabase db push
   ```
   This applies all 104+ migrations in chronological order.

3. **Generate TypeScript types:**
   ```bash
   npx supabase gen types typescript --linked > src/integrations/supabase/types.generated.ts
   ```

4. **Seed initial data (optional):**
   ```bash
   npm run seed
   ```
   This creates:
   - Academic year (2026/2027)
   - Studio grades (Silver, Gold, Platinum, Rhodium, Rhodium Plus)
   - Payment plans (3, 4, 10 instalments)
   - Contracts for each grade
   - Studios from `studios-data.csv`

### 5. Configure Storage Buckets

In Supabase Dashboard → Storage:

1. **Create/Verify Buckets:**
   - `studio-media` (public)
   - `documents` (private)
   - `contracts` (private)
   - `branding` (public)

2. **Set Storage Policies:**
   - **studio-media**: Public read, staff full access
   - **documents**: Students can read/write own documents, staff full access
   - **contracts**: Staff full access
   - **branding**: Public read, staff full access

### 6. Configure Integrations

#### Stripe (Optional for Development)

1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Get your test API keys from Stripe Dashboard
3. Add to `.env.local`:
   ```env
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```
4. Set webhook endpoint in Stripe Dashboard (for production)

#### DocuSign (Optional for Development)

1. Create DocuSign developer account
2. Create an integration key
3. Set secrets in Supabase:
   ```bash
   supabase secrets set DOCUSIGN_CLIENT_ID=your-client-id
   supabase secrets set DOCUSIGN_USER_ID=your-user-id
   supabase secrets set DOCUSIGN_ACCOUNT_ID=your-account-id
   supabase secrets set DOCUSIGN_PRIVATE_KEY="your-private-key"
   supabase secrets set DOCUSIGN_AUTH_SERVER=https://account-d.docusign.com
   supabase secrets set DOCUSIGN_BASE_URL=https://demo.docusign.net/restapi
   supabase secrets set DOCUSIGN_TENANCY_TEMPLATE_ID=your-template-id
   supabase secrets set DOCUSIGN_GUARANTOR_TEMPLATE_ID=your-template-id
   ```

### 7. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### 8. Create Initial Admin User

1. Go to `http://localhost:5173/admin/login`
2. Click "Sign up" or use Supabase Auth
3. After creating account, update your profile role in Supabase:
   ```sql
   UPDATE profiles 
   SET role = 'superadmin' 
   WHERE id = 'your-user-id';
   ```

Or use Supabase Dashboard → Authentication → Users → Edit user → User Metadata → Add `role: superadmin`

## Verification Checklist

- [ ] Dependencies installed (`npm install` completed)
- [ ] Environment variables configured (`.env.local` exists)
- [ ] Database migrations applied (check Supabase Dashboard → Database)
- [ ] TypeScript types generated (`types.generated.ts` exists)
- [ ] Storage buckets created and policies set
- [ ] Development server runs (`npm run dev` works)
- [ ] Can access admin portal (`/admin/login`)
- [ ] Can access student portal (`/portal/login`)
- [ ] Can access public pages (`/`)

## Troubleshooting

### Database Connection Issues

**Problem**: Cannot connect to Supabase
- **Solution**: Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`
- Check Supabase project is active in dashboard

### Migration Errors

**Problem**: Migrations fail to apply
- **Solution**: Check migration order (should be chronological)
- Verify you have proper permissions in Supabase
- Check Supabase logs for specific error messages

### Type Generation Issues

**Problem**: TypeScript types not generating
- **Solution**: Ensure project is linked: `npx supabase link`
- Check Supabase CLI is up to date: `npm install -g supabase@latest`

### Storage Access Issues

**Problem**: Cannot upload files
- **Solution**: Verify storage buckets exist
- Check RLS policies are set correctly
- Verify user has proper role (student/staff)

### Authentication Issues

**Problem**: Cannot log in
- **Solution**: Check Supabase Auth is enabled
- Verify email confirmation settings in Supabase Dashboard
- Check browser console for errors

## Next Steps

1. **Read Documentation:**
   - [Complete System & Database Documentation](./SYSTEM_AND_DATABASE_COMPLETE.md)
   - [Database Schema Quick Reference](./DATABASE_SCHEMA_QUICK_REFERENCE.md)
   - [Architecture Specification](./architecture-spec.md)

2. **Configure Branding:**
   - Go to `/admin/branding`
   - Upload logo and favicon
   - Configure colors and fonts
   - Set up navigation items

3. **Set Up Academic Year:**
   - Go to `/admin/academic-years`
   - Create or activate academic year
   - Configure dates

4. **Add Studio Grades:**
   - Go to `/admin/studio-grades`
   - Create studio grades
   - Upload media (6 images + optional video)
   - Link amenities

5. **Create Contracts:**
   - Go to `/admin/contracts`
   - Create contracts for each grade
   - Link payment plans

6. **Test Student Flow:**
   - Create test student account
   - Complete application wizard
   - Test payment flow (use Stripe test cards)
   - Test document upload

## Production Deployment

See [Complete System & Database Documentation - Deployment Guide](./SYSTEM_AND_DATABASE_COMPLETE.md#deployment-guide) for production deployment instructions.

## Support

For issues or questions:
1. Check the documentation in `docs/` folder
2. Review Supabase logs
3. Check browser console for errors
4. Review application logs

---

**Last Updated**: January 2025

