# Database Migration Guide

This guide explains how to migrate your Supabase project to a new project using the export/import functionality.

## Overview

The export function creates a comprehensive JSON file containing:
- Database schema (tables, functions, views, enums, triggers, indexes, RLS policies, grants)
- Storage bucket configurations
- Edge functions metadata
- Required secrets checklist
- Step-by-step migration guide

**Important:** The export contains **schema and configuration only** - actual data is not included.

## Step 1: Export from Source Project

1. Log in to your **source** Supabase project as a superadmin
2. Navigate to **Admin Portal > Settings**
3. Scroll to the **Database Migration Export** section
4. Click **"Export Database for Migration"**
5. Confirm the export
6. The JSON file will download automatically (e.g., `supabase-export-2025-01-26.json`)

## Step 2: Create New Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click **"New Project"**
3. Fill in project details:
   - **Name**: Your project name
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Select your preferred region
4. Wait for the project to be created (usually 1-2 minutes)

## Step 3: Run Migrations

The database schema must be imported by running migrations. The export file is a reference - you still need to run your migrations.

### Option A: Using Supabase CLI (Recommended)

```bash
# Link to your new project
npx supabase link --project-ref your-new-project-ref

# Push all migrations
npx supabase db push

# Generate TypeScript types
npx supabase gen types typescript --linked > src/integrations/supabase/types.generated.ts
```

### Option B: Manual Migration

1. Go to **Supabase Dashboard > SQL Editor**
2. Open each migration file from `supabase/migrations/` in chronological order
3. Run them one by one

**Migration Order:**
- Start with `20250209_dynamic_portal_schema.sql` (foundational schema)
- Then run all other migrations in chronological order (by date prefix)

## Step 4: Import Storage Buckets

### Using the Import Function (Recommended)

1. Log in to your **new** Supabase project as a superadmin
2. Navigate to **Admin Portal > Settings**
3. Scroll to the **Database Migration Import** section
4. Upload your export JSON file
5. Click **"Import Database Configuration"**
6. This will create storage buckets automatically

### Manual Method

1. Go to **Supabase Dashboard > Storage**
2. For each bucket in the export file's `storage.buckets` array:
   - Click **"New bucket"**
   - Enter the bucket `id` and `name`
   - Set `public` setting as specified
   - Click **"Create bucket"**

## Step 5: Create Storage Policies

Storage policies must be created manually or via migrations. The export file documents all policies in `storage.policies`.

### Method 1: Via Supabase Dashboard

1. Go to **Supabase Dashboard > Storage > Policies**
2. Select each bucket
3. Create policies as documented in the export file

### Method 2: Via Migration

Create a new migration file with the storage policies from the export file.

## Step 6: Deploy Edge Functions

Edge function source code is in your repository at `supabase/functions/`.

```bash
# Deploy all functions
npx supabase functions deploy

# Or deploy individually
npx supabase functions deploy export-database
npx supabase functions deploy import-database
# ... etc
```

## Step 7: Configure Secrets

Secrets must be manually configured in the new project.

1. Go to **Supabase Dashboard > Settings > API**
2. Scroll to **"Secrets"** section
3. For each secret in the export file's `secrets.required_secrets` array:
   - Click **"Add new secret"**
   - Enter the secret name
   - Enter the secret value (from your source project)
   - Click **"Save"**

**Required Secrets:**
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `DOCUSIGN_CLIENT_ID`
- `DOCUSIGN_USER_ID`
- `DOCUSIGN_ACCOUNT_ID`
- `DOCUSIGN_BASE_URL`
- `DOCUSIGN_AUTH_SERVER`
- `DOCUSIGN_PRIVATE_KEY`
- `DOCUSIGN_TENANCY_TEMPLATE_ID`
- `DOCUSIGN_GUARANTOR_TEMPLATE_ID`
- `DOCUSIGN_TENANCY_STUDENT_ROLE`
- `DOCUSIGN_TENANCY_WITNESS_ROLE`
- `DOCUSIGN_GUARANTOR_ROLE`
- `RESEND_API_KEY`
- `SUPABASE_URL` (automatically set)
- `SUPABASE_SERVICE_ROLE_KEY` (automatically set)

## Step 8: Download Storage Files (Optional)

If you need to migrate actual files from storage buckets:

```bash
# Download all files from a bucket
npx supabase storage download <bucket-name> --project-ref <source-project-ref>

# Upload to new project
npx supabase storage upload <bucket-name> <local-path> --project-ref <new-project-ref>
```

Or use the Supabase Dashboard:
1. Go to **Storage** in source project
2. Download files manually
3. Upload to new project

## Step 9: Update Application Configuration

Update your application's environment variables to point to the new project:

```env
VITE_SUPABASE_URL=https://your-new-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-new-anon-key
```

## Step 10: Verify Migration

1. **Test Database Functions:**
   - Run a few test queries
   - Verify RLS policies are working
   - Check triggers are firing

2. **Test Integrations:**
   - Stripe: Process a test payment
   - DocuSign: Send a test envelope
   - Resend: Send a test email

3. **Test Edge Functions:**
   - Invoke a few edge functions
   - Check logs for errors

4. **Test Storage:**
   - Upload a test file
   - Verify download works
   - Check policies are enforced

## Troubleshooting

### Migration Errors

If migrations fail:
1. Check the error message
2. Verify you're running migrations in order
3. Some migrations may need to be adjusted for the new project
4. Check Supabase logs for detailed error messages

### RLS Policy Issues

If RLS policies aren't working:
1. Verify policies were created correctly
2. Check that `is_staff()` function exists
3. Ensure user roles are set correctly in `profiles` table

### Storage Issues

If storage buckets aren't accessible:
1. Verify buckets were created
2. Check storage policies are correct
3. Ensure policies match the export file

### Edge Function Errors

If edge functions fail:
1. Check function logs in Supabase Dashboard
2. Verify secrets are configured correctly
3. Ensure function code is deployed

## Important Notes

- **Data is NOT migrated** - Only schema and configuration
- **Storage files must be downloaded separately** if needed
- **Secrets must be manually configured** for security
- **Test thoroughly** before switching production traffic
- **Keep the export file** as a reference document

## Support

If you encounter issues:
1. Check the export file's `migration_guide` section
2. Review Supabase logs
3. Verify all steps were completed
4. Check that migrations ran successfully

