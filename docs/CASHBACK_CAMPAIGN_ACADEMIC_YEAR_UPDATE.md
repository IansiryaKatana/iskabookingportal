# Cashback Campaign Academic Year Context Update

**Date**: January 27, 2025  
**Status**: ✅ Implemented

## Overview

Cashback campaigns now support academic year context, allowing campaigns to be associated with specific academic years or apply to all academic years.

## Changes Made

### Database Schema

**Migration**: `20250127_add_academic_year_to_cashback_campaigns.sql`

- Added `academic_year_id` column to `cashback_campaigns` table
  - Type: `UUID` (nullable)
  - Foreign key: References `academic_years(id)` with `ON DELETE SET NULL`
  - Index: Created for performance on `academic_year_id` where not null
  - Default: `NULL` (campaign applies to all academic years)

### Frontend Updates

#### 1. Cashback Campaigns Page (`src/pages/admin/CashbackCampaigns.tsx`)
- Added `AcademicYearSelector` for filtering campaigns by academic year
- Updated campaign form to include academic year selection
- Display academic year badge in campaign cards
- Filtering logic:
  - When academic year selected: Shows campaigns for that year OR campaigns with no academic year
  - When no academic year selected: Shows all campaigns

#### 2. Dashboard (`src/pages/admin/Dashboard.tsx`)
- Active cashback campaigns card now filters by selected academic year
- Uses `AcademicYearSelector` with `allowEmpty={true}` option
- Displays campaigns for selected year or all years if no selection

#### 3. Academic Year Selector (`src/components/admin/AcademicYearSelector.tsx`)
- Added `allowEmpty` prop to support "All Academic Years" option
- Auto-selects default academic year on initial load
- Ensures queries run with correct academic year from page load

#### 4. Hooks (`src/hooks/useCashback.ts`)
- Updated `CashbackCampaign` type to include `academic_year_id` and `academic_year`
- Updated `useActiveCashbackCampaigns` hook:
  - Accepts `academicYearId` parameter
  - Fetches campaigns for selected year OR campaigns with null academic_year_id
  - Enriches campaigns with academic year name data
  - Filters out campaigns that have reached max uses

### Type Updates

**File**: `src/hooks/useCashback.ts`

```typescript
export type CashbackCampaign = {
  // ... existing fields
  academic_year_id: string | null;
  academic_year?: {
    id: string;
    name: string;
  } | null;
  // ... rest of fields
};
```

## User Experience

### Creating/Editing Campaigns
1. Admin navigates to Cashback Campaigns page
2. Clicks "New Campaign" or edits existing campaign
3. Form includes "Academic Year (Optional)" field
4. Options:
   - "All Academic Years" (default) - Campaign applies to all years
   - Specific academic year - Campaign only applies to that year
5. Campaign is saved with selected academic year context

### Viewing Campaigns
1. Admin selects academic year from dropdown (optional)
2. Page displays:
   - Campaigns for selected academic year
   - Campaigns with no academic year (applies to all)
3. Campaign cards show academic year badge or "All Years"

### Dashboard Display
1. Dashboard shows active cashback campaigns card
2. Card filters by selected academic year (if any)
3. Displays up to 2 campaigns with "View all" button if more exist
4. Shows campaign name, amount, usage, and date range

## Technical Details

### Query Logic

When `academicYearId` is provided:
```typescript
// Fetch campaigns for selected year
const yearCampaigns = await supabase
  .from("cashback_campaigns")
  .select("*")
  .eq("academic_year_id", academicYearId)
  // ... other filters

// Fetch campaigns with no academic year (applies to all)
const allYearCampaigns = await supabase
  .from("cashback_campaigns")
  .select("*")
  .is("academic_year_id", null)
  // ... other filters

// Combine and deduplicate
const campaigns = [...yearCampaigns, ...allYearCampaigns];
```

When `academicYearId` is `undefined`:
- Fetches all campaigns regardless of academic year

### Initialization Fix

**Problem**: Campaigns didn't show on initial page load because academic year wasn't set before queries ran.

**Solution**: `AcademicYearSelector` now calls `onValueChange` with default year on initial load, ensuring queries run with correct academic year from the start.

## Migration Notes

- Existing campaigns will have `academic_year_id = NULL` (applies to all years)
- No data migration required - existing campaigns continue to work
- New campaigns can optionally specify academic year
- Bulk import CSV updated to support `academic_year_id` column

## Related Files

- `supabase/migrations/20250127_add_academic_year_to_cashback_campaigns.sql`
- `src/pages/admin/CashbackCampaigns.tsx`
- `src/pages/admin/Dashboard.tsx`
- `src/components/admin/AcademicYearSelector.tsx`
- `src/hooks/useCashback.ts`

## Testing Checklist

- ✅ Create campaign with specific academic year
- ✅ Create campaign with "All Academic Years"
- ✅ Filter campaigns by academic year
- ✅ Dashboard shows campaigns for selected year
- ✅ Campaigns display correctly on initial page load
- ✅ Academic year badge displays correctly
- ✅ Switching academic years updates displayed campaigns

