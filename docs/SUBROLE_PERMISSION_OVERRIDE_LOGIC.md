# Sub-Role Permission Override Logic - Detailed Explanation

**Date**: December 17, 2024  
**Question**: If staff role is denied permission but sub-role is granted, will sub-role still work?  
**Answer**: ✅ **YES** - Explicit sub-role permissions override staff denial

---

## Scenario Example

**Setup**:
- Route: `/maintenance`
- Staff role: `allowed = false` (denied)
- Maintenance officer: `allowed = true` (granted)

**Question**: Can maintenance officer access `/maintenance`?

**Answer**: ✅ **YES** - Maintenance officer will have access

---

## Permission Check Priority Order

### Priority 1: Specific Role Permission (Highest Priority)
```typescript
// Check specific role permission FIRST
const { data: specificRoleData } = await supabase
  .from("route_permissions")
  .select("allowed")
  .eq("route_path", location.pathname)
  .eq("role", "maintenance_officer")  // Specific sub-role
  .maybeSingle();

// If specific role has explicit permission, use it immediately
if (specificRoleData !== null) {
  return specificRoleData.allowed === true;  // ✅ Returns true, never checks staff
}
```

**Result**: If `maintenance_officer` has `allowed=true`, access is granted immediately. Staff permission is never checked.

### Priority 2: Staff Permission (Inheritance - Only if no specific permission)
```typescript
// Only reached if specific role has NO explicit permission
const { data: staffData } = await supabase
  .from("route_permissions")
  .select("allowed")
  .eq("route_path", location.pathname)
  .eq("role", "staff")
  .maybeSingle();

if (staffData !== null) {
  return staffData.allowed === true;  // Sub-role inherits from staff
}
```

**Result**: Only checked if sub-role has no explicit permission. If staff is denied but sub-role is granted, this step is never reached.

### Priority 3: Fallback to allowedRoles (Default - Only if no database permission)
```typescript
// Only used if no database permission exists
return allowedRoles.includes(role) || allowedRoles.includes("staff");
```

**Result**: Only used when permissions page hasn't been configured.

---

## Logic Flow Diagram

```
User: maintenance_officer
Route: /maintenance

Step 1: Check maintenance_officer permission
  ├─ Found: allowed=true
  │  └─ ✅ GRANT ACCESS (return true immediately)
  │     └─ Staff permission never checked
  │
  └─ Not Found: Continue to Step 2

Step 2: Check staff permission (inheritance)
  ├─ Found: allowed=false
  │  └─ ❌ DENY ACCESS (inherit staff denial)
  │
  ├─ Found: allowed=true
  │  └─ ✅ GRANT ACCESS (inherit staff permission)
  │
  └─ Not Found: Continue to Step 3

Step 3: Fallback to allowedRoles
  └─ Use route-level defaults
```

---

## Examples

### Example 1: Sub-Role Granted, Staff Denied ✅
```sql
-- Database permissions
route_path: '/maintenance'
role: 'staff'
allowed: false  ❌

route_path: '/maintenance'
role: 'maintenance_officer'
allowed: true  ✅
```

**Result**: ✅ Maintenance officer CAN access
- Step 1 finds `maintenance_officer` with `allowed=true`
- Returns `true` immediately
- Staff permission never checked

### Example 2: Sub-Role Denied, Staff Granted ❌
```sql
-- Database permissions
route_path: '/maintenance'
role: 'staff'
allowed: true  ✅

route_path: '/maintenance'
role: 'maintenance_officer'
allowed: false  ❌
```

**Result**: ❌ Maintenance officer CANNOT access
- Step 1 finds `maintenance_officer` with `allowed=false`
- Returns `false` immediately
- Staff permission never checked

### Example 3: No Sub-Role Permission, Staff Denied ❌
```sql
-- Database permissions
route_path: '/maintenance'
role: 'staff'
allowed: false  ❌

-- No maintenance_officer record
```

**Result**: ❌ Maintenance officer CANNOT access
- Step 1 finds no `maintenance_officer` record
- Step 2 finds `staff` with `allowed=false`
- Returns `false` (inherits staff denial)

### Example 4: No Sub-Role Permission, Staff Granted ✅
```sql
-- Database permissions
route_path: '/maintenance'
role: 'staff'
allowed: true  ✅

-- No maintenance_officer record
```

