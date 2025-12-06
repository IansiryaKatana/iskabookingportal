# Data Management Feature - Application Deletion

## Overview
A comprehensive data management system has been added to the Admin Settings page, allowing safe deletion of student applications and all related records during development and testing.

## Location
**Admin Settings Page** → `/admin/settings` → **Data Management** section

## Features

### 1. Application Statistics
- Displays total number of applications
- Shows breakdown by academic year
- Updates automatically after deletions

### 2. Delete All Applications
- One-click deletion of all student applications
- Removes all related records across all tables
- Includes confirmation dialog with detailed warning

### 3. Delete by Academic Year
- Select specific academic year from dropdown
- Shows application count per year in dropdown
- Deletes only applications for selected academic year
- Includes confirmation dialog

## What Gets Deleted

When an application is deleted, the following related records are automatically removed:

### Tables with CASCADE Delete:
1. **student_application_steps** - All step data
2. **student_documents** - All uploaded documents
3. **student_signatures** - All signature records
4. **docusign_envelopes** - DocuSign envelope records
5. **stripe_payments** - Stripe payment records
6. **manual_payments** - Manual payment records
7. **partner_referrals** - Partner referral records
8. **application_cashbacks** - Cashback application records

### Tables with SET NULL:
1. **refunds** - `application_id` set to NULL (refund record preserved)
2. **student_applications.previous_application_id** - Rebooking references cleared

### Studio Cleanup:
- If a studio was assigned to the application, it is automatically:
  - Set to `status = 'available'`
  - `allocation` set to `NULL`

## Database Functions

### `delete_student_application(p_application_id UUID)`
Deletes a single application and all related records. Returns:
- `deleted_tables`: JSONB object with counts per table
- `total_deleted`: Total number of records deleted

### `delete_all_student_applications()`
Deletes all applications in the system. Returns:
- `deleted_count`: Number of applications deleted
- `details`: JSONB array with details for each deleted application

### `delete_student_applications_by_academic_year(p_academic_year_id UUID)`
Deletes all applications for a specific academic year. Returns:
- `deleted_count`: Number of applications deleted
- `details`: JSONB array with details for each deleted application

## Security

- Functions are `SECURITY DEFINER` (run with elevated privileges)
- Only accessible to authenticated users
- RLS policies control access (staff/superadmin only)
- All deletions are logged via `logActivity` utility

## Usage Instructions

### To Delete All Applications:
1. Navigate to **Admin Settings** → **Data Management**
2. Review the statistics to see how many applications will be deleted
3. Click **"Delete All Applications"** button
4. Review the confirmation dialog
5. Click **"Delete All"** to confirm
6. Wait for success message

### To Delete by Academic Year:
1. Navigate to **Admin Settings** → **Data Management**
2. Select an academic year from the dropdown (shows count per year)
3. Click **"Delete by Academic Year"** button
4. Review the confirmation dialog showing the year and count
5. Click **"Delete"** to confirm
6. Wait for success message

## Important Notes

⚠️ **WARNING**: This feature is designed for development and testing only.

- **Irreversible**: Deletions cannot be undone
- **Complete Cleanup**: All related records are permanently removed
- **Studio Allocation**: Assigned studios are automatically freed
- **No Backup**: Ensure you have backups before using in production
- **Storage Files**: Document files in Supabase Storage are NOT automatically deleted (manual cleanup may be needed)

## Migration File

The database functions are defined in:
`supabase/migrations/20251122_data_management_functions.sql`

To apply:
```bash
npx supabase db push
```

Or if using local development:
```bash
npx supabase migration up
```

## UI Components

The feature uses:
- **AlertDialog** for confirmation dialogs
- **Select** dropdown for academic year selection
- **Badge** components for statistics display
- **Button** with destructive variant for delete actions
- **Skeleton** loaders for loading states

## Testing Recommendations

1. Test with a single application first
2. Verify all related records are deleted
3. Check that studios are properly freed
4. Verify statistics update correctly
5. Test both "Delete All" and "Delete by Year" functions
6. Check audit logs are created

## Future Enhancements

Potential improvements:
- Bulk select individual applications for deletion
- Soft delete option (mark as deleted instead of hard delete)
- Automatic storage file cleanup
- Export before deletion
- Scheduled cleanup for old applications

