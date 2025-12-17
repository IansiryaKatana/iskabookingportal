# Delete Application by Search - Implementation Recommendations

## Executive Summary

This document provides recommendations for implementing the ability to search for and delete specific applications by student name or studio number, similar to the existing "Delete All Applications" feature.

---

## Current Implementation Analysis

### 1. Delete All Applications Feature

**Database Function:** `delete_all_student_applications(p_delete_orphaned_users BOOLEAN)`
- **Location:** `supabase/migrations/20250128_smart_deletion_feature.sql`
- **How it works:**
  1. Loops through all applications
  2. Calls `delete_student_application(p_application_id)` for each
  3. Handles cleanup of studio allocations
  4. Optionally performs smart deletion of orphaned users

**UI Implementation:** `src/pages/admin/Settings.tsx`
- Button triggers AlertDialog with confirmation
- Shows count of applications to be deleted
- Optional checkbox for "Smart Deletion" (delete orphaned users)
- Uses React Query mutation for async operation

### 2. Single Application Deletion

**Database Function:** `delete_student_application(p_application_id UUID)`
- **Location:** `supabase/migrations/20251122_data_management_functions.sql`
- **What it deletes:**
  - Application steps (`student_application_steps`)
  - Documents (`student_documents`)
  - Signatures (`student_signatures`)
  - DocuSign envelopes (`docusign_envelopes`)
  - Stripe payments (`stripe_payments`)
  - Manual payments (`manual_payments`)
  - Partner referrals (`partner_referrals`)
  - Application cashbacks (`application_cashbacks`)
  - Updates refunds (sets `application_id` to NULL)
  - Updates rebooking references
  - Frees up studio allocations
  - Finally deletes the application itself

---

## Implementation Recommendations

### Option 1: Search-First Approach (Recommended)

**Concept:** User searches for applications, sees results, selects which to delete.

**Pros:**
- ✅ Safe - user sees what will be deleted
- ✅ Flexible - can delete multiple matching applications
- ✅ Clear feedback - shows search results before deletion
- ✅ Prevents accidental deletions

**Cons:**
- ⚠️ Two-step process (search, then delete)
- ⚠️ More UI complexity

**Implementation:**

1. **Database Function:** `search_applications_by_criteria(p_search_term TEXT, p_search_type TEXT)`
   - `p_search_type`: 'student_name' or 'studio_number'
   - Returns: Array of matching applications with details

2. **Database Function:** `delete_applications_by_ids(p_application_ids UUID[], p_delete_orphaned_users BOOLEAN)`
   - Takes array of application IDs
   - Loops through and calls `delete_student_application()` for each
   - Handles cleanup and smart deletion

3. **UI Component:**
   - Search input field
   - Radio buttons or dropdown for search type (Name/Studio)
   - Search button
   - Results table showing matching applications
   - Select all/individual checkboxes
   - Delete button (disabled if none selected)
   - Confirmation dialog

### Option 2: Direct Delete with Confirmation

**Concept:** User enters search term, system finds matches, shows confirmation with count, then deletes all matches.

**Pros:**
- ✅ Simpler UI - single search input
- ✅ Faster workflow
- ✅ Similar to "Delete All" pattern

**Cons:**
- ⚠️ Less control - deletes ALL matches
- ⚠️ Risk of accidental bulk deletion
- ⚠️ No preview of what will be deleted

**Implementation:**

1. **Database Function:** `delete_applications_by_criteria(p_search_term TEXT, p_search_type TEXT, p_delete_orphaned_users BOOLEAN)`
   - Finds matching applications
   - Deletes all matches
   - Returns count and details

2. **UI Component:**
   - Search input field
   - Search type selector (Name/Studio)
   - Search button
   - Confirmation dialog showing count of matches
   - Delete button

### Option 3: Hybrid Approach (Best UX)

**Concept:** Search shows results with preview, user can select specific ones or delete all matches.

**Pros:**
- ✅ Best of both worlds
- ✅ Maximum flexibility
- ✅ Safe with preview
- ✅ Can delete all or selected

**Cons:**
- ⚠️ Most complex implementation

**Implementation:**
- Combines Option 1 search with Option 2 bulk delete option
- Results table with "Select All" + individual checkboxes
- Two delete buttons: "Delete Selected" and "Delete All Matches"

---

## Search Criteria Details

### 1. Search by Student Name

**Data Sources:**
- Primary: `profiles` table (`first_name`, `last_name`)
- Fallback: `student_application_steps` Step 1 payload (`first_name`, `last_name`)

