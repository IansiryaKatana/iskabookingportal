# ProtectedRoute Sub-Role Logic Update - Design Change

**Date**: December 17, 2024  
**Issue**: Sub-roles blocked by route-level `allowedRoles` even when database permissions allow access  
**Status**: 🔄 Design Change Required

---

## Current Problem

### User Requirement
> "All sub-roles are staff roles. As long as I have given permission in the permissions page, they should be able to access all routes, including review, open journey, etc."

### Current Behavior (WRONG)
- Sub-roles are checked against `allowedRoles` FIRST
- If sub-role not in `allowedRoles`, access is denied immediately
- Database permissions are never checked
- Even if permissions page grants access, route blocks it

### Desired Behavior (CORRECT)
- Sub-roles are staff roles
- Database permissions (from permissions page) should take precedence
- If database grants permission, allow access regardless of `allowedRoles`
- `allowedRoles` should only be a fallback/default when no database permission exists

---

## Current Logic Flow (Lines 49-82)

```typescript
// For sub-roles: Check allowedRoles FIRST before checking staff permissions
if (role === "operations_manager" || ...) {
  // ❌ PROBLEM: Blocks access if not in allowedRoles
  if (!allowedRoles.includes(role)) {
    return false;  // Denies even if database has permission!
  }
  
  // Only checks database if role IS in allowedRoles
  // This defeats the purpose of database permissions
}
```

**Problem**: This logic prioritizes route-level restrictions over database permissions, which is backwards.

---

## Proposed Logic Flow

### New Priority Order for Sub-Roles:

1. **Check specific role permission in database** (highest priority)
   - If `operations_manager` has explicit permission → Allow/Deny based on that
   
2. **Check staff permission in database** (inheritance)
   - If staff has permission → Sub-roles inherit it
   - If staff is explicitly denied → Sub-roles are denied
   
3. **Fallback to allowedRoles** (default only)
   - Only if no database permission exists
   - Use `allowedRoles` as a safe default

### New Logic:

```typescript
// For sub-roles: Check database permissions FIRST, then fallback to allowedRoles
if (role === "operations_manager" || ...) {
  // Step 1: Check specific role permission (explicit grant/deny)
  if (specificRoleData !== null) {
    return specificRoleData.allowed === true;
  }
  
  // Step 2: Check staff permission (inheritance)
  const { data: staffData } = await supabase
    .from("route_permissions")
    .select("allowed")
    .eq("route_path", location.pathname)
    .eq("role", "staff")
    .maybeSingle();
  
  if (staffData !== null) {
    // Staff has explicit permission - sub-roles inherit
    return staffData.allowed === true;
  }
  
  // Step 3: Fallback to allowedRoles (only if no database permission)
  // This allows route-level defaults when permissions page hasn't been configured
  return allowedRoles.includes(role) || allowedRoles.includes("staff");
}
```

---

## Implementation

### Change Required in `src/components/ProtectedRoute.tsx`

**Current Code** (Lines 49-82):
```typescript
// For sub-roles: Check allowedRoles FIRST before checking staff permissions
if (role === "operations_manager" || ...) {
  // CRITICAL: If sub-role is NOT in allowedRoles, deny immediately
  if (!allowedRoles.includes(role)) {
    return false;
  }
  
  // Only check staff permissions if the sub-role IS in allowedRoles
  const { data: staffData, error: staffError } = await supabase
    .from("route_permissions")
    .select("allowed")
    .eq("route_path", location.pathname)
    .eq("role", "staff")
    .maybeSingle();
  
  // ... rest of logic
}
```

**New Code**:
```typescript
// For sub-roles: Database permissions take precedence, allowedRoles is fallback
if (role === "operations_manager" || role === "reservationist" || role === "accountant" || role === "front_desk" || role === "maintenance_officer" || role === "housekeeper") {
  // Step 1: If specific role has explicit permission, use it (already checked above at line 45)
  // This is handled by the code before this block (lines 43-47)
  
  // Step 2: Check staff permission (sub-roles inherit from staff)
  const { data: staffData, error: staffError } = await supabase
    .from("route_permissions")
    .select("allowed")
    .eq("route_path", location.pathname)
    .eq("role", "staff")
    .maybeSingle();
  
  if (staffError && staffError.code !== "PGRST116") {
    console.error("Error checking staff route permission:", staffError);
    // Fallback to allowedRoles on error
    return allowedRoles.includes(role) || allowedRoles.includes("staff");
  }
  
  // If staff has explicit permission, sub-roles inherit it
  if (staffData !== null) {
    return staffData.allowed === true;
  }
  
  // Step 3: Fallback to allowedRoles only if no database permission exists
  // Sub-roles can access if "staff" is in allowedRoles (they are staff)
  return allowedRoles.includes(role) || allowedRoles.includes("staff");
}
```

---

## Benefits

1. ✅ **Database permissions are source of truth**
   - Permissions page controls access
   - No need to update code for every route

2. ✅ **Sub-roles inherit from staff**
   - If staff has permission, sub-roles get it
   - Consistent with "sub-roles are staff" philosophy

3. ✅ **Flexible access control**
   - Can grant/deny specific sub-roles
   - Can grant/deny all staff (affects all sub-roles)
   - Route-level defaults still work when permissions not configured

4. ✅ **Backward compatible**
   - Routes with `allowedRoles={["staff", "superadmin"]}` still work
   - Sub-roles can access if staff permission exists
   - No breaking changes

---

## Testing Scenarios

### Scenario 1: Database Permission for Specific Sub-Role
- **Setup**: `operations_manager` has `allowed=true` in database for `/admin/applications`
- **Expected**: operations_manager can access, even if not in `allowedRoles`
- **Result**: ✅ Should work

### Scenario 2: Database Permission for Staff
- **Setup**: `staff` has `allowed=true` in database for `/admin/applications`
- **Expected**: All sub-roles (operations_manager, reservationist, etc.) can access
- **Result**: ✅ Should work

### Scenario 3: No Database Permission, Route Has Staff
- **Setup**: No database permission, route has `allowedRoles={["staff", "superadmin"]}`
- **Expected**: Sub-roles can access (they are staff)
- **Result**: ✅ Should work

### Scenario 4: Database Explicitly Denies
- **Setup**: `operations_manager` has `allowed=false` in database
- **Expected**: operations_manager cannot access, even if staff has permission
- **Result**: ✅ Should work (explicit deny takes precedence)

### Scenario 5: Staff Denied, Sub-Role Not Explicit
- **Setup**: `staff` has `allowed=false`, `operations_manager` has no record
- **Expected**: operations_manager cannot access (inherits staff denial)
- **Result**: ✅ Should work

---

## Migration Notes

### No Database Changes Required
- Existing route_permissions records work as-is
- No migration needed

### Code Changes Only
- Update `ProtectedRoute.tsx` logic
- Test all scenarios
- Verify backward compatibility

---

## Rollback Plan

If issues arise:
1. Revert `ProtectedRoute.tsx` to previous version
2. Add sub-roles to `allowedRoles` in routes (temporary fix)
3. Investigate and fix issues
4. Re-apply new logic

---

## Conclusion

**Current State**: Route-level `allowedRoles` blocks sub-roles even when database grants permission

**Desired State**: Database permissions take precedence, sub-roles inherit from staff, `allowedRoles` is fallback only

**Fix**: Update ProtectedRoute logic to check database permissions FIRST, then fallback to `allowedRoles`

**Priority**: High - Blocks intended functionality and defeats purpose of permissions page

---

**Document Version**: 1.0  
**Last Updated**: December 17, 2024  
**Status**: Ready for Implementation

