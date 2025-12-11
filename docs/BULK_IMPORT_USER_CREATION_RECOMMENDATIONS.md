# Bulk Import User Creation - Recommendations & Alignment

## Context Analysis

### Your Use Case
- **Bulk importing ongoing confirmed applications** for 2024/25 academic year
- Applications are **already confirmed** (deposits paid, contracts signed)
- Students need **quick access** to portal to view their applications and make payments
- You want to **review applications** before sending invitations

### Database Constraints
- `student_applications.student_id` is **NOT NULL** and references `auth.users(id)`
- Cannot create applications without a user ID
- Foreign key constraint prevents NULL values

### Existing Infrastructure
- ✅ **Bulk messaging system** exists (`send-bulk-message` Edge Function)
- ✅ **Email template system** for personalized emails
- ✅ **Bulk message tracking** (`bulk_messages` table)
- ✅ Can filter by various criteria (contract, status, date range)

### Code Impact Analysis
- Admin queries fetch applications and join with profiles (handles missing profiles)
- Student portal queries filter by `student_id` (would need NULL handling)
- Most queries can be adapted to handle placeholder users

---

## Recommended Solution: **Placeholder Users + Bulk Invitations**

### Why This Approach?

1. **Respects Database Constraints**: No schema changes needed
2. **Leverages Existing Infrastructure**: Uses bulk messaging system
3. **Better Control**: Review before inviting
4. **Quick Access**: Students get access when you're ready
5. **Clean Separation**: Import data first, activate accounts second

---

## Implementation Strategy

### Phase 1: Import with Placeholder Users

**During Import:**
1. Create **placeholder auth users** for each email
   - Generate random secure password
   - Mark email as verified (`email_confirm: true`)
   - Set profile `role = 'student'`
   - Add metadata flag: `is_placeholder: true` or `account_status: 'pending_activation'`
   - **DO NOT send password reset email** during import

2. Create applications linked to placeholder users
   - All data imported successfully
   - Applications fully functional
   - Students can't login yet (don't know password)

**Benefits:**
- ✅ All database constraints satisfied
- ✅ Applications fully imported
- ✅ No schema changes needed
- ✅ Fast import (no email sending)

### Phase 2: Bulk Account Activation via Invitations

**After Import (Manual Trigger):**
1. Admin reviews imported applications
2. Admin goes to new page: `/admin/bulk-invitations`
3. System shows:
   - Applications with placeholder users
   - Filter by contract, status, date range
   - Count of pending invitations
4. Admin selects applications to invite
5. Admin clicks "Send Account Invitations"
6. System:
   - Finds placeholder users for selected applications
   - Generates password reset links for each
   - Sends bulk invitation emails using existing bulk messaging system
   - Updates user metadata: `account_status: 'invited'`
   - Tracks invitation status

**Invitation Email:**
- Welcome message
- "Activate Your Account" button/link
- Portal access instructions
- Support contact info
- Uses existing email template system

**User Experience:**
1. Student receives invitation email
2. Clicks "Activate Account" link
3. Sets password
4. Can immediately access portal
5. Sees their application(s) and can make payments

---

## Detailed Recommendations

### 1. Should we allow applications without users?

**Recommendation: NO** - Use placeholder users instead

**Reasoning:**
- Database constraint requires `student_id NOT NULL`
- Schema change would require migration and code updates
- Placeholder users are cleaner and maintain referential integrity
- Can track invitation status via user metadata

**Implementation:**
```typescript
// During import
const placeholderUser = await supabaseAdmin.auth.admin.createUser({
  email: normalizedEmail,
  password: generateRandomPassword(), // Secure random password
  email_confirm: true,
  user_metadata: {
    first_name: firstName,
    last_name: lastName,
    account_status: 'pending_activation', // Flag for placeholder
    imported_at: new Date().toISOString(),
  },
});
```

### 2. When should invitations be sent?

**Recommendation: Manual trigger after review, with option for immediate**

**Options:**
- **Option A (Recommended)**: Manual trigger only
  - Admin reviews applications
  - Selects which to invite
  - Triggers invitations when ready
  - Best for quality control

- **Option B**: Immediate after import
  - Checkbox during import: "Send invitations immediately"
  - If checked, sends invitations right after import
  - Good for trusted data sources

- **Option C**: Scheduled
  - Set date/time for bulk invitations
  - Good for planned rollouts

**My Recommendation: Option A + Option B**
- Default: Manual trigger (safer)
- Option: "Send invitations immediately" checkbox during import
- Gives flexibility for different scenarios

### 3. What if user already exists?

**Recommendation: Link to existing user, skip invitation**

**Logic:**
1. Check if user exists by email
2. If exists:
   - Link application to existing user
   - Update profile if needed
   - **Skip invitation** (user already has account)
   - Log: "Application linked to existing user"
3. If not exists:
   - Create placeholder user
   - Mark for invitation

**Implementation:**
```typescript
// Check existing user first
const existingUser = await supabaseAdmin.auth.admin.getUserByEmail(email);
if (existingUser?.user) {
  // Link to existing user, skip placeholder creation
  return { userId: existingUser.user.id, isPlaceholder: false };
}
// Create placeholder user
```

### 4. Invitation link expiration?

**Recommendation: 30 days**

**Reasoning:**
- Ongoing academic year applications
- Students may not check email immediately
- 30 days gives reasonable time
- Can resend if expired

**Implementation:**
- Use Supabase password reset link (default 1 hour)
- OR create custom invitation token with 30-day expiration
- Store in user metadata: `invitation_sent_at`, `invitation_expires_at`

### 5. Bulk invitation limits?

