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

### 2. Delete by Search (New - 2025-12-17)
- **Search Functionality**:
  - Search input field with type selector (Student Name / Studio Number)
  - Real-time search with results preview
  - Partial matching support (e.g., "John" matches "John Doe")
  - Case-insensitive search
- **Search Types**:
  - **Student Name**: Searches in `profiles` table (first_name, last_name) and Step 1 payload as fallback
  - **Studio Number**: Searches in `studios` table (studio_number) for applications with assigned studios
- **Results Display**:
  - Shows matching applications in a scrollable table
  - Displays: student name, email, studio number, studio grade, contract name, status, creation date
  - Checkbox selection for individual applications
  - "Select All" / "Deselect All" button
- **Deletion Options**:
  - **Delete Selected**: Delete only checked applications (with confirmation dialog)
  - **Delete All Matches**: Delete all applications matching search criteria (with confirmation)
- **Features**:
  - Preview before deletion
  - Smart Deletion option available (same as other deletion methods)
  - Results count display
  - Empty state message when no results found

### 3. Delete All Applications
- One-click deletion of all student applications
- Removes all related records across all tables
- Includes confirmation dialog with detailed warning

### 4. Delete by Academic Year
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

### `search_applications_by_criteria(p_search_term TEXT, p_search_type TEXT)`
Searches for applications by student name or studio number. Returns table with:
- `application_id`: UUID of the application
- `student_name`: Full name from profiles or Step 1 payload
- `student_email`: Email address from auth.users
- `studio_number`: Studio number if assigned
- `studio_grade_name`: Name of the studio grade
- `contract_name`: Name of the contract
- `status`: Application status
- `created_at`: Creation timestamp

**Parameters:**
- `p_search_term`: Search text (supports partial matching)
- `p_search_type`: Either `'student_name'` or `'studio_number'`

**Search Logic:**
- Student name: Searches in `profiles.first_name` + `profiles.last_name` OR Step 1 payload fields
- Studio number: Searches in `studios.studio_number` (only applications with assigned studios)

### `delete_applications_by_ids(p_application_ids UUID[], p_delete_orphaned_users BOOLEAN DEFAULT false)`
Deletes applications by their IDs (array). Returns:
- `deleted_count`: Number of applications deleted
- `users_deleted`: Number of user accounts deleted (if Smart Deletion enabled)
- `users_preserved`: Number of user accounts preserved (if Smart Deletion enabled)
- `details`: JSONB array with details for each deleted application
- `user_details`: JSONB array with user deletion/preservation decisions
- `cleanup_performed`: Boolean indicating studio cleanup was performed
- `message`: Summary message

**Parameters:**
- `p_application_ids`: Array of application UUIDs to delete
- `p_delete_orphaned_users`: Optional Smart Deletion flag (default: false)

### `delete_all_student_applications(p_delete_orphaned_users BOOLEAN DEFAULT false)`
Deletes all applications in the system. Returns:
- `deleted_count`: Number of applications deleted
- `users_deleted`: Number of user accounts deleted (if Smart Deletion enabled)
- `users_preserved`: Number of user accounts preserved (if Smart Deletion enabled)
- `details`: JSONB array with details for each deleted application
- `user_details`: JSONB array with user deletion/preservation decisions

### `delete_student_applications_by_academic_year(p_academic_year_id UUID, p_delete_orphaned_users BOOLEAN DEFAULT false)`
Deletes all applications for a specific academic year. Returns:
- `deleted_count`: Number of applications deleted
- `users_deleted`: Number of user accounts deleted (if Smart Deletion enabled)
- `users_preserved`: Number of user accounts preserved (if Smart Deletion enabled)
- `details`: JSONB array with details for each deleted application
- `user_details`: JSONB array with user deletion/preservation decisions

## Security

- Functions are `SECURITY DEFINER` (run with elevated privileges)
- Only accessible to authenticated users
- RLS policies control access (staff/superadmin only)
- All deletions are logged via `logActivity` utility

## Usage Instructions

### To Delete by Search:
1. Navigate to **Admin Settings** → **Data Management**
2. In the **"Delete by Search"** section:
   - Enter search term (student name or studio number)
   - Select search type from dropdown (Student Name / Studio Number)
   - Click **"Search"** button
3. Review the search results:
   - Check applications you want to delete (or use "Select All")
   - Review application details in the results table
4. Choose deletion option:
   - **Delete Selected**: Click to delete only checked applications
   - **Delete All Matches**: Click to delete all matching applications
5. Review confirmation dialog:
   - Shows count of applications to be deleted
   - Option to enable Smart Deletion (delete orphaned users)
6. Click **"Delete Selected"** or confirm deletion
7. Wait for success message

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

## Migration Files

The database functions are defined in:
- `supabase/migrations/20251122_data_management_functions.sql` - Core deletion functions
- `supabase/migrations/20250128_smart_deletion_feature.sql` - Smart Deletion enhancement
- `supabase/migrations/20251217_add_search_based_deletion.sql` - Search-based deletion feature

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
- ✅ **Search-based deletion** - IMPLEMENTED (2025-12-17)
- Soft delete option (mark as deleted instead of hard delete)
- Automatic storage file cleanup
- Export before deletion
- Scheduled cleanup for old applications
- Advanced search filters (by status, date range, etc.)
- Search by email address
- Search by contract name

