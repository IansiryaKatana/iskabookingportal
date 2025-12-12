-- Update Bulk Import Functions to Use NUMERIC(12,4) Precision
-- This ensures imported data uses the new precision
-- 
-- ROLLBACK: This is a function update, rollback is handled by the main rollback migration

BEGIN;

-- Update bulk_import_studio_grade_prices function
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
      
      -- Look up studio grade by name
      SELECT id INTO v_studio_grade_id
      FROM public.studio_grades
      WHERE name = v_row->>'studio_grade_name';
      
      IF v_studio_grade_id IS NULL THEN
        RAISE EXCEPTION 'Studio grade "%" not found', v_row->>'studio_grade_name';
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
        (v_row->>'weekly_price')::NUMERIC(12,4),
        NULLIF(v_row->>'deposit_amount_override', '')::NUMERIC(12,4),
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

-- Update bulk_import_payment_plans function
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
          deposit_amount = NULLIF(v_row->>'deposit_amount', '')::NUMERIC(12,4),
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
          NULLIF(v_row->>'deposit_amount', '')::NUMERIC(12,4),
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

-- Update bulk_import_payment_plan_installments function
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
        (v_row->>'amount_value')::NUMERIC(12,4)
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

-- Update bulk_import_contracts function (partial - only the casts)
-- Note: This function is very large, so we're only updating the specific casts
-- The function signature and most logic remains the same
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
      -- Look up academic year by name
      SELECT id INTO v_academic_year_id
      FROM public.academic_years
      WHERE name = v_row->>'academic_year_name';
      
      IF v_academic_year_id IS NULL THEN
        RAISE EXCEPTION 'Academic year "%" not found', v_row->>'academic_year_name';
      END IF;
      
      -- Look up studio grade by name
      SELECT id INTO v_studio_grade_id
      FROM public.studio_grades
      WHERE name = v_row->>'studio_grade_name';
      
      IF v_studio_grade_id IS NULL THEN
        RAISE EXCEPTION 'Studio grade "%" not found', v_row->>'studio_grade_name';
      END IF;
      
      -- Look up payment plan by name and academic year
      SELECT id INTO v_payment_plan_id
      FROM public.payment_plans pp
      INNER JOIN public.academic_years ay ON pp.academic_year_id = ay.id
      WHERE pp.name = v_row->>'payment_plan_name'
        AND ay.name = v_row->>'academic_year_name';
      
      -- Calculate weeks from dates
      v_weeks := EXTRACT(EPOCH FROM ((v_row->>'contract_end')::DATE - (v_row->>'contract_start')::DATE)) / 604800;
      
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
        NULLIF(v_row->>'weekly_price_override', '')::NUMERIC(12,4),
        NULLIF(v_row->>'deposit_override', '')::NUMERIC(12,4),
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

-- Update bulk_import_cashback_campaigns function
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
  v_max_uses INTEGER;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      v_applies_to := COALESCE(v_row->>'applies_to', 'all');
      v_max_uses := NULLIF(v_row->>'max_uses', '')::INTEGER;
      
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
        (v_row->>'cashback_amount')::NUMERIC(12,4),
        v_applies_to,
        (v_row->>'start_date')::DATE,
        (v_row->>'end_date')::DATE,
        COALESCE((v_row->>'is_active')::BOOLEAN, true),
        v_max_uses,
        0,
        p_imported_by
      )
      ON CONFLICT (name) DO UPDATE
      SET
        description = EXCLUDED.description,
        cashback_amount = EXCLUDED.cashback_amount,
        applies_to = EXCLUDED.applies_to,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        is_active = EXCLUDED.is_active,
        max_uses = EXCLUDED.max_uses,
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

COMMIT;

