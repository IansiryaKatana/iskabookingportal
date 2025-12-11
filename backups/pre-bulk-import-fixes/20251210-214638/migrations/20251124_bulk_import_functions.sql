-- Bulk Import Functions for Data Migration
-- Enables bulk import of all entities for client onboarding

-- ============================================================================
-- IMPORT HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.import_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  import_type TEXT NOT NULL,
  file_name TEXT,
  total_rows INTEGER,
  succeeded INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'processing', -- 'processing', 'completed', 'failed'
  report JSONB DEFAULT '{}'::JSONB,
  errors JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_history_imported_by ON public.import_history(imported_by);
CREATE INDEX IF NOT EXISTS idx_import_history_type ON public.import_history(import_type);
CREATE INDEX IF NOT EXISTS idx_import_history_status ON public.import_history(status);
CREATE INDEX IF NOT EXISTS idx_import_history_created_at ON public.import_history(created_at DESC);

ALTER TABLE public.import_history ENABLE ROW LEVEL SECURITY;

-- Staff can view all import history
CREATE POLICY "Staff can view import history" ON public.import_history
  FOR SELECT USING (public.is_staff());

-- Staff can create import history records
CREATE POLICY "Staff can create import history" ON public.import_history
  FOR INSERT WITH CHECK (public.is_staff());

-- Staff can update import history
CREATE POLICY "Staff can update import history" ON public.import_history
  FOR UPDATE USING (public.is_staff())
  WITH CHECK (public.is_staff());

GRANT SELECT, INSERT, UPDATE ON public.import_history TO authenticated;

COMMENT ON TABLE public.import_history IS 'Tracks all bulk import operations with detailed reports and errors';

