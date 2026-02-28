-- Bulk import studios: optional academic year for per-year maintenance
-- When p_academic_year_id is provided and status = 'maintenance', write to
-- studio_maintenance_by_academic_year only (do not set global studios.status).
-- When p_academic_year_id is provided and status != 'maintenance', clear
-- any per-year maintenance for that (studio, year) and set global status.

CREATE OR REPLACE FUNCTION public.bulk_import_studios(
  p_data JSONB,
  p_imported_by UUID,
  p_academic_year_id UUID DEFAULT NULL
)
RETURNS TABLE (
  row_number INTEGER,
  status TEXT,
  record_id UUID,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row JSONB;
  v_row_num INTEGER := 0;
  v_record_id UUID;
  v_error TEXT;
  v_studio_grade_id UUID;
  v_status TEXT;
  v_use_per_year_maintenance BOOLEAN;
BEGIN
  v_use_per_year_maintenance := (p_academic_year_id IS NOT NULL);

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      SELECT id INTO v_studio_grade_id
      FROM public.studio_grades
      WHERE slug = v_row->>'studio_grade_slug';

      IF v_studio_grade_id IS NULL THEN
        RAISE EXCEPTION 'Studio grade with slug "%" not found', v_row->>'studio_grade_slug';
      END IF;

      v_status := LOWER(COALESCE(v_row->>'status', 'available'));
      IF v_status NOT IN ('available', 'reserved', 'occupied', 'maintenance') THEN
        v_status := 'available';
      END IF;

      IF v_use_per_year_maintenance AND v_status = 'maintenance' THEN
        -- Per-year maintenance: upsert studio with global status 'available', then add override
        INSERT INTO public.studios (
          studio_number,
          studio_grade_id,
          floor,
          status,
          allocation,
          is_active
        )
        VALUES (
          v_row->>'studio_number',
          v_studio_grade_id,
          v_row->>'floor',
          'available'::public.studio_status,
          NULLIF(v_row->>'allocation', ''),
          COALESCE((v_row->>'is_active')::BOOLEAN, true)
        )
        ON CONFLICT (studio_number) DO UPDATE
        SET
          studio_grade_id = EXCLUDED.studio_grade_id,
          floor = EXCLUDED.floor,
          status = 'available'::public.studio_status,
          allocation = EXCLUDED.allocation,
          is_active = EXCLUDED.is_active,
          updated_at = NOW()
        RETURNING id INTO v_record_id;

        INSERT INTO public.studio_maintenance_by_academic_year (studio_id, academic_year_id)
        VALUES (v_record_id, p_academic_year_id)
        ON CONFLICT (studio_id, academic_year_id) DO NOTHING;
      ELSIF v_use_per_year_maintenance AND v_status != 'maintenance' THEN
        -- Clear per-year maintenance for this studio/year and set global status
        INSERT INTO public.studios (
          studio_number,
          studio_grade_id,
          floor,
          status,
          allocation,
          is_active
        )
        VALUES (
          v_row->>'studio_number',
          v_studio_grade_id,
          v_row->>'floor',
          v_status::public.studio_status,
          NULLIF(v_row->>'allocation', ''),
          COALESCE((v_row->>'is_active')::BOOLEAN, true)
        )
        ON CONFLICT (studio_number) DO UPDATE
        SET
          studio_grade_id = EXCLUDED.studio_grade_id,
          floor = EXCLUDED.floor,
          status = EXCLUDED.status,
          allocation = EXCLUDED.allocation,
          is_active = EXCLUDED.is_active,
          updated_at = NOW()
        RETURNING id INTO v_record_id;

        DELETE FROM public.studio_maintenance_by_academic_year
        WHERE studio_id = v_record_id AND academic_year_id = p_academic_year_id;
      ELSE
        -- No academic year: legacy behavior (global status only)
        INSERT INTO public.studios (
          studio_number,
          studio_grade_id,
          floor,
          status,
          allocation,
          is_active
        )
        VALUES (
          v_row->>'studio_number',
          v_studio_grade_id,
          v_row->>'floor',
          v_status::public.studio_status,
          NULLIF(v_row->>'allocation', ''),
          COALESCE((v_row->>'is_active')::BOOLEAN, true)
        )
        ON CONFLICT (studio_number) DO UPDATE
        SET
          studio_grade_id = EXCLUDED.studio_grade_id,
          floor = EXCLUDED.floor,
          status = EXCLUDED.status,
          allocation = EXCLUDED.allocation,
          is_active = EXCLUDED.is_active,
          updated_at = NOW()
        RETURNING id INTO v_record_id;
      END IF;

      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.bulk_import_studios(JSONB, UUID, UUID) IS
'Bulk import studios. When p_academic_year_id is provided, maintenance status is stored per year (studio_maintenance_by_academic_year) so it does not affect other years.';
