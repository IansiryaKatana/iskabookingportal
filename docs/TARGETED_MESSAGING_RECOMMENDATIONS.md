# Targeted Student Messaging Feature - Implementation Complete ✅

**Status**: ✅ **IMPLEMENTED & DEPLOYED** (2025-11-25)

## Executive Summary

The **"Targeted Messages"** feature has been successfully implemented and deployed. It allows staff to send messages to specific students or students matching particular criteria, complementing the existing bulk messages feature (which sends to all confirmed students) with granular targeting capabilities.

---

## Current System Analysis

### Existing Bulk Messages Feature
- **Target**: All students with `status = 'confirmed'` applications
- **Workflow**: 
  1. Select email template
  2. Enter notification title & message
  3. Send to all confirmed students
- **Features**: 
  - Email template integration with variable replacement
  - In-app notifications
  - Email delivery via Resend
  - Basic filtering (contract_id, studio_grade_id, academic_year_id) - but still limited to confirmed students
  - Message history tracking

### Available Student Data for Filtering

Based on your database schema, here are the filtering categories available:

#### 1. **Application Status** (from `student_applications.status`)
- `draft` - Application started but not submitted
- `awaiting_deposit` - Waiting for deposit payment
- `awaiting_signature` - Waiting for signatures
- `awaiting_verification` - Waiting for document verification
- `confirmed` - Fully confirmed students
- `cancelled` - Cancelled applications
- `expired` - Expired applications

#### 2. **Personal Details** (from `student_application_steps` step 1 payload)
- Country/Nationality
- Gender
- Ethnicity
- Age range (calculated from DOB)
- UCAS ID (presence/absence)

#### 3. **Academic Information** (from `student_application_steps` step 3 payload)
- Academic Year (1st year, 2nd year, etc.)
- Field of Study
- Disability status
- Medical requirements
- Entry to UK date

#### 4. **Application Progress** (from `student_application_steps`)
- Step completion status (which steps are complete)
- Document upload status (from `student_documents`)
- Signature status (from `student_signatures`)

#### 5. **Accommodation Details** (from `student_applications` & related tables)
- Studio Grade
- Contract
- Academic Year (via contract)
- Payment Plan
- Assigned Studio

#### 6. **Contact Information** (from `student_application_steps` step 2 payload)
- Country (from address)
- Postcode/Town

#### 7. **Payment Status** (from `contract_payment_schedule` & Stripe)
- Overdue payments
- Upcoming payments
- Payment plan type

---

## Recommended Feature: "Targeted Messages"

### Feature Overview
A new admin page that allows staff to:
1. **Select specific students** by name/email (multi-select with search)
2. **Filter by categories** using the criteria above
3. **Combine filters** (AND/OR logic)
4. **Preview recipient list** before sending
5. **Use same email template workflow** as bulk messages

### UI/UX Recommendations

