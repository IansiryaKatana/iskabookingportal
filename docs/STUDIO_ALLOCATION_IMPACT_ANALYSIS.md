# Studio Allocation Options - Impact Analysis & Recommendations

## Overview

This document analyzes the impact of changing Studio Allocation options from the current system (`student`, `staff`, `unallocated`) to the new system (`Student`, `OTA`, `Keyworkers`, `Unallocated`), and outlines the required changes.

---

## Current System Analysis

### Current Allocation Values
- **Current options**: `student`, `staff`, `unallocated` (or `null`)
- **Storage**: `studios.allocation` is a TEXT field (flexible, no enum constraint)
- **Usage**: Used for filtering and display purposes

### Current Implementation
1. **Database**: `studios.allocation` TEXT field (line 156 in schema)
2. **UI Filter**: Dropdown in Studios page with options: "student", "staff", "unallocated"
3. **Hooks**: `useAdminStudios` filters by allocation value
4. **Views**: `studio_status_by_academic_year` includes allocation field
5. **No automatic setting**: Allocation is manually set, not automatically set when applications are confirmed

---

## Proposed Changes

### New Allocation Options
- **Student** - Allocated to a student (via application)
- **OTA** - Allocated to OTA (Online Travel Agency/partner)
- **Keyworkers** - Allocated to keyworkers
- **Unallocated** - Not allocated to anyone (null or "unallocated")

### Additional Features Requested
1. **Bulk Select** - Select multiple studios and change allocation in bulk
2. **Floor Filter** - Filter studios by floor number
3. **Status Filter** - Already exists, but ensure it works with new allocation system

---

## Impact Analysis

### ✅ Low Impact Areas (Easy Changes)

#### 1. Database Schema
- **Impact**: ✅ **NONE** - `allocation` is already TEXT field, no enum constraint
- **Action**: No migration needed for schema change
- **Note**: May want to add CHECK constraint or enum type for data integrity (optional)

#### 2. Studios Admin Page UI
- **Impact**: ✅ **LOW** - Just update dropdown options
- **Files to change**:
  - `src/pages/admin/Studios.tsx` - Update allocation filter dropdown
- **Current code** (lines 103-113):
  ```typescript
  <SelectItem value="student">Student</SelectItem>
  <SelectItem value="staff">Staff</SelectItem>
  <SelectItem value="unallocated">Unallocated</SelectItem>
  ```
- **New code needed**:
  ```typescript
  <SelectItem value="student">Student</SelectItem>
  <SelectItem value="ota">OTA</SelectItem>
  <SelectItem value="keyworkers">Keyworkers</SelectItem>
  <SelectItem value="unallocated">Unallocated</SelectItem>
  ```

#### 3. Filtering Logic
- **Impact**: ✅ **LOW** - Hook already supports any text value
- **Files**: `src/hooks/useAdminStudios.ts` - Already handles any allocation value
- **No changes needed** - Current logic works with any text value

#### 4. Database Views
- **Impact**: ✅ **NONE** - Views just display the allocation field, no logic depends on specific values
- **Files**: `supabase/migrations/20251120_studio_status_by_academic_year.sql`
- **No changes needed** - View just selects `s.allocation` as-is

---

### ⚠️ Medium Impact Areas (Requires Updates)

#### 1. Bulk Allocation Management
- **Impact**: ⚠️ **NEW FEATURE** - Need to implement bulk select UI
- **Requirements**:
  - Checkbox selection for multiple studios
  - Bulk action dropdown/button
  - Update multiple studios at once
  - Confirmation dialog for bulk operations
- **Files to create/modify**:
  - `src/pages/admin/Studios.tsx` - Add bulk selection UI
  - `src/hooks/useAdminStudios.ts` - Add `useBulkUpdateStudio` hook
- **UI/UX Considerations**:
  - Mobile: Checkboxes should be touch-friendly
  - Desktop: "Select All" checkbox in header
  - Bulk action bar appears when studios are selected
  - Show count: "3 studios selected"

