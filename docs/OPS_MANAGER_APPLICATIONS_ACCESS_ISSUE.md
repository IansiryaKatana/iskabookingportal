# Ops Manager Applications Page Access Issue - Investigation Report

**Date**: December 17, 2024  
**Issue**: Ops Manager role user crashes/redirects when clicking to review an application  
**Status**: 🔍 Root Cause Identified - Awaiting Fix Approval

---

## Problem Description

### User Report
> "Ops Manager role has access to the applications page, but when clicking to review an application, it crashes and takes him to another page."

### Symptoms
1. ✅ Ops Manager can access `/admin/applications` page (list view)
2. ❌ When clicking "Review" button on an application, user is redirected away
3. ❌ Application detail page (`/admin/applications/:applicationId`) appears inaccessible
4. ❌ User experiences what appears to be a "crash" but is actually an access denial redirect

---

## Root Cause Analysis

### Issue #1: Route Definition Missing `operations_manager`

**File**: `src/App.tsx` (Lines 248-262)

**Current Code**:
```typescript
<Route
  path="/admin/applications"
  element={
    <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
      <AdminApplications />
    </ProtectedRoute>
  }
/>
<Route
  path="/admin/applications/:applicationId"
  element={
    <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
      <AdminApplicationDetail />
    </ProtectedRoute>
  }
/>
```

**Problem**: `operations_manager` is **NOT** included in the `allowedRoles` array.

### Issue #2: ProtectedRoute Logic for Sub-Roles

**File**: `src/components/ProtectedRoute.tsx` (Lines 52-58)

**Critical Logic**:
```typescript
if (role === "operations_manager" || role === "reservationist" || ...) {
  // CRITICAL: If sub-role is NOT in allowedRoles, deny immediately
  if (!allowedRoles.includes(role)) {
    return false;  // ❌ Access denied immediately
  }
  // Only then check database permissions...
}
```

**Problem**: 
- Even if database route_permissions table has `operations_manager` allowed for `/admin/applications/:applicationId`
- The ProtectedRoute component checks `allowedRoles` **FIRST**
- If `operations_manager` is not in `allowedRoles`, access is denied **immediately**
- User is then redirected to their default route (likely `/admin` or `/maintenance`)
- This appears as a "crash" or "takes him to another page"

### Why List Page Works But Detail Page Doesn't

**Hypothesis**: 
- Database permissions might be set for `/admin/applications` (list page)
- But the route protection logic still requires the role to be in `allowedRoles`
- OR: The list page might have different permission handling

**Reality Check Needed**: Verify database route_permissions entries for:
- `/admin/applications` (list)
- `/admin/applications/:applicationId` (detail - dynamic route)

---

## Technical Details

### ProtectedRoute Permission Check Flow

1. **Check if role is in allowedRoles** (Line 25, 56)
   - If `operations_manager` NOT in array → **DENY IMMEDIATELY**
   - This happens BEFORE database check

2. **Check database route_permissions** (Lines 29-46)
   - Only reached if role IS in allowedRoles
   - Checks specific role permission first
   - Falls back to staff permission for sub-roles

3. **Fallback to allowedRoles** (Line 85)
   - If no database record exists
   - Uses allowedRoles as default

### Current Route Protection Status

| Route | allowedRoles | operations_manager Included? | Database Permission? |
|-------|--------------|------------------------------|----------------------|
| `/admin/applications` | `["staff", "superadmin"]` | ❌ NO | ❓ Unknown |
| `/admin/applications/:applicationId` | `["staff", "superadmin"]` | ❌ NO | ❓ Unknown |

---

## Impact Assessment

### Affected Users
- All users with `operations_manager` role
- Users who have been granted access via route_permissions table but route definition doesn't include them

### Affected Functionality
- ❌ Cannot review application details
- ❌ Cannot access application detail page
- ✅ Can view applications list (if database permission exists)
- ❌ Redirected to default route when clicking "Review"

### Security Implications
- ⚠️ **No security risk**: Access is being denied (safe default)
- ⚠️ **Functionality gap**: Intended access is blocked
- ✅ **Defense in depth working**: Route-level restrictions take precedence (by design)

---

## Recommendations

### Fix #1: Add `operations_manager` to Route Definitions (PRIMARY FIX)

**File**: `src/App.tsx`

**Change Required**:
```typescript
// BEFORE
<ProtectedRoute allowedRoles={["staff", "superadmin"]}>

// AFTER
<ProtectedRoute allowedRoles={["staff", "superadmin", "operations_manager"]}>
```

**Routes to Update**:
1. `/admin/applications` (line 250)
2. `/admin/applications/:applicationId` (line 258)