**Search Logic:**
```sql
-- Search in profiles
WHERE LOWER(p.first_name || ' ' || p.last_name) LIKE LOWER('%' || p_search_term || '%')

-- OR search in Step 1 payload
WHERE EXISTS (
  SELECT 1 FROM student_application_steps sas
  WHERE sas.application_id = sa.id
    AND sas.step_number = 1
    AND LOWER(sas.payload->>'first_name' || ' ' || sas.payload->>'last_name') 
        LIKE LOWER('%' || p_search_term || '%')
)
```

**Considerations:**
- Partial name matching (e.g., "John" matches "John Doe")
- Case-insensitive
- Handles missing profile data (uses Step 1 fallback)

### 2. Search by Studio Number

**Data Source:**
- `studios` table (`studio_number`)
- Linked via `student_applications.assigned_studio_id`

**Search Logic:**
```sql
WHERE EXISTS (
  SELECT 1 FROM studios s
  WHERE s.id = sa.assigned_studio_id
    AND LOWER(s.studio_number) LIKE LOWER('%' || p_search_term || '%')
)
```

**Considerations:**
- Partial matching (e.g., "101" matches "101A", "101B")
- Case-insensitive
- Only finds applications with assigned studios

---

## Recommended Database Functions

### Function 1: Search Applications

```sql
CREATE OR REPLACE FUNCTION public.search_applications_by_criteria(
  p_search_term TEXT,
  p_search_type TEXT -- 'student_name' or 'studio_number'
)
RETURNS TABLE(
  application_id UUID,
  student_name TEXT,
  student_email TEXT,
  studio_number TEXT,
  studio_grade_name TEXT,
  contract_name TEXT,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('row_security', 'off', true);
  
  IF p_search_type = 'student_name' THEN
    RETURN QUERY
    SELECT DISTINCT
      sa.id AS application_id,
      COALESCE(
        p.first_name || ' ' || p.last_name,
        sas1.payload->>'first_name' || ' ' || sas1.payload->>'last_name',
        'Unknown'
      ) AS student_name,
      COALESCE(auth_user.email, '') AS student_email,
      s.studio_number,
      sg.name AS studio_grade_name,
      c.name AS contract_name,
      sa.status::TEXT,
      sa.created_at
    FROM public.student_applications sa
    LEFT JOIN public.profiles p ON sa.student_id = p.id
    LEFT JOIN auth.users auth_user ON sa.student_id = auth_user.id
    LEFT JOIN public.studios s ON sa.assigned_studio_id = s.id
    LEFT JOIN public.studio_grades sg ON sa.studio_grade_id = sg.id
    LEFT JOIN public.contracts c ON sa.contract_id = c.id
    LEFT JOIN public.student_application_steps sas1 
      ON sa.id = sas1.application_id AND sas1.step_number = 1
    WHERE 
      LOWER(COALESCE(p.first_name || ' ' || p.last_name, '')) LIKE LOWER('%' || p_search_term || '%')
      OR LOWER(COALESCE(sas1.payload->>'first_name' || ' ' || sas1.payload->>'last_name', '')) 
         LIKE LOWER('%' || p_search_term || '%')
    ORDER BY sa.created_at DESC;
    
  ELSIF p_search_type = 'studio_number' THEN
    RETURN QUERY
    SELECT DISTINCT
      sa.id AS application_id,
      COALESCE(
        p.first_name || ' ' || p.last_name,
        sas1.payload->>'first_name' || ' ' || sas1.payload->>'last_name',
        'Unknown'
      ) AS student_name,
      COALESCE(auth_user.email, '') AS student_email,
      s.studio_number,
      sg.name AS studio_grade_name,
      c.name AS contract_name,
      sa.status::TEXT,
      sa.created_at
    FROM public.student_applications sa
    INNER JOIN public.studios s ON sa.assigned_studio_id = s.id
    LEFT JOIN public.profiles p ON sa.student_id = p.id
    LEFT JOIN auth.users auth_user ON sa.student_id = auth_user.id
    LEFT JOIN public.studio_grades sg ON sa.studio_grade_id = sg.id
    LEFT JOIN public.contracts c ON sa.contract_id = c.id
    LEFT JOIN public.student_application_steps sas1 
      ON sa.id = sas1.application_id AND sas1.step_number = 1
    WHERE LOWER(s.studio_number) LIKE LOWER('%' || p_search_term || '%')
    ORDER BY sa.created_at DESC;
  ELSE
    RAISE EXCEPTION 'Invalid search_type. Must be "student_name" or "studio_number"';
  END IF;
END;
$$;
```

