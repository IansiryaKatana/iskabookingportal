-- Fix Academic Year Dates
-- Corrects the dates so they match the academic year names:
-- "2025/2026": start_date should be in 2025, end_date should be in 2026
-- "2026/2027": start_date should be in 2026, end_date should be in 2027

BEGIN;

DO $$
DECLARE
  v_year_2025_26_id UUID;
  v_year_2026_27_id UUID;
  v_current_start DATE;
  v_current_end DATE;
  v_start_year INTEGER;
  v_end_year INTEGER;
  v_year_diff INTEGER;
BEGIN
  -- Fix 2025/2026: start should be in 2025, end should be in 2026
  SELECT id, start_date, end_date, 
         EXTRACT(YEAR FROM start_date)::INTEGER, 
         EXTRACT(YEAR FROM end_date)::INTEGER
  INTO v_year_2025_26_id, v_current_start, v_current_end, v_start_year, v_end_year
  FROM public.academic_years
  WHERE name = '2025/2026'
  LIMIT 1;

  IF v_year_2025_26_id IS NOT NULL THEN
    -- If start is not in 2025, fix it by preserving day/month, adjusting year
    IF v_start_year != 2025 OR v_end_year != 2026 THEN
      UPDATE public.academic_years
      SET 
        start_date = (v_current_start - INTERVAL '1 year')::DATE,  -- Subtract 1 year, keep day/month
        end_date = (v_current_end - INTERVAL '1 year')::DATE,      -- Subtract 1 year, keep day/month
        updated_at = NOW()
      WHERE id = v_year_2025_26_id;

      RAISE NOTICE 'Fixed 2025/2026 dates: start_date: %, end_date: %', 
        v_current_start - INTERVAL '1 year', 
        v_current_end - INTERVAL '1 year';
    ELSE
      RAISE NOTICE '2025/2026 dates are already correct';
    END IF;
  ELSE
    RAISE WARNING 'Academic year "2025/2026" not found.';
  END IF;

  -- Fix 2026/2027: start should be in 2026, end should be in 2027
  SELECT id, start_date, end_date,
         EXTRACT(YEAR FROM start_date)::INTEGER,
         EXTRACT(YEAR FROM end_date)::INTEGER
  INTO v_year_2026_27_id, v_current_start, v_current_end, v_start_year, v_end_year
  FROM public.academic_years
  WHERE name = '2026/2027'
  LIMIT 1;

  IF v_year_2026_27_id IS NOT NULL THEN
    -- If start is not in 2026, fix it by preserving day/month, adjusting year
    IF v_start_year != 2026 OR v_end_year != 2027 THEN
      -- Calculate how many years to subtract (e.g., if start is 2027, subtract 1 year)
      v_year_diff := v_start_year - 2026;
      
      UPDATE public.academic_years
      SET 
        start_date = (v_current_start - (v_year_diff || ' years')::INTERVAL)::DATE,
        end_date = (v_current_end - (v_year_diff || ' years')::INTERVAL)::DATE,
        updated_at = NOW()
      WHERE id = v_year_2026_27_id;

      RAISE NOTICE 'Fixed 2026/2027 dates: start_date: %, end_date: %', 
        v_current_start - (v_year_diff || ' years')::INTERVAL,
        v_current_end - (v_year_diff || ' years')::INTERVAL;
    ELSE
      RAISE NOTICE '2026/2027 dates are already correct';
    END IF;
  ELSE
    RAISE WARNING 'Academic year "2026/2027" not found.';
  END IF;
END $$;

COMMIT;

-- Verify the changes
SELECT 
  id,
  name,
  start_date,
  end_date,
  EXTRACT(YEAR FROM start_date) as start_year,
  EXTRACT(YEAR FROM end_date) as end_year,
  is_active
FROM public.academic_years
WHERE name IN ('2025/2026', '2026/2027')
ORDER BY start_date;

