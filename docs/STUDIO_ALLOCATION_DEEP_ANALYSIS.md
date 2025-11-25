# Studio Allocation Deep Analysis & Recommendations

## Executive Summary

This document provides a comprehensive analysis of the impact of changing Studio Allocation options to **Student, OTA, Keyworkers, and Unallocated**, and the requirement that studios allocated to OTA or Keyworkers should **not be available for student selection**. This affects multiple layers of the system: database schema, availability calculations, student selection UI, and admin management.

---

## Current State Analysis

### 1. Database Schema

**Current `studios.allocation` field:**
- Type: `TEXT` (nullable)
- Current usage: Stores `studentId` (UUID) when a studio is reserved by a student
- Location: `supabase/migrations/20250209_dynamic_portal_schema.sql` (line 156)

**Current allocation values in use:**
- `null` - Unallocated
- `{studentId UUID}` - Reserved by specific student (temporary reservation)
- No existing "staff" allocations (confirmed by user)

### 2. Studio Selection Flow (Student Portal)

**File: `src/pages/portal/StudioSelection.tsx`**
- Uses `useStudios(studioGradeId)` hook
- Shows ALL studios for a grade regardless of allocation
- Only filters by `status` (available, reserved, occupied, maintenance)
- **Issue**: Does NOT filter by allocation type

**File: `src/hooks/useStudios.ts`**
- `fetchStudios()` function (lines 7-17):
  ```typescript
  .from("studios")
  .select("*")
  .eq("studio_grade_id", studioGradeId)
  .eq("is_active", true)
  .order("studio_number", { ascending: true });
  ```
- **Issue**: No allocation filtering - returns ALL active studios

### 3. Studio Reservation Logic

**File: `src/hooks/useStudios.ts` - `reserveStudio()` function (lines 34-79)**
- Currently sets `allocation: studentId` (UUID) when reserving
- This is a **temporary reservation** (30-minute expiry)
- **Issue**: Inconsistent with new allocation categories ("Student", "OTA", "Keyworkers")

### 4. Availability Calculations

**Views that calculate availability:**

#### a. `studio_grade_availability` view
- **File**: `supabase/migrations/20251118_studio_availability_tracking.sql`
- **Function**: `get_studio_availability()`
- **Issue**: Does NOT exclude studios with `allocation IN ('OTA', 'Keyworkers')` from available count

#### b. `studio_grade_availability_by_year` view
- **File**: `supabase/migrations/20251120_studio_availability_by_academic_year.sql`
- **Issue**: Does NOT exclude studios with `allocation IN ('OTA', 'Keyworkers')` from available count

#### c. `studio_status_by_academic_year` view
- **File**: `supabase/migrations/20251120_studio_status_by_academic_year.sql`
- **Issue**: Does NOT consider allocation when computing effective status

### 5. Admin Studios Page

**File: `src/pages/admin/Studios.tsx`**
- Current filters: Grade, Status, Allocation
- Allocation filter options: "student", "staff", "unallocated" (lines 109-111)
- **Missing**: Floor filter, Status filter (already exists but may need refinement)
- **Missing**: Bulk select for allocation management

**File: `src/hooks/useAdminStudios.ts`**
- Supports allocation filtering (lines 51-57, 107-113)
- **Issue**: Allocation filter values don't match new options

### 6. Auto-Allocation Trigger

**File: `supabase/migrations/20250320_auto_allocation_trigger.sql`**
- Updates `studios.status` to 'occupied' when application is confirmed
- **Issue**: Does NOT set or check `allocation` field

---

## Impact Analysis

### Critical Changes Required

#### 1. **Student Studio Selection** (HIGH PRIORITY)
- **Current**: Students see ALL studios for their grade
- **Required**: Students should ONLY see studios where:
  - `allocation IS NULL` (Unallocated), OR
  - `allocation = 'Student'`, OR
  - `allocation = {studentId}` (their own temporary reservation)
