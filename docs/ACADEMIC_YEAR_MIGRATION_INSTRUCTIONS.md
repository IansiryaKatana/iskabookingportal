# Academic Year Migration Instructions

## What This Migration Does

This migration will:
1. ✅ **Rename** existing "2026/2027" academic year → "2025/2026" (keeps same start/end dates)
2. ✅ **Create** new "2026/2027" academic year with dates **one year later** than the renamed year

## Example

**Before:**
- Academic Year: "2026/2027"
  - start_date: `2026-09-01`
  - end_date: `2027-08-31`

**After:**
- Academic Year: "2025/2026" (renamed, same dates)
  - start_date: `2026-09-01` (unchanged)
  - end_date: `2027-08-31` (unchanged)

- Academic Year: "2026/2027" (new, dates +1 year)
  - start_date: `2027-09-01` (2026-09-01 + 1 year)
  - end_date: `2028-08-31` (2027-08-31 + 1 year)

## Important Notes

### ✅ What Gets Updated Automatically

- **Academic Year Name**: Changed from "2026/2027" to "2025/2026"
- **All Related Records**: Contracts, payment plans, prices, etc. that reference this academic year will automatically use the new name (they reference by ID, not name)

### ⚠️ What You May Need to Do Manually

1. **Contracts**: If you have contracts linked to the renamed year, they will automatically update. But you may want to:
   - Review contract names/slugs to ensure they reflect the correct year
   - Update contract start/end dates if needed

2. **Payment Plans**: Will automatically stay linked (by ID), but review if needed

3. **Studio Grade Prices**: Will automatically stay linked (by ID), but review pricing if needed

## How to Run

1. **Backup your database first** (recommended)
2. Run the migration in Supabase SQL Editor:
   ```sql
   -- Copy and paste the contents of:
   -- supabase/migrations/20251118_update_academic_years_rename_and_add.sql
   ```
3. **Verify the results** - The migration includes a verification query at the end

## Verification

After running, check:
```sql
SELECT 
  id,
  name,
  start_date,
  end_date,
  is_active
FROM public.academic_years
WHERE name IN ('2025/2026', '2026/2027')
ORDER BY start_date;
```

You should see:
- "2025/2026" with the original dates
- "2026/2027" with dates one year later

## Questions?

If you need different dates for the new "2026/2027" year, let me know and I can adjust the migration before you run it.

