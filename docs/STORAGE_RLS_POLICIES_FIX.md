# Storage RLS Policies Fix - Document Preview

## Issue

Staff users were unable to preview documents in the Application Detail page. The error was:
```
StorageApiError: Object not found
```

## Root Cause

The storage RLS policy for staff document access used a single `FOR ALL` policy that didn't explicitly grant SELECT permissions needed for `createSignedUrl()`. Additionally, the policy relied on `is_staff()` function which could cause RLS recursion issues.

## Solution

**Migration**: `20251212_fix_staff_documents_storage_access.sql`

Replaced the single "Staff manage documents" policy with separate, explicit policies:

1. **SELECT Policy** - For viewing/downloading documents (required for `createSignedUrl`)
2. **INSERT Policy** - For uploading documents
3. **UPDATE Policy** - For updating documents
4. **DELETE Policy** - For deleting documents

### Key Changes

1. **Explicit SELECT Permission**: The SELECT policy ensures staff can use `createSignedUrl()` to generate preview links
2. **Direct Role Check**: Instead of using `is_staff()`, the policies use direct role checks to avoid RLS recursion:
   ```sql
   EXISTS (
     SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.role IN ('staff', 'superadmin')
   )
   ```
3. **Separate Policies**: Each operation (SELECT, INSERT, UPDATE, DELETE) has its own policy for better control and debugging

## Storage Policies Structure

### Documents Bucket Policies

#### Students
- **Students upload documents** (INSERT): Students can upload to their own folder (`{user_id}/...`)
- **Students view documents** (SELECT): Students can view their own documents

#### Staff
- **Staff view documents** (SELECT): Staff can view all documents (enables preview functionality)
- **Staff upload documents** (INSERT): Staff can upload documents
- **Staff update documents** (UPDATE): Staff can update documents
- **Staff delete documents** (DELETE): Staff can delete documents

## Verification

After applying the migration:

1. Log in as a staff user
2. Navigate to `/admin/applications/{id}`
3. Click "Preview" on any document
4. The document should open in a new tab without errors

## Related Files

- Migration: `supabase/migrations/20251212_fix_staff_documents_storage_access.sql`
- Original policies: `supabase/migrations/20250313_documents_storage_policies.sql`
- Application Detail component: `src/pages/admin/ApplicationDetail.tsx`

## Date Fixed

December 12, 2025

