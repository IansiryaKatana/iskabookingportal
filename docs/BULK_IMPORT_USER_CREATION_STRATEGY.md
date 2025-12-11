# Bulk Import User Creation Strategy - Alignment Document

## Overview

This document outlines the two approaches for handling user account creation during bulk application imports, and recommends the **post-import bulk email invitation** approach.

---

## Approach 1: Create Users During Import (Current Implementation)

### How It Works
1. **During Import**:
   - Edge Function creates auth users for each email in CSV
   - Generates random password
   - Sends password reset email immediately
   - Creates profile with `role = 'student'`
   - Links application to user

2. **User Experience**:
   - User receives password reset email
   - Clicks link to set password
   - Can immediately access portal

### Pros
- ✅ Users can access portal immediately after import
- ✅ Single-step process
- ✅ Automatic account creation

### Cons
- ❌ Users receive emails during import (may be overwhelming)
- ❌ No control over when accounts are created
- ❌ If import fails partially, some users created, some not
- ❌ Can't review applications before sending invites
- ❌ Email sending during import can slow down process

---

## Approach 2: Post-Import Bulk Email Invitation (RECOMMENDED)

### How It Works

#### Phase 1: Import Applications (Without User Creation)
1. **During Import**:
   - Import applications WITHOUT creating auth users
   - Store email addresses in application records
   - Applications are linked to emails, not user IDs yet
   - All data imported successfully

2. **Database Function**:
   - Accepts applications even if user doesn't exist
   - Stores email in application record
   - Creates application with `student_id = NULL` (or placeholder)
   - Later, when user is created, link application to user

#### Phase 2: Bulk Account Creation via Email Invitations
1. **After Import**:
   - Admin reviews imported applications
   - Admin triggers "Send Account Invitations" action
   - System sends bulk invitation emails to all imported students
   - Each email contains unique invitation link

2. **User Experience**:
   - Student receives invitation email
   - Clicks link to create account
   - Sets password
   - Account automatically linked to their application(s)
   - Can immediately access portal

### Pros
- ✅ **Better Control**: Review applications before sending invites
- ✅ **Cleaner Process**: Import data first, create accounts second
- ✅ **Bulk Email System**: Use existing bulk messaging infrastructure
- ✅ **No Partial Failures**: All applications imported, then all accounts created
- ✅ **Flexible Timing**: Send invites when ready (e.g., after verification)
- ✅ **Better UX**: Students receive invitation when you're ready, not during import

### Cons
- ⚠️ Two-phase process (but more controlled)
- ⚠️ Applications temporarily without user IDs (but manageable)

---

## ✅ IMPLEMENTED: Approach 2 - Placeholder Users + Bulk Invitations

### Phase 1: Import with Placeholder Users ✅ COMPLETE

#### Implementation Details
- **Database Function**: No changes needed - `student_id` remains NOT NULL
- **Edge Function**: Creates placeholder users during import
- **User Metadata**: Stores `account_status: 'pending_activation'`
- **No Emails**: Placeholder users created without sending emails

#### Edge Function Implementation
```typescript
// For applications import:
// - createUsers = true (default)
// - send_welcome_email = false (default) - Creates placeholders
// - Creates users with account_status: 'pending_activation'
// - Links applications to placeholder users
```

### Phase 2: Bulk Account Invitation System ✅ COMPLETE

#### Edge Function: `bulk-invite-students` ✅ IMPLEMENTED
**Location:** `supabase/functions/bulk-invite-students/index.ts`

**Features:**
- Finds applications with placeholder users
- Generates password reset links (30-day expiration)
- Sends invitation emails via Resend API
- Updates user metadata with invitation status
- Batch processing (50 per batch) with rate limiting
- Tracks sent/skipped/failed counts

#### Admin UI: Bulk Invitation Page ✅ IMPLEMENTED
**Location:** `src/pages/admin/BulkInvitations.tsx`
**Route:** `/admin/bulk-invitations`

**Features:**
- ✅ View all imported applications with placeholder users
- ✅ Filter by academic year, contract, status
- ✅ Bulk selection (select all/individual)
- ✅ Statistics dashboard (total, pending, invited, activated)
- ✅ Send invitations dialog with template selection
- ✅ Resend option for already invited users
- ✅ Status badges and tracking

#### Invitation Email Template
- Uses existing email template system
- Supports custom templates via `email_template_id`
- Default: Uses Supabase password reset email
- Variables: `{student_name}`, `{portal_url}`, `{invitation_link}`, `{contract_name}`, `{academic_year}`, `{expiration_date}`

---

## ✅ Implementation Complete

### Step 1: Modify Bulk Import (Create Placeholder Users) ✅ COMPLETE

**Database Function** (`bulk_import_student_applications`):
- ✅ No changes needed - `student_id` remains NOT NULL
- ✅ Applications linked to placeholder users during import

**Edge Function** (`bulk-import-data`):
- ✅ For applications: `createUsers = true` (default)
- ✅ `send_welcome_email = false` (default) - Creates placeholders
- ✅ Creates users with `account_status: 'pending_activation'`
- ✅ Uses `listUsers()` and filters by email (compatible with Supabase JS v2.57.2)