**Recommendation: Batch processing with rate limiting**

**Strategy:**
- Process in batches of 50-100 invitations
- Rate limit: 10-20 emails per second (Resend limits)
- Progress tracking: Show "Sending 50/200 invitations..."
- Error handling: Continue on individual failures
- Retry mechanism: Failed invitations can be resent

**Implementation:**
```typescript
// Batch processing
const BATCH_SIZE = 50;
const RATE_LIMIT_DELAY = 100; // ms between batches

for (let i = 0; i < users.length; i += BATCH_SIZE) {
  const batch = users.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(sendInvitation));
  await delay(RATE_LIMIT_DELAY);
}
```

---

## Database Schema Considerations

### Option A: Use User Metadata (Recommended - No Schema Changes)

**Store invitation status in `auth.users.user_metadata`:**
```json
{
  "account_status": "pending_activation" | "invited" | "activated",
  "invitation_sent_at": "2025-01-15T10:00:00Z",
  "invitation_expires_at": "2025-02-14T10:00:00Z",
  "imported_at": "2025-01-15T09:00:00Z"
}
```

**Benefits:**
- ✅ No schema changes
- ✅ Easy to query and filter
- ✅ Can update via Admin API

### Option B: Add Application Metadata Column (Optional Enhancement)

**Add to `student_applications` table:**
```sql
ALTER TABLE student_applications
ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;

-- Store invitation info
-- metadata: { "invitation_sent_at": "...", "invitation_status": "pending" }
```

**Benefits:**
- ✅ Application-level tracking
- ✅ Can track per-application invitation status
- ⚠️ Requires migration

**Recommendation: Start with Option A, add Option B later if needed**

---

## Integration with Existing Bulk Messaging System

### Leverage `send-bulk-message` Edge Function

**Create new invitation mode:**
```typescript
// Extend send-bulk-message to support invitation mode
{
  mode: "invitations", // New mode
  filter: {
    account_status: "pending_activation",
    // ... other filters
  },
  email_template_id: "account-invitation-template-id"
}
```

**Or create dedicated Edge Function:**
- `bulk-invite-students` - Specialized for account invitations
- Reuses email template system
- Handles password reset link generation
- Tracks invitation status

**Recommendation: Dedicated function for clarity and specialization**

---

## Admin UI Recommendations

### New Page: `/admin/bulk-invitations`

**Features:**
1. **List View:**
   - Applications with placeholder users
   - Filter by:
     - Contract
     - Academic year
     - Status
     - Import date
     - Invitation status
   - Search by student name/email

2. **Bulk Selection:**
   - Select all / Select none
   - Select by filter
   - Selected count display

3. **Invitation Actions:**
   - "Send Invitations" button
   - "Preview Email" button
   - "Resend Invitations" (for failed/expired)

4. **Status Tracking:**
   - Pending activation
   - Invitation sent
   - Invitation expired
   - Account activated
   - Failed to send

5. **Statistics:**
   - Total pending invitations
   - Sent today
   - Activated today
   - Failed invitations

---

## Email Template Recommendations

### Create "Account Invitation" Template

**Variables:**
- `{student_name}` - First name from application
- `{portal_url}` - Portal URL
- `{invitation_link}` - Password reset link
- `{contract_name}` - Contract name
- `{academic_year}` - Academic year
- `{expiration_date}` - Link expiration date

**Content:**
- Welcome message
- "Activate Your Account" CTA button
- Portal access instructions
- Support contact
- Expiration notice

---

## Workflow Summary

### Import Phase
1. Admin uploads CSV
2. System creates placeholder users (no emails sent)
3. Applications imported and linked to placeholder users
4. Import completes successfully

### Review Phase
1. Admin reviews imported applications
2. Verifies data quality
3. Selects applications to invite

### Invitation Phase
1. Admin triggers bulk invitations
2. System sends invitation emails in batches
3. Tracks invitation status
4. Students receive emails

### Activation Phase
1. Student clicks invitation link
2. Sets password
3. Account activated
4. Can access portal immediately

---

## Implementation Priority

### Phase 1: Core Functionality (Week 1)
1. ✅ Modify import to create placeholder users
2. ✅ Add `account_status` metadata flag
3. ✅ Create invitation Edge Function
4. ✅ Basic invitation email template

### Phase 2: Admin UI (Week 2)
1. ✅ Create `/admin/bulk-invitations` page
2. ✅ List and filter applications
3. ✅ Bulk selection and invitation trigger
4. ✅ Status tracking display

### Phase 3: Enhancements (Week 3)
1. ✅ Resend functionality
2. ✅ Expiration handling
3. ✅ Statistics dashboard
4. ✅ Email preview

---

## Questions for Final Alignment

1. **Placeholder Users**: ✅ Approved - Create placeholder users during import
2. **Invitation Timing**: Manual trigger + optional immediate? ✅ Recommended
3. **Existing Users**: Link and skip invitation? ✅ Recommended
4. **Expiration**: 30 days? ✅ Recommended
5. **Batch Size**: 50-100 per batch? ✅ Recommended
6. **Email Template**: Create dedicated template? ✅ Recommended

---

## Next Steps

1. **Confirm Recommendations**: Review and approve approach
2. **Design Email Template**: Create invitation email design
3. **Plan Implementation**: Break down into tasks
4. **Test Workflow**: Test with sample data
5. **Documentation**: Update user guides

---

## Alternative Consideration

### If Schema Change is Acceptable

**Option: Make `student_id` nullable**
- Requires migration
- Update all queries to handle NULL
- More complex but allows true "applications without users"
- **Not recommended** due to complexity and code impact

**Recommendation: Stick with placeholder users approach**