### Function 2: Delete Applications by IDs

```sql
CREATE OR REPLACE FUNCTION public.delete_applications_by_ids(
  p_application_ids UUID[],
  p_delete_orphaned_users BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application_id UUID;
  v_student_id UUID;
  v_total_deleted INTEGER := 0;
  v_users_deleted INTEGER := 0;
  v_users_preserved INTEGER := 0;
  v_details JSONB := '[]'::JSONB;
  v_user_details JSONB := '[]'::JSONB;
  v_deleted_tables JSONB;
  v_total_records INTEGER;
  v_student_ids_from_apps UUID[] := '{}';
  v_deleted_user_ids UUID[] := '{}';
  v_preserved_user_ids UUID[] := '{}';
  -- Smart deletion variables (same as delete_all_student_applications)
  v_user_role TEXT;
  v_has_remaining_apps BOOLEAN;
  v_has_refunds BOOLEAN;
  v_has_maintenance BOOLEAN;
  v_has_utility_payments BOOLEAN;
  v_has_activity_logs BOOLEAN;
  v_should_preserve BOOLEAN;
  v_preservation_reason TEXT;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  
  IF array_length(p_application_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'deleted_count', 0,
      'users_deleted', 0,
      'users_preserved', 0,
      'details', '[]'::JSONB,
      'user_details', '[]'::JSONB,
      'message', 'No application IDs provided'
    );
  END IF;
  
  -- Step 1: Delete all applications and collect student_ids
  FOREACH v_application_id IN ARRAY p_application_ids
  LOOP
    BEGIN
      -- Get student_id before deletion
      SELECT student_id INTO v_student_id
      FROM public.student_applications
      WHERE id = v_application_id;
      
      -- Add to collection if not already present
      IF v_student_id IS NOT NULL AND NOT (v_student_id = ANY(v_student_ids_from_apps)) THEN
        v_student_ids_from_apps := v_student_ids_from_apps || v_student_id;
      END IF;
      
      -- Call the delete function
      SELECT deleted_tables, total_deleted INTO STRICT v_deleted_tables, v_total_records
      FROM public.delete_student_application(v_application_id);
      
      v_total_deleted := v_total_deleted + 1;
      v_details := v_details || jsonb_build_object(
        'application_id', v_application_id,
        'student_id', v_student_id,
        'deleted_tables', v_deleted_tables,
        'total_deleted', v_total_records,
        'success', true
      );
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', 'Application not found or already deleted',
          'error_code', 'P0002',
          'success', false
        );
      WHEN OTHERS THEN
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', SQLERRM,
          'error_code', SQLSTATE,
          'success', false
        );
    END;
  END LOOP;
  
  -- Step 2: Smart User Deletion (if enabled) - Same logic as delete_all_student_applications
  IF p_delete_orphaned_users THEN
    FOREACH v_student_id IN ARRAY v_student_ids_from_apps
    LOOP
      -- Skip if already processed
      IF v_student_id = ANY(v_deleted_user_ids) OR v_student_id = ANY(v_preserved_user_ids) THEN
        CONTINUE;
      END IF;
      
      -- Initialize preservation check
      v_should_preserve := false;
      v_preservation_reason := '';
      
      -- Check all preservation rules (same as delete_all_student_applications)
      -- ... (full logic from smart deletion feature)
      
      -- Decision: Delete or Preserve
      IF v_should_preserve THEN
        v_users_preserved := v_users_preserved + 1;
        v_preserved_user_ids := v_preserved_user_ids || v_student_id;
        -- Add to user_details...
      ELSE
        BEGIN
          DELETE FROM auth.users WHERE id = v_student_id;
          v_users_deleted := v_users_deleted + 1;
          v_deleted_user_ids := v_deleted_user_ids || v_student_id;
          -- Add to user_details...
        EXCEPTION
          WHEN OTHERS THEN
            v_users_preserved := v_users_preserved + 1;
            -- Add to user_details...
        END;
      END IF;
    END LOOP;
  END IF;
  
  -- Cleanup orphaned studio allocations (same as delete_all_student_applications)
  UPDATE public.studios
  SET 
    allocation = NULL,
    reservation_expires_at = NULL,
    status = CASE 
      WHEN status = 'reserved' THEN 'available'
      ELSE status
    END
  WHERE 
    allocation IS NOT NULL
    AND allocation ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND allocation::UUID NOT IN (
      SELECT id FROM public.student_applications
    );
  
  -- Return comprehensive result
  RETURN jsonb_build_object(
    'deleted_count', v_total_deleted,
    'users_deleted', v_users_deleted,
    'users_preserved', v_users_preserved,
    'details', v_details,
    'user_details', v_user_details,
    'cleanup_performed', true,
    'message', format(
      'Deleted %s application(s). Users: %s deleted, %s preserved.',
      v_total_deleted,
      v_users_deleted,
      v_users_preserved
    )
  );
END;
$$;
```