**Rationale**:
- Allows operations_manager to access if database permissions are set
- Maintains route-level control
- Consistent with other admin routes that include operations_manager

### Fix #2: Verify Database Route Permissions (VERIFICATION)

**Action Required**: Check `route_permissions` table for:
```sql
SELECT * FROM route_permissions 
WHERE route_path IN ('/admin/applications', '/admin/applications/:applicationId')
  AND role IN ('operations_manager', 'staff');
```

**Expected Result**:
- Should have `allowed = true` for operations_manager on `/admin/applications`
- May need to add entry for `/admin/applications/:applicationId` if using dynamic route matching

**Note**: Route matching for dynamic routes (`:applicationId`) might need special handling. Check if route_permissions uses pattern matching or exact path matching.

### Fix #3: Consider Route Pattern Matching (OPTIONAL ENHANCEMENT)

**Current Limitation**: 
- Route permissions might use exact path matching
- Dynamic routes like `/admin/applications/:applicationId` might not match database entries

**Potential Solution**:
- Use route pattern matching: `/admin/applications/*`
- Or ensure database has entries for common application IDs
- Or update ProtectedRoute to handle dynamic route patterns

---

## Implementation Plan

### Step 1: Update Route Definitions
1. Open `src/App.tsx`
2. Find routes at lines 248 and 256
3. Add `"operations_manager"` to `allowedRoles` array
4. Test with operations_manager user

### Step 2: Verify Database Permissions
1. Check route_permissions table
2. Verify entries exist for operations_manager
3. Add entries if missing
4. Test route access

### Step 3: Test Application Detail Access
1. Login as operations_manager
2. Navigate to `/admin/applications`
3. Click "Review" on an application
4. Verify ApplicationDetail page loads correctly
5. Verify all functionality works (document review, status updates, etc.)

### Step 4: Verify No Breaking Changes
1. Test with other roles (staff, superadmin)
2. Verify access still works
3. Check that unauthorized roles are still blocked

---

## Additional Considerations

### Other Routes That Might Have Same Issue

**Check these routes for missing `operations_manager`**:
- `/admin/students` (line 264)
- `/admin/students/:applicationId` (line 355)
- Any other admin routes that should allow operations_manager

### Pattern to Look For

Search for routes with:
```typescript
allowedRoles={["staff", "superadmin"]}
```

That should potentially include:
```typescript
allowedRoles={["staff", "superadmin", "operations_manager"]}
```

### Database Route Permissions vs Code Route Definitions

**Current System Design**:
- Code route definitions (`allowedRoles`) = Route-level restrictions (strict)
- Database route_permissions = Fine-grained permissions (flexible)
- Sub-roles must be in BOTH to access

**This is by design** for security, but requires:
- Route definitions to include allowed sub-roles
- Database permissions to grant specific access

---

## Testing Checklist

### Pre-Fix Testing
- [ ] Confirm operations_manager can access `/admin/applications` list
- [ ] Confirm operations_manager CANNOT access `/admin/applications/:id` detail
- [ ] Confirm redirect happens when clicking "Review"
- [ ] Check browser console for errors
- [ ] Check network tab for failed requests

### Post-Fix Testing
- [ ] operations_manager can access `/admin/applications` list
- [ ] operations_manager CAN access `/admin/applications/:id` detail
- [ ] Clicking "Review" opens detail page (no redirect)
- [ ] All ApplicationDetail functionality works:
  - [ ] View application data
  - [ ] View documents
  - [ ] Update status
  - [ ] Record payments
  - [ ] Reassign studio
- [ ] Other roles (staff, superadmin) still work
- [ ] Unauthorized roles still blocked

---

## Related Files

1. **Route Definitions**: `src/App.tsx` (lines 248-262)
2. **Route Protection**: `src/components/ProtectedRoute.tsx`
3. **Application Detail Page**: `src/pages/admin/ApplicationDetail.tsx`
4. **Applications List Page**: `src/pages/admin/Applications.tsx`
5. **Route Permissions Table**: `route_permissions` in database

---

## Conclusion

**Root Cause**: Route definitions in `src/App.tsx` do not include `operations_manager` in the `allowedRoles` array for application routes, causing ProtectedRoute to deny access immediately, even if database permissions are set.

**Fix Required**: Add `"operations_manager"` to `allowedRoles` for both `/admin/applications` and `/admin/applications/:applicationId` routes.

**Priority**: High - Blocks intended functionality for operations_manager role

**Risk**: Low - Fix is straightforward, no breaking changes expected

---

**Document Version**: 1.0  
**Last Updated**: December 17, 2024  
**Status**: Awaiting Fix Approval

