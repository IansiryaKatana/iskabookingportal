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

## Notes

- **Bucket must be Private**: Even though you might want public access, set buckets to Private for RLS policies to work correctly
- **Policies must be created manually**: Storage policies cannot be created via migrations due to permission restrictions
- **Path format**: 
  - Maintenance images: `{user_id}/{uuid}.{ext}`
  - Expense receipts: `{academic_year_id}/{category}/{uuid}.{ext}`

