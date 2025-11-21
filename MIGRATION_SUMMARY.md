# Academic Year System Implementation - Migration Summary

## Database Migrations Required

You need to run **TWO** SQL migrations:

### 1. Studio Availability by Academic Year
**File:** `supabase/migrations/20251120_studio_availability_by_academic_year.sql`
- Creates view: `studio_grade_availability_by_year`
- Shows availability per studio grade per academic year
- Ensures studios booked for one year don't affect other years

### 2. Studio Status by Academic Year (NEW)
**File:** `supabase/migrations/20251120_studio_status_by_academic_year.sql`
- Creates view: `studio_status_by_academic_year`
- Computes effective status (available/reserved/occupied) per academic year
- Fixes the issue where studios show reserved/occupied status for wrong academic year

## How to Run Migrations

### Option A: Supabase Dashboard (Recommended)
1. Go to your Supabase project → **SQL Editor**
2. Click **New Query**
3. Copy and paste the entire contents of each migration file
4. Click **Run** (Ctrl+Enter)
5. Repeat for the second migration

### Option B: Supabase CLI
```bash
supabase db push
```

## What Was Fixed

### ✅ Studio Status Issue
- **Problem:** Studios showed reserved/occupied status globally, not per academic year
- **Solution:** Created `studio_status_by_academic_year` view that computes status based on applications for the selected academic year
- **Result:** Studio status now correctly shows as available/reserved/occupied per academic year

### ✅ Academic Year Selectors Added
- **Studio Grades** - Filter pricing by academic year
- **Studios** - View studio status per academic year
- **Applications** - Filter applications by academic year
- **Dashboard** - View stats per academic year

### ✅ Public Catalog
- Academic year tabs (centered)
- Dynamic hero text
- Availability filtered by academic year

## Pages Updated

1. **Admin Studio Grades** - Academic year selector added
2. **Admin Studios** - Academic year selector + status filtering
3. **Admin Applications** - Academic year selector + filtering
4. **Admin Dashboard** - Academic year selector + stats filtering
5. **Public Catalog** - Academic year tabs (centered)

## Testing Checklist

After running migrations:
- [ ] Studio Grades page shows data for selected academic year
- [ ] Studios page shows correct status per academic year (not cross-contaminated)
- [ ] Applications page filters by academic year
- [ ] Dashboard shows stats for selected academic year
- [ ] Public catalog tabs work and show correct availability
- [ ] Switching academic years updates all data correctly

## Important Notes

- **Studio status is now contextual** - A studio can be "reserved" for 2025/2026 but "available" for 2026/2027
- **Maintenance status is global** - If a studio is in maintenance, it shows as maintenance for all years
- **Default behavior** - All selectors default to most recent future academic year

