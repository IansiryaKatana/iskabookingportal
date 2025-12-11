# Route Permissions System

## Overview

The Route Permissions System provides dynamic, database-driven access control for admin routes. It allows administrators to control which roles (staff, admin, superadmin, and staff sub-roles) can access specific pages in the admin portal.

## Key Features

- **Database-Driven**: Permissions are stored in the `route_permissions` table and can be managed via the UI
- **Role-Based Access Control**: Supports all roles including staff sub-roles (operations_manager, reservationist, accountant, front_desk)
- **Hierarchical Permissions**: Staff sub-roles inherit from "staff" role, but can be overridden per sub-role
- **Real-Time Updates**: Navigation and route access update immediately after permission changes
- **Optimistic Rendering**: Prevents flickering when navigating between pages

## Database Schema

### `route_permissions` Table

```sql
CREATE TABLE public.route_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_path TEXT NOT NULL,
  route_name TEXT NOT NULL,
  role TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(route_path, role)
);
```

**Columns:**
- `route_path`: The route path (e.g., `/admin/expenses`)
- `route_name`: Human-readable name (e.g., "Expenses")
- `role`: The role this permission applies to (staff, admin, superadmin, operations_manager, etc.)
- `allowed`: Boolean indicating if the role has access (true = allowed, false = denied)

## Permission Logic

### For Staff Role
- If `allowed = true` → Access granted
- If `allowed = false` → Access denied, route hidden from navigation

### For Staff Sub-Roles (operations_manager, reservationist, accountant, front_desk)
1. **Check staff permission first**: If staff role is denied (`allowed = false`), all sub-roles are automatically denied
2. **Check specific sub-role**: If a specific sub-role has a permission record, use that (allows per-sub-role control)
3. **Fallback to staff**: If no specific sub-role record exists, inherit from staff role permission

### Permission Priority (for sub-roles)
1. Staff role denied → All sub-roles denied (highest priority)
2. Specific sub-role permission → Use specific permission
3. Staff role permission → Inherit from staff
4. No record → Default to allowed (safe fallback)

## Components

### 1. `ProtectedRoute` Component
**Location**: `src/components/ProtectedRoute.tsx`

Protects routes by checking database permissions before rendering.

**Props:**
- `allowedRoles`: Array of roles that can access the route (fallback if database check fails)
- `checkDatabase`: Boolean (default: true) - Enable/disable database permission checks

**Behavior:**
- Checks `route_permissions` table for the current user's role
- Falls back to `allowedRoles` if database check fails or no record exists
- Redirects to appropriate dashboard if access denied
- Uses optimistic rendering to prevent flickering

### 2. `useRoutePermission` Hook
**Location**: `src/hooks/useRoutePermission.ts`

**Functions:**
- `useRoutePermission(routePath)`: Check permission for a single route
- `useRoutePermissions(routePaths)`: Check permissions for multiple routes (for navigation filtering)

**Returns:**
- Single route: `boolean | undefined` (true = allowed, false = denied, undefined = checking)
- Multiple routes: `Record<string, boolean>` (map of route paths to permission status)

**Caching:**
- `staleTime`: 30 seconds
- `gcTime`: 60 seconds
- Optimized to reduce unnecessary refetches

### 3. Permissions Management Page
**Location**: `src/pages/admin/Permissions.tsx`

UI for managing route permissions.

**Features:**
- Toggle permissions for each route/role combination
- Save changes to database
- Automatic cache invalidation after save
- Mobile-responsive card view and desktop table view

**Usage:**
1. Navigate to `/admin/permissions`
2. Toggle switches to enable/disable access for specific roles
3. Click "Save Changes" to persist to database
4. Navigation updates immediately after save

### 4. Navigation Filtering
**Location**: `src/components/admin/AdminLayout.tsx`

Automatically filters navigation items based on user permissions.

**Behavior:**
- Uses `useRoutePermissions` hook to check all navigation routes
- Only shows routes where `allowed === true`
- Hides routes where `allowed === false` or no record exists
- Dashboard route (`/admin`) is always visible

## Role System

