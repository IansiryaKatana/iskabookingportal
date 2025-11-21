# Academic Year Catalog Recommendations

## Current Problem

1. **Studio availability is aggregated across ALL academic years** - The `studio_grade_availability_summary` view doesn't filter by academic year, so a studio booked for 2025/2026 appears unavailable for 2026/2027.

2. **Catalog page shows one academic year** - Currently hardcoded to show "Book 25/26 Academic Year" and doesn't allow viewing other years.

3. **Availability calculation is contract-based** - Contracts are tied to academic years, but the summary view aggregates across all contracts.

## Recommended Solution: Dynamic Single Catalog with Academic Year Filter

### Architecture

**Option A: Single Dynamic Catalog (RECOMMENDED)**
- One catalog page (`/studios`) with academic year selector
- Default to active academic year
- Filter contracts, prices, and availability by selected year
- URL parameter: `/studios?year=2025-2026` (optional, defaults to active)
- Benefits:
  - Single page to maintain
  - Clear UX - users can switch years easily
  - SEO-friendly URLs
  - Simpler routing

**Option B: Separate Pages Per Year**
- Auto-generate routes: `/studios/2025-2026`, `/studios/2026-2027`
- Each page shows only that year's data
- Benefits:
  - Clear separation
  - Better for SEO (separate pages)
- Drawbacks:
  - More complex routing
  - More maintenance
  - Harder to switch between years

## Implementation Plan (Option A)

### 1. Database Changes

**Update `studio_grade_availability_summary` view to accept academic year filter:**

```sql
-- Create a parameterized function or filter by academic year in the view
-- The view should show availability per studio grade per academic year
```

**Alternative: Create new view `studio_grade_availability_by_year`:**

```sql
CREATE VIEW public.studio_grade_availability_by_year AS
SELECT 
  sg.id AS studio_grade_id,
  sg.name AS studio_grade_name,
  sg.slug AS studio_grade_slug,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  COUNT(DISTINCT s.id)::INTEGER AS total_capacity,
  -- Filter applications by contract's academic year
  COUNT(DISTINCT CASE 
    WHEN s.status = 'available' 
      AND (s.reservation_expires_at IS NULL OR s.reservation_expires_at < NOW())
      AND NOT EXISTS (
        SELECT 1 
        FROM public.student_applications sa
        INNER JOIN public.contracts c ON sa.contract_id = c.id
        WHERE sa.assigned_studio_id = s.id
          AND c.academic_year_id = ay.id
          AND sa.status IN ('draft', 'awaiting_deposit', 'awaiting_signature', 'awaiting_verification', 'confirmed')
          AND (sa.reserved_studio_expires_at IS NULL OR sa.reserved_studio_expires_at > NOW())
      )
    THEN s.id 
  END)::INTEGER AS available_count,
  -- ... rest of availability counts filtered by academic year
FROM public.studio_grades sg
CROSS JOIN public.academic_years ay
LEFT JOIN public.studios s ON sg.id = s.studio_grade_id AND s.is_active = true
WHERE sg.is_active = true
  AND ay.is_active = true
GROUP BY sg.id, sg.name, sg.slug, ay.id, ay.name;
```

### 2. Frontend Changes

**StudiosCatalog.tsx:**
1. Add academic year selector (dropdown or tabs)
2. Fetch active academic years
3. Filter contracts and prices by selected year
4. Use `studio_grade_availability_by_year` view with year filter
5. Update URL with year parameter
6. Update hero text dynamically

**Hook Changes:**
- Update `useAllStudioAvailability` to accept `academicYearId` parameter
- Filter availability data by academic year

### 3. User Experience

**Academic Year Selector:**
- Prominent tabs or dropdown at top of catalog
- Show: "2025/2026", "2026/2027", etc.
- Highlight active year
- Update all content when year changes

**Hero Section:**
- Dynamic text: "Book 2025/26 Academic Year" (based on selected year)
- Update CTA if needed

**Availability Display:**
- Show availability specific to selected academic year
- Clear messaging: "X studios available for 2025/2026"

## Questions to Answer

1. **Default behavior**: Should catalog default to active academic year, or most recent future year?
2. **Year selector style**: Tabs (more prominent) or dropdown (subtle)?
3. **Availability display**: Show per-contract availability or aggregate per grade per year?
4. **URL structure**: Use query param (`/studios?year=2025-2026`) or path param (`/studios/2025-2026`)?

## Recommendation Summary

**Implement Option A** with:
- Single dynamic catalog page
- Academic year tabs at top
- Filter availability by academic year
- URL query parameter for shareability
- Default to active academic year

This provides the best balance of UX, maintainability, and functionality.