**Result**: ✅ Maintenance officer CAN access
- Step 1 finds no `maintenance_officer` record
- Step 2 finds `staff` with `allowed=true`
- Returns `true` (inherits staff permission)

### Example 5: No Permissions at All (Fallback)
```sql
-- No database permissions for /maintenance
```

**Result**: Uses `allowedRoles` from route definition
- Step 1: No specific role permission
- Step 2: No staff permission
- Step 3: Check if `maintenance_officer` or `staff` in `allowedRoles`

---

## Key Points

### ✅ Explicit Sub-Role Permission Always Wins
- If sub-role has explicit permission (allowed or denied), it takes precedence
- Staff permission is never checked if sub-role has explicit permission
- This allows fine-grained control per sub-role

### ✅ Sub-Roles Inherit from Staff (When No Explicit Permission)
- If sub-role has no explicit permission, check staff
- If staff granted → sub-role gets access
- If staff denied → sub-role is denied

### ✅ Fine-Grained Control
- Can grant specific sub-role even if staff is denied
- Can deny specific sub-role even if staff is granted
- Can use staff permission as default for all sub-roles

---

## Use Cases

### Use Case 1: Restrictive Staff, Specific Sub-Role Access
**Scenario**: Want to restrict most staff from maintenance page, but allow maintenance officers

**Setup**:
- Staff: `allowed = false`
- Maintenance officer: `allowed = true`

**Result**: ✅ Only maintenance officers can access

### Use Case 2: Open Staff, Restrictive Sub-Role
**Scenario**: Most staff can access, but restrict a specific sub-role

**Setup**:
- Staff: `allowed = true`
- Accountant: `allowed = false`

**Result**: ✅ All staff except accountants can access

### Use Case 3: Default Staff Permission
**Scenario**: All staff should have access, no need to configure each sub-role

**Setup**:
- Staff: `allowed = true`
- No sub-role records

**Result**: ✅ All sub-roles inherit staff permission

---

## Implementation Verification

### Current Code (Before Fix)
```typescript
// Line 45: Check specific role FIRST ✅ (This is correct)
if (specificRoleData !== null) {
  return specificRoleData.allowed === true;
}

// Line 56: BUT then blocks if not in allowedRoles ❌ (This is the problem)
if (!allowedRoles.includes(role)) {
  return false;  // Blocks even if database granted permission!
}
```

### Fixed Code (After Fix)
```typescript
// Line 45: Check specific role FIRST ✅
if (specificRoleData !== null) {
  return specificRoleData.allowed === true;  // Works even if staff denied
}

// Removed: allowedRoles blocking for sub-roles ✅
// Now checks staff permission as fallback
// Then uses allowedRoles only if no database permission
```

---

## Testing Checklist

### Test Case 1: Sub-Role Granted, Staff Denied
- [ ] Set staff: `allowed = false` for `/maintenance`
- [ ] Set maintenance_officer: `allowed = true` for `/maintenance`
- [ ] Login as maintenance_officer
- [ ] Navigate to `/maintenance`
- [ ] ✅ Should have access

### Test Case 2: Sub-Role Denied, Staff Granted
- [ ] Set staff: `allowed = true` for `/maintenance`
- [ ] Set accountant: `allowed = false` for `/maintenance`
- [ ] Login as accountant
- [ ] Navigate to `/maintenance`
- [ ] ❌ Should NOT have access

### Test Case 3: No Sub-Role, Staff Denied
- [ ] Set staff: `allowed = false` for `/maintenance`
- [ ] No maintenance_officer record
- [ ] Login as maintenance_officer
- [ ] Navigate to `/maintenance`
- [ ] ❌ Should NOT have access (inherits denial)

### Test Case 4: No Sub-Role, Staff Granted
- [ ] Set staff: `allowed = true` for `/maintenance`
- [ ] No maintenance_officer record
- [ ] Login as maintenance_officer
- [ ] Navigate to `/maintenance`
- [ ] ✅ Should have access (inherits permission)

---

## Conclusion

**Answer to Question**: ✅ **YES**

If you:
- Deny staff permission for a route
- Grant specific sub-role permission for the same route

The sub-role **WILL** have access because:
1. Specific role permission is checked FIRST
2. If found, it's used immediately
3. Staff permission is never checked if sub-role has explicit permission

This provides fine-grained control where you can:
- Restrict general staff access
- Grant specific sub-roles access
- Or vice versa

---

**Document Version**: 1.0  
**Last Updated**: December 17, 2024