---

## UI Implementation Recommendations

### Location
Add to `src/pages/admin/Settings.tsx` in the "Delete Actions" section (around line 1064)

### Component Structure

```tsx
// State
const [searchTerm, setSearchTerm] = useState("");
const [searchType, setSearchType] = useState<"student_name" | "studio_number">("student_name");
const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
const [selectedApplications, setSelectedApplications] = useState<Set<string>>(new Set());
const [isSearching, setIsSearching] = useState(false);
const [deleteBySearchOpen, setDeleteBySearchOpen] = useState(false);

// Search mutation
const searchApplications = useMutation({
  mutationFn: async () => {
    const { data, error } = await supabase.rpc("search_applications_by_criteria", {
      p_search_term: searchTerm,
      p_search_type: searchType,
    });
    if (error) throw error;
    return data;
  },
  onSuccess: (data) => {
    setSearchResults(data || []);
  },
});

// Delete mutation
const deleteBySearch = useMutation({
  mutationFn: async () => {
    const applicationIds = Array.from(selectedApplications);
    const { data, error } = await supabase.rpc("delete_applications_by_ids", {
      p_application_ids: applicationIds,
      p_delete_orphaned_users: deleteOrphanedUsers,
    });
    if (error) throw error;
    return data;
  },
  onSuccess: (data) => {
    // Show success toast
    // Invalidate queries
    // Reset state
  },
});
```

### UI Layout

```
┌─────────────────────────────────────────┐
│ Delete by Search                        │
├─────────────────────────────────────────┤
│ [Search Input] [Student Name ▼] [Search]│
├─────────────────────────────────────────┤
│ Results (if any):                       │
│ ┌─────────────────────────────────────┐ │
│ │ ☑ Select All                        │ │
│ ├─────────────────────────────────────┤ │
│ │ ☑ John Doe | Studio 101 | ...      │ │
│ │ ☐ Jane Smith | Studio 102 | ...    │ │
│ └─────────────────────────────────────┘ │
│ [Delete Selected] [Delete All Matches] │
└─────────────────────────────────────────┘
```

---

## Security Considerations

1. **RLS Bypass:** Functions use `SECURITY DEFINER` and disable RLS - ensure only admin users can access
2. **Input Validation:** Sanitize search terms to prevent SQL injection (PostgreSQL handles this, but validate in UI)
3. **Audit Logging:** Log all deletion operations (already implemented via `logActivity`)
4. **Confirmation Dialogs:** Always require confirmation before deletion
5. **Permissions:** Ensure only staff/superadmin can access Settings page

---

## Testing Recommendations

1. **Search Tests:**
   - Search by exact student name
   - Search by partial student name
   - Search by exact studio number
   - Search by partial studio number
   - Search with no results
   - Search with special characters

2. **Deletion Tests:**
   - Delete single application
   - Delete multiple selected applications
   - Delete all matches
   - Delete with smart deletion enabled
   - Delete with smart deletion disabled
   - Verify studio cleanup
   - Verify related records deletion

3. **Edge Cases:**
   - Applications without assigned studios
   - Applications without profile data (Step 1 fallback)
   - Applications with multiple related records
   - Orphaned user accounts

---

## Recommendation Summary

**Recommended Approach:** Option 3 (Hybrid Approach)

**Rationale:**
- Provides maximum flexibility
- Safe with preview before deletion
- Consistent with existing "Delete All" pattern
- Allows both selective and bulk deletion
- Best user experience

**Implementation Priority:**
1. ✅ Create database functions (search + delete)
2. ✅ Add UI component to Settings page
3. ✅ Add audit logging
4. ✅ Test thoroughly
5. ✅ Document feature

---

## Next Steps

1. Review this document and decide on approach
2. Approve database function design
3. Approve UI/UX design
4. Implement database functions
5. Implement UI component
6. Test and refine
7. Deploy