- **Exclude**: Studios with `allocation IN ('OTA', 'Keyworkers')`

#### 2. **Availability Calculations** (HIGH PRIORITY)
- **Current**: All active studios count toward availability
- **Required**: Exclude OTA/Keyworkers allocated studios from:
  - `available_count` calculations
  - `total_capacity` calculations (or count separately)
  - Public-facing availability displays

#### 3. **Allocation Value Standardization** (MEDIUM PRIORITY)
- **Current**: `allocation` stores UUID for temporary reservations
- **Required**: Decide on allocation value strategy:
  - **Option A**: Store category only ("Student", "OTA", "Keyworkers", "Unallocated")
    - **Pros**: Simple, clear categories
    - **Cons**: Lose ability to track which specific student reserved it
  - **Option B**: Store category + metadata (e.g., JSONB: `{"type": "Student", "student_id": "uuid"}`)
    - **Pros**: Track both category and specific student
    - **Cons**: More complex queries, requires schema change
  - **Option C**: Hybrid - Use category for permanent allocation, keep UUID for temporary reservations
    - **Pros**: Best of both worlds
    - **Cons**: Requires logic to distinguish temporary vs permanent

**Recommendation**: **Option C (Hybrid)**
- Permanent allocation: `allocation = 'Student' | 'OTA' | 'Keyworkers' | NULL`
- Temporary reservation: `allocation = {studentId UUID}` (for 30-min reservations)
- When studio is confirmed: Set `allocation = 'Student'` (permanent)

#### 4. **Reservation Logic Update** (MEDIUM PRIORITY)
- **Current**: `reserveStudio()` sets `allocation: studentId`
- **Required**: Keep temporary reservation as UUID, but ensure filtering logic excludes OTA/Keyworkers

#### 5. **Admin Management** (MEDIUM PRIORITY)
- Update allocation filter options to: "Student", "OTA", "Keyworkers", "Unallocated"
- Add floor filter
- Add bulk select for allocation management
- Ensure status filter works correctly

---

## Recommended Implementation Plan

### Phase 1: Database & Core Logic (Foundation)

#### 1.1 Update Allocation Filtering in `useStudios`
**File**: `src/hooks/useStudios.ts`

**Change**: Modify `fetchStudios()` to exclude OTA/Keyworkers allocated studios:
```typescript
const fetchStudios = async (studioGradeId: string): Promise<StudioRow[]> => {
  const { data, error } = await supabase
    .from("studios")
    .select("*")
    .eq("studio_grade_id", studioGradeId)
    .eq("is_active", true)
    // Exclude OTA and Keyworkers allocated studios
    .or("allocation.is.null,allocation.eq.Student,allocation.not.in.(OTA,Keyworkers)")
    .order("studio_number", { ascending: true });

  if (error) throw error;
  return data ?? [];
};
```

**Note**: For temporary reservations (UUID), we need to allow them. The filter should be:
- `allocation IS NULL` OR
- `allocation = 'Student'` OR
- `allocation` is a UUID (temporary reservation)

**Better approach**: Use a function or RLS policy, or filter in application logic.

#### 1.2 Update Availability Views
**Files**: 
- `supabase/migrations/20251118_studio_availability_tracking.sql`
- `supabase/migrations/20251120_studio_availability_by_academic_year.sql`
- `supabase/migrations/20251120_studio_status_by_academic_year.sql`

**Change**: Exclude studios with `allocation IN ('OTA', 'Keyworkers')` from:
- Available count calculations
- Total capacity (or show separately)

**SQL Example**:
```sql
-- In get_studio_availability function
WHERE s.studio_grade_id = p_studio_grade_id
  AND s.is_active = true
  AND s.status = 'available'
  AND (s.allocation IS NULL OR s.allocation = 'Student' OR s.allocation ~ '^[0-9a-f]{8}-') -- Allow NULL, 'Student', or UUID
  AND s.allocation NOT IN ('OTA', 'Keyworkers')
```