#### 2. Floor Filter
- **Impact**: ⚠️ **NEW FEATURE** - Add floor filtering
- **Requirements**:
  - Filter dropdown for floor numbers
  - Extract unique floor values from studios
  - Filter studios by floor
- **Files to modify**:
  - `src/pages/admin/Studios.tsx` - Add floor filter dropdown
  - `src/hooks/useAdminStudios.ts` - Add floor filter parameter
- **Database**: `studios.floor` field already exists (TEXT), just needs filtering

#### 3. Status Filter Enhancement
- **Impact**: ⚠️ **MINOR** - Already exists, but verify it works correctly
- **Current**: Status filter exists (available, reserved, occupied, maintenance)
- **Action**: Verify it works with academic year filtering
- **Files**: `src/pages/admin/Studios.tsx` - Already implemented

---

### 🔍 Areas to Investigate (May Need Updates)

#### 1. Auto-Allocation Trigger
- **Current**: `handle_application_confirmation()` trigger updates studio status but doesn't set allocation
- **Question**: Should allocation be automatically set to "student" when application is confirmed?
- **Impact**: If yes, need to update trigger
- **File**: `supabase/migrations/20250320_auto_allocation_trigger.sql`
- **Recommendation**: 
  - **Option A**: Auto-set allocation to "student" when application confirmed
  - **Option B**: Keep manual allocation (current behavior)
  - **Decision needed**: Which approach do you prefer?

#### 2. Studio Reservation Logic
- **Current**: Students can reserve studios (sets `reservation_expires_at`)
- **Question**: Should reservation automatically set allocation to "student"?
- **Impact**: May need to update reservation logic
- **Files to check**: Studio selection/reservation code

#### 3. Data Migration
- **Current data**: Existing studios may have `allocation = "staff"` 
- **Action needed**: 
  - Update existing "staff" allocations to new values (OTA or Keyworkers?)
  - Or leave as-is and let staff manually update
- **Recommendation**: Create migration to update existing data

#### 4. Reports & Analytics
- **Impact**: ⚠️ **MEDIUM** - Reports may reference allocation
- **Files to check**:
  - `src/hooks/useReports.ts` - Check if allocation is used in reports
  - `src/pages/admin/Reports.tsx` - Check if allocation appears in reports
- **Action**: Update any hardcoded "staff" references to new values

---

## Recommended Implementation Plan

### Phase 1: Core Changes (Required)
1. ✅ Update allocation filter dropdown options
2. ✅ Add floor filter
3. ✅ Verify status filter works correctly
4. ✅ Update any hardcoded allocation value references

### Phase 2: Bulk Management (New Feature)
1. ⚠️ Add checkbox selection to studio list
2. ⚠️ Add bulk action bar (appears when studios selected)
3. ⚠️ Add bulk update hook/function
4. ⚠️ Add confirmation dialog for bulk operations
5. ⚠️ Mobile-responsive bulk selection UI

### Phase 3: Data Migration (If Needed)
1. 🔍 Create migration to update existing "staff" allocations
2. 🔍 Decide on mapping: "staff" → "OTA" or "Keyworkers" or leave for manual update

### Phase 4: Auto-Allocation (Optional Enhancement)
1. 🔍 Update trigger to auto-set allocation when application confirmed
2. 🔍 Update reservation logic to set allocation

---

## Questions for Decision

### 1. Allocation Auto-Setting
**Question**: Should allocation be automatically set when:
- Application is confirmed? (Set to "student")
- Studio is reserved? (Set to "student")
- Or keep it manual only?

**Recommendation**: Auto-set to "student" when application confirmed, keep manual for OTA/Keyworkers

### 2. Existing "staff" Allocations
**Question**: What should happen to existing studios with `allocation = "staff"`?
- Option A: Migrate all to "OTA"
- Option B: Migrate all to "Keyworkers"  
- Option C: Leave as-is, let staff manually update
- Option D: Create migration script to map based on some criteria