### Step 2: Create Bulk Invitation System ✅ COMPLETE

**Edge Function** (`bulk-invite-students`): ✅ IMPLEMENTED
- ✅ Accepts filter criteria (contract, status, date range, application IDs)
- ✅ Finds applications with placeholder users
- ✅ Generates password reset links
- ✅ Sends invitation emails
- ✅ Updates user metadata with invitation status

**Admin UI Component**: ✅ IMPLEMENTED
- ✅ Page: `/admin/bulk-invitations`
- ✅ Lists applications with placeholder users
- ✅ Bulk selection and invitation trigger
- ✅ Invitation status tracking
- ✅ Statistics dashboard

**Email Template**:
- ✅ Supports custom templates via `email_template_id`
- ✅ Default: Uses Supabase password reset email
- ✅ Variables: `{student_name}`, `{portal_url}`, `{invitation_link}`, etc.

### Step 3: User Account Activation ✅ COMPLETE

**When User Activates Account**:
- ✅ User clicks invitation link (password reset link)
- ✅ Sets password
- ✅ Account activated automatically
- ✅ Applications already linked (created during import)
- ✅ User can access portal immediately

---

## Database Schema Changes Needed

### Option A: Store Email in Application (Recommended)
```sql
-- Add email column to student_applications
ALTER TABLE student_applications 
ADD COLUMN student_email TEXT;

-- Index for lookup
CREATE INDEX idx_student_applications_email 
ON student_applications(student_email) 
WHERE student_id IS NULL;
```

### Option B: Use Application Steps (Current)
- Email already stored in `student_application_steps` step 2 payload
- Query applications where `student_id IS NULL`
- Extract email from step 2 payload
- Link when user is created

---

## Workflow Example

### Import Phase
1. Admin uploads CSV with 100 applications
2. System imports all 100 applications
3. Applications created with `student_id = NULL`
4. Email stored in application (step 2 payload)
5. Import completes successfully

### Invitation Phase
1. Admin reviews imported applications
2. Admin goes to `/admin/bulk-invitations`
3. Sees 100 applications needing invitations
4. Selects all (or filters by criteria)
5. Clicks "Send Invitations"
6. System:
   - Creates 100 auth users
   - Sends 100 invitation emails
   - Links applications to users
7. Students receive emails and create accounts

### User Experience
1. Student receives invitation email
2. Clicks "Create Account" link
3. Sets password
4. Account created and linked to application
5. Can immediately access portal

---

## Benefits of This Approach

1. **Separation of Concerns**: Data import separate from account creation
2. **Better Control**: Review before inviting
3. **Flexible Timing**: Send invites when ready
4. **Bulk Email System**: Leverage existing infrastructure
5. **No Partial Failures**: All data imported, then all accounts created
6. **Better UX**: Students receive invitation when you're ready

---

## ✅ Decisions Made and Implemented

1. **Should we allow applications without users?**
   - ✅ **Decision**: Create placeholder users (maintains referential integrity)
   - ✅ **Implementation**: Placeholder users created with `account_status: 'pending_activation'`

2. **When should invitations be sent?**
   - ✅ **Decision**: Manual trigger after review (with option for immediate)
   - ✅ **Implementation**: Admin triggers via `/admin/bulk-invitations` page

3. **What if user already exists?**
   - ✅ **Decision**: Link application to existing user, skip invitation
   - ✅ **Implementation**: Checks for existing users, links applications, skips invitation

4. **Invitation link expiration?**
   - ✅ **Decision**: 30 days
   - ✅ **Implementation**: Links expire after 30 days, can be resent

5. **Bulk invitation limits?**
   - ✅ **Decision**: Batch processing (50 per batch) with rate limiting
   - ✅ **Implementation**: Processes 50 invitations per batch, 100ms delay between batches

---

## ✅ Implementation Status

1. ✅ **Approach Confirmed**: Approach 2 (Post-Import Bulk Invitations) - APPROVED
2. ✅ **Import Modified**: Creates placeholder users during import
3. ✅ **Invitation System**: Edge function + Admin UI - COMPLETE
4. ⚠️ **Email Template**: Optional - Can create custom template, defaults to Supabase password reset
5. ✅ **Testing**: Single application import tested and working
6. ✅ **Documentation**: Updated with implementation details

## 🚀 Next Steps (Optional Enhancements)

1. **Create Custom Email Template**: Design branded invitation email template
2. **Test Large Imports**: Test with 50+ applications
3. **Monitor Performance**: Track invitation delivery rates
4. **Staff Training**: Create user guide for admin staff

---

## Related Documentation

- `BULK_APPLICATION_IMPORT_RECOMMENDATIONS.md` - Original recommendations
- `BULK_APPLICATION_IMPORT_PROPOSAL.md` - Full proposal
- `BULK_APPLICATION_IMPORT_IMPLEMENTATION.md` - Implementation guide
- Bulk messaging system docs - For email sending infrastructure