#### 1.3 Create Migration for Allocation Constraint
**New File**: `supabase/migrations/20250223_studio_allocation_constraints.sql`

**Purpose**: 
- Add check constraint to ensure allocation values are valid
- Add index on allocation for performance
- Update comments

```sql
-- Add check constraint for allocation values
ALTER TABLE public.studios
ADD CONSTRAINT studios_allocation_check 
CHECK (
  allocation IS NULL 
  OR allocation = 'Student' 
  OR allocation = 'OTA' 
  OR allocation = 'Keyworkers'
  OR allocation ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' -- UUID format for temporary reservations
);

-- Add index for allocation filtering
CREATE INDEX IF NOT EXISTS idx_studios_allocation 
ON public.studios(allocation) 
WHERE allocation IS NOT NULL;

-- Update comment
COMMENT ON COLUMN public.studios.allocation IS 
'Studio allocation category: NULL (Unallocated), "Student", "OTA", "Keyworkers", or UUID (temporary student reservation)';
```

### Phase 2: Admin UI Updates

#### 2.1 Update Allocation Filter Options
**File**: `src/pages/admin/Studios.tsx`

**Change**: Update allocation filter options (lines 103-113):
```typescript
<SelectContent>
  <SelectItem value="all">All allocations</SelectItem>
  <SelectItem value="Student">Student</SelectItem>
  <SelectItem value="OTA">OTA</SelectItem>
  <SelectItem value="Keyworkers">Keyworkers</SelectItem>
  <SelectItem value="unallocated">Unallocated</SelectItem>
</SelectContent>
```

#### 2.2 Add Floor Filter
**File**: `src/pages/admin/Studios.tsx`

**Change**: Add floor filter state and UI:
```typescript
const [floorFilter, setFloorFilter] = useState<string>("all");

// In filters section:
<Select value={floorFilter} onValueChange={setFloorFilter}>
  <SelectTrigger className="w-full sm:w-40 md:w-56 rounded-full">
    <SelectValue placeholder="Filter by floor" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All floors</SelectItem>
    {/* Dynamically populate from studios data */}
  </SelectContent>
</Select>
```

**Update**: `useAdminStudios` hook to support floor filtering.

#### 2.3 Add Bulk Select for Allocation Management
**File**: `src/pages/admin/Studios.tsx`

**Features**:
- Checkbox column for selecting multiple studios
- "Select All" checkbox
- Bulk action dropdown: "Set Allocation to Student", "Set Allocation to OTA", etc.
- Bulk action dialog with confirmation

**Implementation**: Similar to bulk messages pattern, use checkboxes and a bulk action menu.

### Phase 3: Reservation Logic Refinement

#### 3.1 Update `reserveStudio` to Set Permanent Allocation on Confirmation
**File**: `src/hooks/useStudios.ts`

**Change**: When application is confirmed, update studio allocation to 'Student':
- This should be handled by the auto-allocation trigger or application confirmation logic
- Ensure `allocation` is set to 'Student' when status becomes 'confirmed'

#### 3.2 Update Auto-Allocation Trigger
**File**: `supabase/migrations/20250320_auto_allocation_trigger.sql` (or create new migration)

**Change**: When application is confirmed, set `allocation = 'Student'`:
```sql
IF NEW.status = 'confirmed' AND NEW.assigned_studio_id IS NOT NULL THEN
  UPDATE public.studios
  SET status = 'occupied',
      allocation = 'Student'  -- Set permanent allocation
  WHERE id = NEW.assigned_studio_id;
END IF;
```

---

## Data Migration Considerations

### Existing Data
- **No existing "staff" allocations** (confirmed by user)
- **Existing temporary reservations**: Currently use UUID format
- **Action**: No migration needed for existing data, but ensure new logic handles UUIDs correctly