**Recommendation**: Option C (leave as-is) - safest, staff can update manually

### 3. Bulk Selection UI/UX
**Question**: Preferred bulk selection pattern?
- Option A: Checkboxes on each studio card
- Option B: Select mode toggle (like Gmail)
- Option C: Multi-select with Shift+Click

**Recommendation**: Option A (checkboxes) - most intuitive, works on mobile

### 4. Floor Filter Values
**Question**: How should floor filter work?
- Option A: Dropdown with all unique floor values from database
- Option B: Text input for exact match
- Option C: Range selector (e.g., "Floor 1-3")

**Recommendation**: Option A (dropdown) - cleaner, prevents typos

---

## Files That Will Be Modified

### Frontend Files
1. `src/pages/admin/Studios.tsx` - Main studios page
   - Update allocation filter options
   - Add floor filter
   - Add bulk selection UI
   - Add bulk action controls

2. `src/hooks/useAdminStudios.ts` - Studios data hook
   - Add floor filter parameter
   - Add bulk update mutation hook

### Database Files (If Needed)
1. `supabase/migrations/[date]_update_studio_allocation_options.sql` (optional)
   - Update existing "staff" allocations if needed
   - Add CHECK constraint for allocation values (optional)

2. `supabase/migrations/20250320_auto_allocation_trigger.sql` (optional)
   - Update trigger to auto-set allocation if desired

### Documentation
1. `docs/architecture-spec.md` - Update allocation documentation

---

## UI/UX Recommendations

### Bulk Selection Design
```
┌─────────────────────────────────────────────────┐
│  Studios                    [3 selected] [Bulk Actions ▼] │
├─────────────────────────────────────────────────┤
│  ☑ Studio 101  │  ☑ Studio 102  │  ☐ Studio 103  │
│  ☑ Studio 201  │  ☐ Studio 202  │  ☐ Studio 203  │
└─────────────────────────────────────────────────┘
```

**Bulk Actions Menu:**
- Set Allocation → Student / OTA / Keyworkers / Unallocated
- Set Status → Available / Reserved / Occupied / Maintenance
- Release Selected (sets to available, clears allocation)

### Mobile Considerations
- Checkboxes should be large enough for touch
- Bulk action bar should be sticky at bottom when items selected
- "Select All" toggle in header
- Swipe actions (optional enhancement)

---

## Testing Checklist

- [ ] Filter by new allocation options (Student, OTA, Keyworkers, Unallocated)
- [ ] Filter by floor
- [ ] Filter by status (with academic year)
- [ ] Bulk select multiple studios
- [ ] Bulk update allocation
- [ ] Bulk update status
- [ ] Verify existing "staff" allocations still work (backward compatibility)
- [ ] Mobile responsiveness of bulk selection
- [ ] Academic year filtering still works
- [ ] Studio status views still work correctly

---

## Summary

### ✅ Safe to Change
- Allocation filter dropdown (just UI change)
- Floor filter (new feature, no breaking changes)
- Status filter (already works)

### ⚠️ Requires Careful Implementation
- Bulk selection UI (new feature)
- Bulk update functionality (new feature)
- Data migration (if updating existing "staff" values)

### 🔍 Needs Decision
- Auto-allocation on application confirmation?
- What to do with existing "staff" allocations?
- Bulk selection UI pattern preference?

---

## Next Steps

1. **Review this analysis** and answer the decision questions
2. **Approve implementation approach**
3. **Implement Phase 1** (core changes)
4. **Implement Phase 2** (bulk management)
5. **Test thoroughly** before deploying

---

## Estimated Impact

- **Breaking Changes**: ⚠️ **MINIMAL** - Only affects admin UI, no API changes
- **Database Changes**: ✅ **NONE** - Schema already supports any text value
- **Migration Risk**: ✅ **LOW** - No required migrations
- **User Impact**: ✅ **POSITIVE** - Better filtering and bulk management

---

**Ready for your review and decisions!** 🚀

