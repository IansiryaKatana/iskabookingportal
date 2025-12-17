# Permissions Save Fix

## Issue
When toggling a route permission ON in the Permissions page and saving, the permission would revert back to OFF after saving. This occurred specifically for permissions that didn't already exist in the database.

## Root Cause
The save function in `src/pages/admin/Permissions.tsx` only handled **UPDATE** operations for existing permission records. When a user toggled a permission ON for a route/role combination that didn't exist in the database:

1. The toggle would update the local state correctly
2. The save function would check if the permission exists in the database
3. If it didn't exist, the save function would skip it (no INSERT logic)
4. After save, the query would refetch from the database
5. Since the record was never inserted, it would appear as OFF again

## Solution
Updated the save mutation in `src/pages/admin/Permissions.tsx` to handle both **INSERT** and **UPDATE** operations:

### Changes Made

1. **Added INSERT handling**: 
   - When a permission doesn't exist in the database (`original` is null) and is toggled ON (`allowed: true`), it's now inserted as a new record
   - Only permissions set to `allowed: true` are inserted (OFF permissions don't need database records)

2. **Used UPSERT instead of INSERT**:
   - Changed from `insert()` to `upsert()` with `onConflict: "route_path,role"`
   - This handles race conditions where a permission might be created between the check and the insert
   - The unique constraint `(route_path, role)` ensures no duplicates

3. **Route name handling**:
   - Ensured `route_name` is properly retrieved from the routes array
   - Added fallback to `routePath` if route name isn't found

### Code Changes

**Before:**
```typescript
// Only handled updates
if (original && original.allowed !== perm.allowed) {
  updates.push({ id: perm.id, allowed: perm.allowed });
}
// No INSERT logic - new permissions were lost
```

**After:**
```typescript
if (original) {
  // Existing record - update if changed
  if (original.allowed !== perm.allowed) {
    updates.push({ id: perm.id, allowed: perm.allowed });
  }
} else {
  // New record - insert if allowed is true
  if (perm.allowed) {
    inserts.push({
      route_path: routePath,
      route_name: routeName,
      role: role,
      allowed: perm.allowed,
    });
  }
}

// Insert new records (use upsert to handle any race conditions)
if (inserts.length > 0) {
  const { error: insertError } = await supabase
    .from("route_permissions")
    .upsert(inserts, {
      onConflict: "route_path,role",
      ignoreDuplicates: false,
    });
  if (insertError) throw insertError;
}
```

## How It Works Now

1. **User toggles permission ON** for a route/role that doesn't exist
2. **Local state updates** correctly (permission shows as ON)
3. **User clicks Save**
4. **Save function**:
   - Detects it's a new permission (no `original` record)
   - Adds it to the `inserts` array
   - Uses `upsert()` to insert the record (or update if conflict occurs)
5. **Query refetches** from database
6. **Permission persists** correctly as ON

## Database Schema

The `route_permissions` table has a unique constraint:
```sql
UNIQUE(route_path, role)
```

This ensures that each route/role combination can only have one permission record, which is why `upsert` is the appropriate operation.

## Testing

To verify the fix:
1. Navigate to `/admin/permissions`
2. Find a route/role combination that doesn't have a permission record (shows as OFF)
3. Toggle it ON
4. Click "Save Changes"
5. Verify the permission remains ON after save
6. Refresh the page and verify it still shows ON

## Related Files

- `src/pages/admin/Permissions.tsx` - Main permissions management component
- `supabase/migrations/20250127_route_permissions_system.sql` - Route permissions table schema

## Date
December 2024