-- ============================================================================
-- FUNCTION: BULK IMPORT ACADEMIC YEARS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_import_academic_years(
  p_data JSONB,
  p_imported_by UUID
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
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      INSERT INTO public.academic_years (
        name,
        start_date,
        end_date,
        is_active
      )
      VALUES (
        v_row->>'name',
        (v_row->>'start_date')::DATE,
        (v_row->>'end_date')::DATE,
        COALESCE((v_row->>'is_active')::BOOLEAN, false)
      )
      ON CONFLICT (name) DO UPDATE
      SET
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id INTO v_record_id;
      
      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;

-- ============================================================================
-- FUNCTION: BULK IMPORT STUDIO GRADES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_import_studio_grades(
  p_data JSONB,
  p_imported_by UUID
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
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      INSERT INTO public.studio_grades (
        slug,
        name,
        short_description,
        long_description,
        max_occupancy,
        display_order,
        is_active
      )
      VALUES (
        v_row->>'slug',
        v_row->>'name',
        v_row->>'short_description',
        v_row->>'long_description',
        COALESCE((v_row->>'max_occupancy')::INTEGER, 1),
        COALESCE((v_row->>'display_order')::INTEGER, 0),
        COALESCE((v_row->>'is_active')::BOOLEAN, true)
      )
      ON CONFLICT (slug) DO UPDATE
      SET
        name = EXCLUDED.name,
        short_description = EXCLUDED.short_description,
        long_description = EXCLUDED.long_description,
        max_occupancy = EXCLUDED.max_occupancy,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id INTO v_record_id;
      
      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;

-- ============================================================================
-- FUNCTION: BULK IMPORT STUDIOS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_import_studios(
  p_data JSONB,
  p_imported_by UUID
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
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      -- Look up studio grade by slug
      SELECT id INTO v_studio_grade_id
      FROM public.studio_grades
      WHERE slug = v_row->>'studio_grade_slug';
      
      IF v_studio_grade_id IS NULL THEN
        RAISE EXCEPTION 'Studio grade with slug "%" not found', v_row->>'studio_grade_slug';
      END IF;
      
      -- Normalize status
      v_status := LOWER(COALESCE(v_row->>'status', 'available'));
      IF v_status NOT IN ('available', 'reserved', 'occupied', 'maintenance') THEN
        v_status := 'available';
      END IF;
      
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
      
      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;

-- ============================================================================
-- FUNCTION: BULK IMPORT STUDIO GRADE PRICES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_import_studio_grade_prices(
  p_data JSONB,
  p_imported_by UUID
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
  v_academic_year_id UUID;
  v_studio_grade_id UUID;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      -- Look up academic year by name
      SELECT id INTO v_academic_year_id
      FROM public.academic_years
      WHERE name = v_row->>'academic_year_name';
      
      IF v_academic_year_id IS NULL THEN
        RAISE EXCEPTION 'Academic year "%" not found', v_row->>'academic_year_name';
      END IF;
      
      -- Look up studio grade by slug
      SELECT id INTO v_studio_grade_id
      FROM public.studio_grades
      WHERE slug = v_row->>'studio_grade_slug';
      
      IF v_studio_grade_id IS NULL THEN
        RAISE EXCEPTION 'Studio grade with slug "%" not found', v_row->>'studio_grade_slug';
      END IF;
      
      INSERT INTO public.studio_grade_prices (
        academic_year_id,
        studio_grade_id,
        weekly_price,
        deposit_amount_override,
        currency_code,
        is_active
      )
      VALUES (
        v_academic_year_id,
        v_studio_grade_id,
        (v_row->>'weekly_price')::NUMERIC(10,2),
        NULLIF(v_row->>'deposit_amount_override', '')::NUMERIC(10,2),
        COALESCE(v_row->>'currency_code', 'GBP'),
        COALESCE((v_row->>'is_active')::BOOLEAN, true)
      )
      ON CONFLICT (academic_year_id, studio_grade_id) DO UPDATE
      SET
        weekly_price = EXCLUDED.weekly_price,
        deposit_amount_override = EXCLUDED.deposit_amount_override,
        currency_code = EXCLUDED.currency_code,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id INTO v_record_id;
      
      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;

-- ============================================================================
-- FUNCTION: BULK IMPORT PAYMENT PLANS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_import_payment_plans(
  p_data JSONB,
  p_imported_by UUID
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
  v_academic_year_id UUID;
  v_existing_id UUID;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      -- Look up academic year by name
      SELECT id INTO v_academic_year_id
      FROM public.academic_years
      WHERE name = v_row->>'academic_year_name';
      
      IF v_academic_year_id IS NULL THEN
        RAISE EXCEPTION 'Academic year "%" not found', v_row->>'academic_year_name';
      END IF;
      
      -- Check if payment plan already exists for this academic year
      SELECT id INTO v_existing_id
      FROM public.payment_plans
      WHERE academic_year_id = v_academic_year_id
        AND name = v_row->>'name';
      
      IF v_existing_id IS NOT NULL THEN
        -- Update existing
        UPDATE public.payment_plans
        SET
          description = v_row->>'description',
          deposit_amount = NULLIF(v_row->>'deposit_amount', '')::NUMERIC(10,2),
          is_active = COALESCE((v_row->>'is_active')::BOOLEAN, true),
          updated_at = NOW()
        WHERE id = v_existing_id;
        v_record_id := v_existing_id;
      ELSE
        -- Insert new
        INSERT INTO public.payment_plans (
          academic_year_id,
          name,
          description,
          deposit_amount,
          is_active
        )
        VALUES (
          v_academic_year_id,
          v_row->>'name',
          v_row->>'description',
          NULLIF(v_row->>'deposit_amount', '')::NUMERIC(10,2),
          COALESCE((v_row->>'is_active')::BOOLEAN, true)
        )
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

-- ============================================================================
-- FUNCTION: BULK IMPORT PAYMENT PLAN INSTALLMENTS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_import_payment_plan_installments(
  p_data JSONB,
  p_imported_by UUID
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
  v_payment_plan_id UUID;
  v_academic_year_id UUID;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      -- Look up payment plan by name and academic year
      SELECT pp.id, pp.academic_year_id INTO v_payment_plan_id, v_academic_year_id
      FROM public.payment_plans pp
      INNER JOIN public.academic_years ay ON pp.academic_year_id = ay.id
      WHERE pp.name = v_row->>'payment_plan_name'
        AND ay.name = v_row->>'academic_year_name';
      
      IF v_payment_plan_id IS NULL THEN
        RAISE EXCEPTION 'Payment plan "%" not found for academic year "%"', 
          v_row->>'payment_plan_name', v_row->>'academic_year_name';
      END IF;
      
      INSERT INTO public.payment_plan_installments (
        payment_plan_id,
        sequence,
        label,
        due_date_offset_days,
        due_date,
        amount_type,
        amount_value
      )
      VALUES (
        v_payment_plan_id,
        (v_row->>'sequence')::SMALLINT,
        v_row->>'label',
        NULLIF(v_row->>'due_date_offset_days', '')::INTEGER,
        NULLIF(v_row->>'due_date', '')::DATE,
        COALESCE(v_row->>'amount_type', 'percentage')::public.payment_amount_type,
        (v_row->>'amount_value')::NUMERIC(10,2)
      )
      ON CONFLICT (payment_plan_id, sequence) DO UPDATE
      SET
        label = EXCLUDED.label,
        due_date_offset_days = EXCLUDED.due_date_offset_days,
        due_date = EXCLUDED.due_date,
        amount_type = EXCLUDED.amount_type,
        amount_value = EXCLUDED.amount_value,
        updated_at = NOW()
      RETURNING id INTO v_record_id;
      
      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;

-- ============================================================================
-- FUNCTION: BULK IMPORT CONTRACTS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_import_contracts(
  p_data JSONB,
  p_imported_by UUID
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
  v_academic_year_id UUID;
  v_studio_grade_id UUID;
  v_payment_plan_id UUID;
  v_weeks INTEGER;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      -- Look up academic year
      SELECT id INTO v_academic_year_id
      FROM public.academic_years
      WHERE name = v_row->>'academic_year_name';
      
      IF v_academic_year_id IS NULL THEN
        RAISE EXCEPTION 'Academic year "%" not found', v_row->>'academic_year_name';
      END IF;
      
      -- Look up studio grade
      SELECT id INTO v_studio_grade_id
      FROM public.studio_grades
      WHERE slug = v_row->>'studio_grade_slug';
      
      IF v_studio_grade_id IS NULL THEN
        RAISE EXCEPTION 'Studio grade with slug "%" not found', v_row->>'studio_grade_slug';
      END IF;
      
      -- Look up payment plan (optional)
      IF v_row->>'payment_plan_name' IS NOT NULL AND v_row->>'payment_plan_name' != '' THEN
        SELECT id INTO v_payment_plan_id
        FROM public.payment_plans pp
        INNER JOIN public.academic_years ay ON pp.academic_year_id = ay.id
        WHERE pp.name = v_row->>'payment_plan_name'
          AND ay.name = v_row->>'academic_year_name';
      END IF;
      
      -- Calculate weeks if not provided
      IF v_row->>'weeks' IS NOT NULL AND v_row->>'weeks' != '' THEN
        v_weeks := (v_row->>'weeks')::INTEGER;
      ELSE
        -- Calculate from dates
        v_weeks := EXTRACT(EPOCH FROM ((v_row->>'contract_end')::DATE - (v_row->>'contract_start')::DATE)) / 604800;
      END IF;
      
      INSERT INTO public.contracts (
        slug,
        name,
        academic_year_id,
        studio_grade_id,
        payment_plan_id,
        contract_start,
        contract_end,
        weeks,
        weekly_price_override,
        deposit_override,
        summary,
        cta_label,
        display_order,
        is_active
      )
      VALUES (
        v_row->>'slug',
        v_row->>'name',
        v_academic_year_id,
        v_studio_grade_id,
        v_payment_plan_id,
        (v_row->>'contract_start')::DATE,
        (v_row->>'contract_end')::DATE,
        v_weeks,
        NULLIF(v_row->>'weekly_price_override', '')::NUMERIC(10,2),
        NULLIF(v_row->>'deposit_override', '')::NUMERIC(10,2),
        v_row->>'summary',
        COALESCE(v_row->>'cta_label', 'Enquire'),
        COALESCE((v_row->>'display_order')::INTEGER, 0),
        COALESCE((v_row->>'is_active')::BOOLEAN, true)
      )
      ON CONFLICT (slug) DO UPDATE
      SET
        name = EXCLUDED.name,
        academic_year_id = EXCLUDED.academic_year_id,
        studio_grade_id = EXCLUDED.studio_grade_id,
        payment_plan_id = EXCLUDED.payment_plan_id,
        contract_start = EXCLUDED.contract_start,
        contract_end = EXCLUDED.contract_end,
        weeks = EXCLUDED.weeks,
        weekly_price_override = EXCLUDED.weekly_price_override,
        deposit_override = EXCLUDED.deposit_override,
        summary = EXCLUDED.summary,
        cta_label = EXCLUDED.cta_label,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id INTO v_record_id;
      
      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.bulk_import_academic_years(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_import_studio_grades(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_import_studios(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_import_studio_grade_prices(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_import_payment_plans(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_import_payment_plan_installments(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_import_contracts(JSONB, UUID) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.bulk_import_academic_years IS 'Bulk import academic years from JSONB array';
COMMENT ON FUNCTION public.bulk_import_studio_grades IS 'Bulk import studio grades from JSONB array';
COMMENT ON FUNCTION public.bulk_import_studios IS 'Bulk import studios from JSONB array (requires studio grade slugs)';
COMMENT ON FUNCTION public.bulk_import_studio_grade_prices IS 'Bulk import studio grade prices per academic year';
COMMENT ON FUNCTION public.bulk_import_payment_plans IS 'Bulk import payment plans per academic year';
COMMENT ON FUNCTION public.bulk_import_payment_plan_installments IS 'Bulk import payment plan installments';
COMMENT ON FUNCTION public.bulk_import_contracts IS 'Bulk import contracts (requires academic year, studio grade, optional payment plan)';

-- ============================================================================
-- FUNCTION: BULK IMPORT PARTNERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_import_partners(
  p_data JSONB,
  p_imported_by UUID
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
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      INSERT INTO public.partners (
        name,
        contact_name,
        contact_email,
        contact_phone,
        commission_percentage,
        is_active,
        notes
      )
      VALUES (
        v_row->>'name',
        NULLIF(v_row->>'contact_name', ''),
        NULLIF(v_row->>'contact_email', ''),
        NULLIF(v_row->>'contact_phone', ''),
        COALESCE((v_row->>'commission_percentage')::NUMERIC(5,2), 5.00),
        COALESCE((v_row->>'is_active')::BOOLEAN, true),
        NULLIF(v_row->>'notes', '')
      )
      RETURNING id INTO v_record_id;
      
      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;

-- ============================================================================
-- FUNCTION: BULK IMPORT CASHBACK CAMPAIGNS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_import_cashback_campaigns(
  p_data JSONB,
  p_imported_by UUID
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
  v_applies_to TEXT;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      -- Normalize applies_to
      v_applies_to := LOWER(COALESCE(v_row->>'applies_to', 'all'));
      IF v_applies_to NOT IN ('all', 'new', 'rebooking') THEN
        v_applies_to := 'all';
      END IF;
      
      INSERT INTO public.cashback_campaigns (
        name,
        description,
        cashback_amount,
        applies_to,
        start_date,
        end_date,
        is_active,
        max_uses,
        current_uses,
        created_by
      )
      VALUES (
        v_row->>'name',
        NULLIF(v_row->>'description', ''),
        (v_row->>'cashback_amount')::NUMERIC(10,2),
        v_applies_to,
        (v_row->>'start_date')::DATE,
        (v_row->>'end_date')::DATE,
        COALESCE((v_row->>'is_active')::BOOLEAN, true),
        NULLIF(v_row->>'max_uses', '')::INTEGER,
        COALESCE((v_row->>'current_uses')::INTEGER, 0),
        p_imported_by
      )
      RETURNING id INTO v_record_id;
      
      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;

-- ============================================================================
-- ADDITIONAL GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.bulk_import_partners(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_import_cashback_campaigns(JSONB, UUID) TO authenticated;

-- ============================================================================
-- ADDITIONAL COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.bulk_import_partners IS 'Bulk import partners (referral organizations)';
COMMENT ON FUNCTION public.bulk_import_cashback_campaigns IS 'Bulk import cashback campaigns';