### Testing Strategy
1. **Unit Tests**: Test allocation filtering logic
2. **Integration Tests**: Test student selection flow with OTA/Keyworkers allocated studios
3. **Manual Testing**: 
   - Allocate studio to OTA → Verify it doesn't appear in student selection
   - Allocate studio to Keyworkers → Verify it doesn't appear in student selection
   - Reserve studio as student → Verify it appears for that student only
   - Confirm application → Verify allocation becomes 'Student'

---

## UI/UX Recommendations for Bulk Selection

### Pattern Reference
- **Similar to**: Bulk Messages page (`src/pages/admin/BulkMessages.tsx`)
- **Components**: Checkboxes, bulk action menu, confirmation dialog

### Implementation Details

#### 1. Selection State Management
```typescript
const [selectedStudios, setSelectedStudios] = useState<Set<string>>(new Set());
const [selectAll, setSelectAll] = useState(false);
```

#### 2. Bulk Action Menu
- Position: Above studio list, appears when studios are selected
- Actions:
  - "Set Allocation to Student"
  - "Set Allocation to OTA"
  - "Set Allocation to Keyworkers"
  - "Set Allocation to Unallocated"
  - "Set Status to Available"
  - "Set Status to Maintenance"

#### 3. Confirmation Dialog
- Show count of selected studios
- Show action being performed
- "Cancel" and "Confirm" buttons

#### 4. Mobile Responsiveness
- Checkboxes on left, studio info on right
- Bulk actions in dropdown menu on mobile
- Sticky action bar when items selected

---

## Summary of Required Changes

### Database
1. ✅ Add allocation constraint (check constraint)
2. ✅ Add allocation index
3. ✅ Update availability views to exclude OTA/Keyworkers
4. ✅ Update auto-allocation trigger to set 'Student' on confirmation

### Frontend - Student Portal
1. ✅ Update `useStudios` to filter out OTA/Keyworkers allocated studios
2. ✅ Ensure `StudioSelection.tsx` only shows available studios

### Frontend - Admin Portal
1. ✅ Update allocation filter options
2. ✅ Add floor filter
3. ✅ Add status filter (refine if needed)
4. ✅ Add bulk select functionality
5. ✅ Add bulk allocation management

### Hooks & Logic
1. ✅ Update `useAdminStudios` to support floor filtering
2. ✅ Create bulk update mutation for studios
3. ✅ Update reservation logic to handle allocation correctly

---

## Open Questions for User Decision

1. **Allocation Value Strategy**: 
   - Do you want to keep UUID for temporary reservations, or always use "Student"?
   - **Recommendation**: Keep UUID for temporary, set "Student" on confirmation

2. **OTA/Keyworkers Booking Journeys**:
   - When will these be implemented?
   - Should we prepare the database structure now?
   - **Recommendation**: Keep allocation flexible for future expansion

3. **Floor Filter**:
   - Should floor be a free-text field or a constrained list?
   - **Current**: Free text (`floor text`)
   - **Recommendation**: Keep as free text, populate filter dynamically from existing data

4. **Bulk Actions**:
   - Which bulk actions are most important?
   - **Recommendation**: Start with allocation and status changes

---

## Next Steps

1. **Review this document** and confirm allocation value strategy
2. **Approve implementation plan** (phases 1-3)
3. **Prioritize features** (bulk select, floor filter, etc.)
4. **Begin Phase 1 implementation** (database and core logic)

---

## Risk Assessment

### Low Risk
- Adding floor filter (read-only, no data changes)
- Updating admin UI filters (cosmetic)

### Medium Risk
- Updating availability calculations (affects public-facing data)
- Changing allocation filtering (affects student selection)

### High Risk
- Changing allocation values for existing reservations (if any)
- **Mitigation**: Test thoroughly, handle UUIDs gracefully

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-22  
**Status**: Awaiting User Review & Approval

