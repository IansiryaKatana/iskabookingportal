-- Update Academic Years: Rename 2026/2027 to 2025/2026 and Add New 2026/2027
-- This migration:
-- 1. Renames existing "2026/2027" academic year to "2025/2026" (keeps same dates)
-- 2. Creates a new "2026/2027" academic year with dates one year later than the renamed year

BEGIN;

-- Step 1: Get the current academic year details
DO $$
DECLARE
  v_current_year_id UUID;
  v_current_start_date DATE;
  v_current_end_date DATE;
  v_new_start_date DATE;
  v_new_end_date DATE;
  v_renamed_year_id UUID;
BEGIN
  -- Find the existing "2026/2027" academic year
  SELECT id, start_date, end_date
  INTO v_current_year_id, v_current_start_date, v_current_end_date
  FROM public.academic_years
  WHERE name = '2026/2027'
  LIMIT 1;

  -- If the year exists, proceed with updates
  IF v_current_year_id IS NOT NULL THEN
    -- Step 2: Rename existing "2026/2027" to "2025/2026" and adjust dates to be in 2025-2026
    -- For "2025/2026", start_date should be in 2025, end_date should be in 2026
    -- So we subtract 1 year from the current dates
    UPDATE public.academic_years
    SET 
      name = '2025/2026',
      start_date = v_current_start_date - INTERVAL '1 year',
      end_date = v_current_end_date - INTERVAL '1 year',
      updated_at = NOW()
    WHERE id = v_current_year_id
    RETURNING id INTO v_renamed_year_id;

    RAISE NOTICE 'Renamed academic year from "2026/2027" to "2025/2026" (ID: %, start_date: %, end_date: %)', 
      v_renamed_year_id, v_current_start_date - INTERVAL '1 year', v_current_end_date - INTERVAL '1 year';

    -- Step 3: Calculate new dates for the new 2026/2027 year (use original dates)
    -- For "2026/2027", start_date should be in 2026, end_date should be in 2027
    v_new_start_date := v_current_start_date;
    v_new_end_date := v_current_end_date;

    -- Step 4: Create new "2026/2027" academic year with dates one year later
    INSERT INTO public.academic_years (name, start_date, end_date, is_active, created_at, updated_at)
    VALUES (
      '2026/2027',
      v_new_start_date,
      v_new_end_date,
      true, -- Set as active
      NOW(),
      NOW()
    )
    ON CONFLICT (name) DO UPDATE
    SET 
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      is_active = EXCLUDED.is_active,
      updated_at = NOW();

    RAISE NOTICE 'Created/Updated academic year "2026/2027" with start_date: %, end_date: %', v_new_start_date, v_new_end_date;

  ELSE
    RAISE WARNING 'Academic year "2026/2027" not found. Please ensure the academic year exists before running this migration.';
  END IF;
END $$;

COMMIT;

-- Verify the changes
SELECT 
  id,
  name,
  start_date,
  end_date,
  is_active,
  created_at
FROM public.academic_years
WHERE name IN ('2025/2026', '2026/2027')
ORDER BY start_date;

