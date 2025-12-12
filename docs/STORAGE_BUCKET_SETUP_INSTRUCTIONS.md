# Storage Bucket Setup Instructions

## Maintenance Images Bucket

### Step 1: Create the Bucket
1. Go to Supabase Dashboard > Storage
2. Click "New bucket"
3. Name: `maintenance-images`
4. **IMPORTANT**: Set to **Private** (not Public) for RLS to work properly
5. Click "Create bucket"

### Step 2: Create Storage Policies
Run the SQL from `SETUP_STORAGE_POLICIES.sql` file in Supabase Dashboard > SQL Editor.

Alternatively, you can copy the entire contents of `SETUP_STORAGE_POLICIES.sql` and run it directly.

## Expense Receipts Bucket

### Step 1: Create the Bucket
1. Go to Supabase Dashboard > Storage
2. Click "New bucket"
3. Name: `expense-receipts`
4. Set to **Private**
5. Click "Create bucket"

### Step 2: Create Storage Policies
The expense receipts policies are included in `SETUP_STORAGE_POLICIES.sql`. Run that file to create all policies at once.

## Documents Bucket

The `documents` bucket is already set up with RLS policies via migrations:
- **Migration**: `20250313_documents_storage_policies.sql` (initial setup)
- **Migration**: `20251212_fix_staff_documents_storage_access.sql` (staff preview fix)

### Policies
- **Students**: Can upload and view their own documents (path: `{user_id}/{application_id}/...`)
- **Staff**: Can view, upload, update, and delete all documents (enables document preview in admin panel)

See `docs/STORAGE_RLS_POLICIES_FIX.md` for details on the staff access fix.

## Studio Media Bucket

The `studio-media` bucket is set up with RLS policies via migration:
- **Migration**: `20251212_fix_studio_media_storage_policies.sql`

### Policies
- **Public**: Can read/view all studio media images (for public studio grade pages)
- **Staff**: Can upload, update, and delete studio media images (for admin management)

### Path Format
- Studio media: `{studio_grade_slug}/{uuid}.{ext}` (e.g., `silver/f7f1b46d-57da-4f84-b51c-f941569d2e1b.jpg`)

### Usage
- Used for studio grade gallery images and hero images
- Images are publicly accessible for display on public studio grade pages
- Staff can manage images through the admin Studio Grades interface

## Notes

- **Bucket must be Private**: Even though you might want public access, set buckets to Private for RLS policies to work correctly
- **Policies via Migrations**: Documents bucket policies are created via migrations (unlike maintenance-images and expense-receipts)
- **Path format**: 
  - Documents: `{user_id}/{application_id}/{type}-{uuid}-{filename}`
  - Maintenance images: `{user_id}/{uuid}.{ext}`
  - Expense receipts: `{academic_year_id}/{category}/{uuid}.{ext}`

