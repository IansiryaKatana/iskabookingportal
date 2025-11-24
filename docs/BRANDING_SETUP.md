# Branding System Setup Guide

## Database Migration

The branding system migration has been created. Run it with:

```bash
npx supabase migration up
```

## Storage Policies Setup

**IMPORTANT**: Storage policies for the `branding` bucket must be created manually in the Supabase Dashboard due to storage.objects table permissions.

### Steps to Create Storage Policies:

1. Go to **Supabase Dashboard** > **Storage** > **Policies**
2. Select the `branding` bucket
3. Create the following policies:

#### 1. Public Read Access
- **Policy Name**: `Public read branding assets`
- **Allowed Operation**: SELECT
- **Policy Definition**:
  ```sql
  bucket_id = 'branding'
  ```

#### 2. Staff Upload Access
- **Policy Name**: `Staff can upload branding assets`
- **Allowed Operation**: INSERT
- **Policy Definition**:
  ```sql
  bucket_id = 'branding' AND public.is_staff()
  ```

#### 3. Staff Update Access
- **Policy Name**: `Staff can update branding assets`
- **Allowed Operation**: UPDATE
- **Policy Definition**:
  ```sql
  bucket_id = 'branding' AND public.is_staff()
  ```

#### 4. Staff Delete Access
- **Policy Name**: `Staff can delete branding assets`
- **Allowed Operation**: DELETE
- **Policy Definition**:
  ```sql
  bucket_id = 'branding' AND public.is_staff()
  ```

### Alternative: Using Supabase CLI

If you prefer using the CLI, you can create these policies using the Supabase storage admin commands or by creating a migration that uses the service role.

## Verification

After setting up the storage policies:

1. Log in as a staff user
2. Navigate to `/admin/branding`
3. Try uploading a logo or favicon
4. Verify the upload succeeds without RLS errors

## Troubleshooting

### Error: "new row violates row-level security policy"

This means the storage policies haven't been created yet. Follow the steps above to create them.

### Error: "ImageIcon is not defined"

This has been fixed by using `Image` directly instead of aliasing. If you still see this error, clear your build cache and restart the dev server.

### Error: "Failed to load resource: 404"

This means the branding_settings table hasn't been created. Run the migration:

```bash
npx supabase migration up
```

