# Manage Users Edge Function

**Function Name:** `manage-users`  
**Location:** `supabase/functions/manage-users/index.ts`  
**Status:** ✅ Deployed and Active  
**Last Updated:** 2025-12-06

## Overview

The `manage-users` Edge Function provides secure backend handling for admin user management operations. It allows authenticated admin users (staff or superadmin) to invite new users and delete existing users from the system.

## Purpose

This function was created to resolve security issues where the frontend was attempting to call Supabase admin API methods directly. Admin operations require the service role key, which should never be exposed in the frontend. This Edge Function runs on the backend with proper authentication and authorization checks.

## Features

### 1. User Invitation
- Invite new staff or superadmin users by email
- Validates email format
- Checks if user already exists before inviting
- Sends invitation email via Supabase Auth
- Automatically updates user profile with correct role

### 2. User Deletion
- Delete users from the system
- Retrieves user profile data before deletion for audit logging
- Cascades deletion to related profile records (via database triggers)

## Authentication & Authorization

- **Authentication Required:** Yes (JWT token)
- **Authorization:** User must have `staff` or `superadmin` role
- **Service Role Key:** Used on backend for admin operations

## API Endpoints

### Invite User

**Request:**
```json
{
  "action": "invite",
  "email": "staff@example.com",
  "role": "staff" | "superadmin"
}
```

**Response (Success):**
```json
{
  "success": true,
  "user": {
    "id": "user-uuid",
    "email": "staff@example.com",
    ...
  },
  "message": "Invitation sent successfully"
}
```

**Response (Error):**
```json
{
  "error": "User with this email already exists."
}
```

### Delete User

**Request:**
```json
{
  "action": "delete",
  "userId": "user-uuid"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "User deleted successfully",
  "deletedUser": {
    "id": "user-uuid",
    "first_name": "John",
    "last_name": "Doe",
    "role": "staff"
  }
}
```

## Frontend Usage

The function is called from `src/pages/admin/Users.tsx`:

```typescript
// Invite user
const { data, error } = await supabase.functions.invoke("manage-users", {
  body: {
    action: "invite",
    email: "staff@example.com",
    role: "staff",
  },
});

// Delete user
const { data, error } = await supabase.functions.invoke("manage-users", {
  body: {
    action: "delete",
    userId: "user-uuid",
  },
});
```

## Error Handling

The function handles various error scenarios:

1. **Unauthorized (401):** Missing or invalid authentication token
2. **Forbidden (403):** User doesn't have admin privileges
3. **Bad Request (400):** 
   - Invalid action type
   - Missing required fields
   - Invalid email format
   - User already exists (for invite)
   - Missing userId (for delete)
4. **Internal Server Error (500):** Unexpected errors during processing

## Security Considerations

1. **Service Role Key:** Only used on backend, never exposed to frontend
2. **Role Verification:** Checks user profile role before allowing operations
3. **Email Validation:** Validates email format before processing
4. **User Existence Check:** Prevents duplicate user creation
5. **Audit Logging:** User operations are logged via `logActivity()` in frontend

## Technical Details

### Dependencies
- `@supabase/supabase-js@2` - Supabase client library
- `deno.land/std@0.168.0/http/server.ts` - HTTP server

### Environment Variables Required
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin operations

### Implementation Notes

1. **User Existence Check:** Uses `listUsers()` and filters by email (since `getUserByEmail()` is not available in all Supabase JS versions)

2. **Email Normalization:** All emails are normalized to lowercase before processing

3. **Profile Updates:** After inviting a user, the function automatically updates the profile with the correct role

4. **Error Recovery:** If profile update fails after invitation, the invitation is still considered successful (user can set role manually)

## Deployment

```bash
# Deploy the function
supabase functions deploy manage-users

# Verify deployment
supabase functions list
```

## Testing

To test the function:

1. **Invite User:**
   - Go to Admin > Users page
   - Click "Invite User"
   - Enter email and select role
   - Verify invitation email is sent

2. **Delete User:**
   - Go to Admin > Users page
   - Click delete on a user
   - Confirm deletion
   - Verify user is removed from system

## Related Files

- `src/pages/admin/Users.tsx` - Frontend user management interface
- `supabase/functions/manage-users/index.ts` - Edge Function implementation
- `src/utils/auditLog.ts` - Audit logging utility (used by frontend)

## Changelog

### 2025-12-06
- Initial implementation
- Fixed 403 Forbidden error by moving admin operations to Edge Function
- Replaced `getUserByEmail()` with `listUsers()` for compatibility
- Added comprehensive error handling
- Deployed to production