### Base Roles
- `student`: Student users
- `staff`: Staff users (base role)
- `admin`: Admin users (new role, can manage staff)
- `superadmin`: Superadmin users (full access)
- `partner`: Partner users

### Staff Sub-Roles
- `operations_manager`: Operations Manager
- `reservationist`: Reservationist
- `accountant`: Accountant
- `front_desk`: Front Desk

**Important**: Sub-roles are stored in `profiles.staff_subrole` column, but the `role` field in `AuthContext` is set to the sub-role value when present. This allows the permission system to check sub-role-specific permissions.

## How It Works

### 1. User Authentication
When a user logs in:
1. `AuthContext` fetches user profile from `profiles` table
2. If `staff_subrole` exists, it's used as the `role` in the context
3. Otherwise, `profile.role` is used

### 2. Route Access Check
When accessing a protected route:
1. `ProtectedRoute` component checks if `checkDatabase` is enabled
2. Queries `route_permissions` table for current route and user's role
3. Applies permission logic (see "Permission Logic" section above)
4. Renders route if allowed, redirects if denied

### 3. Navigation Filtering
When rendering navigation:
1. `AdminLayout` uses `useRoutePermissions` to fetch permissions for all routes
2. Filters `navSections` to only include routes where `allowed === true`
3. Updates immediately when permissions change (via cache invalidation)

### 4. Permission Updates
When permissions are updated:
1. User toggles permission in `/admin/permissions` page
2. Local state is updated
3. User clicks "Save Changes"
4. Database is updated via Supabase
5. All permission queries are invalidated
6. Queries are refetched
7. Navigation and route access update immediately

## Cache Management

### Query Keys
- `["route-permissions"]`: All route permissions (for management page)
- `["route-permission-check", routePath, role]`: Single route check
- `["route-permissions-batch", routePaths, role]`: Batch route checks (for navigation)

### Cache Invalidation
After saving permissions:
1. All permission query keys are invalidated
2. `route-permissions-batch` and `route-permission-check` are explicitly refetched
3. Navigation updates within 1-2 seconds

## Migration Files

### Initial Setup
- `20250127_route_permissions_system.sql`: Creates `route_permissions` table and pre-populates with all routes/roles

### RLS Fix
- `20250129_fix_route_permissions_rls.sql`: Fixes RLS policies to allow all authenticated users to read permissions (required for frontend checks)

## Best Practices

1. **Always use `checkDatabase={true}`** on `ProtectedRoute` components (default)
2. **Keep `allowedRoles` as fallback** for routes that haven't been configured yet
3. **Test with different roles** after making permission changes
4. **Use the Permissions page** to manage access rather than direct database updates
5. **Clear browser cache** if permissions don't update after save

## Troubleshooting

### Routes still visible after turning off permission
- Check if "Save Changes" was clicked
- Verify database was updated (check `route_permissions` table)
- Clear browser cache and refresh
- Check console for errors

### Sub-role permissions not working
- Verify user has `staff_subrole` set in `profiles` table
- Check that `AuthContext` is using sub-role as `role`
- Ensure permission records exist for the sub-role in `route_permissions` table

### Flickering when navigating
- This should be fixed with optimistic rendering
- If still occurring, check cache times in `useRoutePermission` hook
- Verify `staleTime` and `gcTime` are set appropriately

## Future Enhancements

- Permission groups/templates
- Bulk permission operations
- Permission history/audit trail
- Permission inheritance rules configuration
- Time-based permissions (temporary access)

## Related Files

- `src/components/ProtectedRoute.tsx`: Route protection component
- `src/hooks/useRoutePermission.ts`: Permission checking hooks
- `src/pages/admin/Permissions.tsx`: Permission management UI
- `src/components/admin/AdminLayout.tsx`: Navigation filtering
- `src/components/admin/CommandPalette.tsx`: Search filtering
- `src/contexts/AuthContext.tsx`: Role determination
- `supabase/migrations/20250127_route_permissions_system.sql`: Initial schema
- `supabase/migrations/20250129_fix_route_permissions_rls.sql`: RLS policies