#### Page Structure
```
┌─────────────────────────────────────────────────┐
│  Targeted Messages                              │
│  Send personalized messages to specific students │
│                                    [+ New Message] │
├─────────────────────────────────────────────────┤
│                                                 │
│  [Tab 1: Select Students]                      │
│  ┌─────────────────────────────────────────┐   │
│  │ Search students...                      │   │
│  │ [Search box with autocomplete]          │   │
│  │                                         │   │
│  │ Selected Students (3):                  │   │
│  │ [John Doe] [Jane Smith] [Bob Wilson]    │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  [Tab 2: Filter by Category]                   │
│  ┌─────────────────────────────────────────┐   │
│  │ Application Status: [All ▼]            │   │
│  │ Studio Grade: [All ▼]                  │   │
│  │ Country: [All ▼]                       │   │
│  │ Academic Year: [All ▼]                 │   │
│  │ ...                                     │   │
│  │                                         │   │
│  │ [Preview Recipients (12)]               │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  [Tab 3: Message & Template]                   │
│  ┌─────────────────────────────────────────┐   │
│  │ Email Template: [Select template ▼]     │   │
│  │ Notification Title: [________]            │   │
│  │ Notification Message: [________]         │   │
│  │ Notification Type: [Info ▼]              │   │
│  │                                         │   │
│  │ [Preview Email] [Send Message]          │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

#### Key UI Components

1. **Student Selector**
   - Searchable multi-select dropdown
   - Shows: Name, Email, Application Status, Studio
   - Visual badges for quick status identification
   - "Select All" option for filtered results

2. **Filter Builder**
   - Accordion-style filter groups
   - Each filter shows count of matching students
   - "Clear All Filters" button
   - Real-time recipient count update

3. **Recipient Preview**
   - Modal/drawer showing list of recipients
   - Grouped by filter criteria
   - Export to CSV option
   - Shows: Name, Email, Status, Studio

4. **Message Composition**
   - Same beautiful interface as bulk messages
   - Template selection with preview
   - Variable replacement preview
   - Recipient count display

### Filter Categories (Detailed)

#### Category 1: Application Status
- **Use Case**: Send reminders to students at specific stages
- **Options**: 
  - All statuses
  - Draft (incomplete applications)
  - Awaiting Deposit
  - Awaiting Signature
  - Awaiting Verification
  - Confirmed
  - Multiple selection allowed

#### Category 2: Personal Demographics
- **Use Case**: Targeted communications based on student background
- **Options**:
  - Country/Nationality (multi-select)
  - Gender
  - Age Range (slider: 18-25, 26-30, 31+)
  - Ethnicity

#### Category 3: Academic Information
- **Use Case**: Academic year-specific or field-specific messaging
- **Options**:
  - Academic Year (1st, 2nd, 3rd, 4th, Postgraduate)
  - Field of Study (multi-select)
  - Has Disability (Yes/No/All)
  - Medical Requirements (Yes/No/All)

#### Category 4: Accommodation Details
- **Use Case**: Studio or contract-specific communications
- **Options**:
  - Studio Grade (multi-select)
  - Contract (multi-select)
  - Academic Year (via contract)
  - Payment Plan (multi-select)
  - Assigned Studio (searchable)

#### Category 5: Application Progress
- **Use Case**: Remind students about incomplete steps
- **Options**:
  - Missing Step 1 (Personal Details)
  - Missing Step 2 (Contact Info)
  - Missing Step 3 (Academic Info)
  - Missing Step 4 (Documents)
  - Missing Step 5 (Payment Plan)
  - Missing Step 6 (Signatures)
  - Documents Pending Approval
  - Documents Rejected

#### Category 6: Payment Status
- **Use Case**: Payment reminders and overdue notices
- **Options**:
  - Has Overdue Payments
  - Payment Due in Next 7 Days
  - Payment Due in Next 30 Days
  - Payment Plan Type (3-installment, 10-installment, etc.)

#### Category 7: Date-Based Filters
- **Use Case**: Time-sensitive communications
- **Options**:
  - Application Created (date range)
  - Contract Start Date (date range)
  - Contract End Date (date range)
  - Entry to UK Date (date range)

---

## Implementation Recommendations

### Phase 1: Core Functionality (MVP)
1. **Student Multi-Select**
   - Searchable student list
   - Manual selection of specific students
   - Basic filtering (status, studio grade, contract)

2. **Basic Filtering**
   - Application status
   - Studio grade
   - Contract
   - Academic year

3. **Message Composition**
   - Reuse bulk messages UI components
   - Email template integration
   - Notification creation

### Phase 2: Advanced Filtering
1. **Extended Filters**
   - Personal demographics
   - Academic information
   - Application progress
   - Payment status

2. **Filter Combinations**
   - AND logic (all filters must match)
   - OR logic (any filter matches)
   - Save filter presets

### Phase 3: Enhanced Features
1. **Smart Features**
   - Saved filter templates
   - Scheduled messages
   - A/B testing support
   - Message analytics

2. **Integration**
   - Export recipient lists
   - Bulk actions on filtered students
   - Integration with other admin features

---

## Technical Implementation Approach

### Database Changes
**Minimal changes needed** - your existing schema supports this:
- `bulk_messages` table already has `filters` JSONB column
- Can store filter criteria in this column
- Add `message_type` enum: `'bulk' | 'targeted'` to distinguish

### Edge Function Updates
**Extend `send-bulk-message` function** to:
1. Accept filter criteria in `filters` object
2. Query students based on filters (not just confirmed)
3. Support student_id array for direct selection
4. Handle complex filter combinations

### Frontend Components
**New page**: `src/pages/admin/TargetedMessages.tsx`
- Reuse components from `BulkMessages.tsx`
- Add filter builder component
- Add student selector component
- Add recipient preview component

### Filter Query Logic
```typescript
// Example filter structure
{
  type: 'targeted', // vs 'bulk'
  student_ids?: string[], // Direct selection
  filters: {
    application_status?: string[],
    studio_grade_id?: string[],
    contract_id?: string[],
    country?: string[],
    academic_year?: string[],
    has_disability?: boolean,
    missing_steps?: number[],
    payment_overdue?: boolean,
    // ... more filters
  },
  logic: 'AND' | 'OR' // Filter combination logic
}
```

---

## Use Case Examples

### Example 1: Remind Incomplete Applications
**Scenario**: Send reminder to students who haven't completed Step 3
- **Filter**: Missing Step 3 (Academic Info)
- **Status**: Draft or Awaiting Deposit
- **Template**: "Complete Your Application" template
- **Result**: Targeted message to 15 students

### Example 2: International Student Welcome
**Scenario**: Welcome message for international students
- **Filter**: Country NOT "United Kingdom"
- **Status**: Confirmed
- **Template**: "International Student Welcome" template
- **Result**: Message to 45 international students

### Example 3: Payment Reminder
**Scenario**: Remind students with overdue payments
- **Filter**: Has Overdue Payments = true
- **Status**: Confirmed
- **Template**: "Payment Reminder" template
- **Result**: Urgent message to 8 students

### Example 4: Studio-Specific Announcement
**Scenario**: Announcement for Premium Studio students
- **Filter**: Studio Grade = "Premium"
- **Status**: Confirmed
- **Template**: Custom announcement template
- **Result**: Message to 20 premium studio students

### Example 5: Specific Student Group
**Scenario**: Send to 5 specific students by name
- **Selection**: Manual selection of 5 students
- **Template**: Custom template
- **Result**: Direct message to selected students

---

## UI/UX Best Practices

### Mobile Responsiveness
- Filter accordion collapses on mobile
- Student selector uses bottom sheet on mobile
- Preview modal full-screen on mobile
- Touch-friendly filter toggles

### User Experience
- **Real-time feedback**: Show recipient count as filters change
- **Validation**: Prevent sending to 0 recipients
- **Confirmation**: Show recipient list before final send
- **Progress**: Loading states during send
- **History**: Track all targeted messages in history

### Accessibility
- Keyboard navigation for all filters
- Screen reader support
- Clear focus indicators
- High contrast mode support

---

## Integration with Existing Features

### Relationship to Bulk Messages
- **Bulk Messages**: "Send to all confirmed students"
- **Targeted Messages**: "Send to specific students or filtered groups"
- Both use same email template system
- Both appear in same message history (with type indicator)

### Navigation Structure
```
Admin Portal
├── Messages
│   ├── Bulk Messages (existing)
│   └── Targeted Messages (new)
├── Email Templates
└── ...
```

---

## Implementation Status

✅ **Phase 1 (MVP) - COMPLETED**:
- ✅ Student multi-select with searchable dropdown
- ✅ Basic filtering (application status, studio grade, academic year)
- ✅ Message composition with email template integration
- ✅ Message history tracking (separated from bulk messages)
- ✅ Mobile-responsive UI
- ✅ Edge function updated to support both bulk and targeted modes

🔄 **Phase 2 (Future Enhancements)**:
- Advanced filters (country, gender, academic info, payment status)
- Filter combinations (AND/OR logic)
- Saved filter presets
- Recipient preview before sending

## Implementation Details

- **Route**: `/admin/targeted-messages`
- **Component**: `src/pages/admin/TargetedMessages.tsx`
- **Hooks**: `src/hooks/useTargetedMessages.ts`
- **Edge Function**: `supabase/functions/send-bulk-message/index.ts` (updated to support `mode: "targeted"`)
- **Database**: Uses existing `bulk_messages` table with `message_type: "targeted"` in `filters` JSONB column
- **Migration**: `supabase/migrations/20250222_add_bulk_messages_filters_index.sql` (optional GIN index for performance)

---

## Questions for Consideration

1. **Filter Complexity**: How complex should filters be? Simple dropdowns or advanced query builder?
2. **Performance**: How many students can we filter efficiently? (Consider pagination for large result sets)
3. **Permissions**: Should all staff have access, or only certain roles?
4. **Message Limits**: Should there be limits on number of recipients per message?
5. **Scheduling**: Do you want scheduled messages (send later) in Phase 1 or later?
6. **Templates**: Should certain templates be restricted to certain filter types?

---

## Conclusion

The targeted messaging feature will significantly enhance your communication capabilities by allowing precise, personalized messaging to specific student groups. By building on your existing bulk messages infrastructure, we can deliver this feature efficiently while maintaining consistency with your current system.

The recommended approach provides flexibility for both simple use cases (select 5 students) and complex scenarios (filter by multiple criteria), making it a powerful tool for your staff to communicate effectively with students.

