-- Bulk import: Applications with custom contracts.
-- Creates per-row: custom contract (weekly rate + duration), custom payment plan from
-- instalment_due_dates/instalment_amounts, backfill schedule, application, then discount
-- when system total > Given Total (historical adjustment).

-- ============================================================================
-- 1. Discount campaign for bulk-import historical adjustment
-- ============================================================================
INSERT INTO public.discount_campaigns (
  id,
  name,
  description,
  discount_amount,
  applies_to,
  start_date,
  end_date,
  is_active,
  max_uses,
  current_uses
)
SELECT
  gen_random_uuid(),
  'Bulk import – historical adjustment',
  'Used when importing applications with custom contracts where system total exceeds historical Given Total. Discount brings effective charge in line with history.',
  0,
  'all',
  '2000-01-01'::DATE,
  '2099-12-31'::DATE,
  true,
  NULL,
  0
WHERE NOT EXISTS (
  SELECT 1 FROM public.discount_campaigns WHERE name = 'Bulk import – historical adjustment'
);

-- ============================================================================
-- 2. Helper: parse "Nearest Exceeding Duration" (e.g. 48w 3d) -> weeks, extra_days
-- ============================================================================
CREATE OR REPLACE FUNCTION public.parse_duration_weeks_days(p_text TEXT)
RETURNS TABLE(weeks INT, extra_days SMALLINT)
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_weeks INT := 0;
  v_days SMALLINT := 0;
  v_m TEXT[];
BEGIN
  IF p_text IS NULL OR TRIM(p_text) = '' THEN
    RETURN QUERY SELECT 0::INT, 0::SMALLINT;
    RETURN;
  END IF;
  v_m := regexp_match(TRIM(p_text), '(\d+)\s*w\s*(\d+)\s*d');
  IF v_m IS NOT NULL AND array_length(v_m, 1) >= 2 THEN
    v_weeks := v_m[1]::INT;
    v_days := LEAST(6, GREATEST(0, v_m[2]::INT))::SMALLINT;
  END IF;
  RETURN QUERY SELECT v_weeks, v_days;
END;
$$;

-- ============================================================================
-- 3. Helper: parse "Custom contract start date" (e.g. "24 September 2025 to 29 Aug 2026")
-- ============================================================================
CREATE OR REPLACE FUNCTION public.parse_contract_date_range(p_text TEXT)
RETURNS TABLE(contract_start DATE, contract_end DATE)
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_start_str TEXT;
  v_end_str TEXT;
  v_start DATE;
  v_end DATE;
BEGIN
  IF p_text IS NULL OR TRIM(p_text) = '' THEN
    RETURN;
  END IF;
  v_start_str := trim(split_part(p_text, ' to ', 1));
  v_end_str := trim(split_part(p_text, ' to ', 2));
  IF v_end_str = v_start_str OR v_end_str = '' THEN
    v_end_str := NULL;
  END IF;
  BEGIN
    v_start := to_date(v_start_str, 'DD Month YYYY');
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      v_start := to_date(v_start_str, 'DD Mon YYYY');
    EXCEPTION WHEN OTHERS THEN
      RETURN;
    END;
  END;
  IF v_end_str IS NOT NULL THEN
    BEGIN
      v_end := to_date(v_end_str, 'DD Month YYYY');
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        v_end := to_date(v_end_str, 'DD Mon YYYY');
      EXCEPTION WHEN OTHERS THEN
        v_end := NULL;
      END;
    END;
  END IF;
  IF v_end IS NULL AND v_end_str IS NOT NULL THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT v_start, COALESCE(v_end, v_start);
END;
$$;

-- ============================================================================
-- 4. bulk_import_applications_custom_contracts RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.bulk_import_applications_custom_contracts(
  p_data JSONB,
  p_imported_by UUID,
  p_skip_existing BOOLEAN DEFAULT false
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
  v_student_id UUID;
  v_email TEXT;
  v_academic_year_id UUID;
  v_studio_grade_id UUID;
  v_source_contract_id UUID;
  v_weeks INT;
  v_extra_days SMALLINT;
  v_contract_start DATE;
  v_contract_end DATE;
  v_weekly_rate NUMERIC(12,4);
  v_given_total NUMERIC(12,4);
  v_discount_needed NUMERIC(12,4);
  v_new_contract_id UUID;
  v_new_plan_id UUID;
  v_slug_base TEXT;
  v_unique_slug TEXT;
  v_plan_name TEXT;
  v_dates_str TEXT;
  v_amounts_str TEXT;
  v_dates_arr TEXT[];
  v_amounts_arr TEXT[];
  v_seq INT;
  v_due_date DATE;
  v_amount NUMERIC(12,4);
  v_status TEXT;
  v_submitted_at TIMESTAMPTZ;
  v_step1_payload JSONB;
  v_step2_payload JSONB;
  v_step3_payload JSONB;
  v_step4_payload JSONB;
  v_step5_payload JSONB;
  v_step6_payload JSONB;
  v_passport_path TEXT;
  v_visa_path TEXT;
  v_passport_photo_path TEXT;
  v_student_proof_path TEXT;
  v_utility_bill_path TEXT;
  v_id_document_path TEXT;
  v_bank_statement_path TEXT;
  v_contract_pdf_path TEXT;
  v_referral_code TEXT;
  v_studio_id UUID;
  v_deposit_amount NUMERIC;
  v_deposit_paid_date DATE;
  v_booking_source TEXT;
  v_existing_id UUID;
  v_campaign_id UUID;
  v_system_total NUMERIC(12,4);
  v_discount_to_apply NUMERIC(12,4);
  v_num_instalments INT;
  v_raw NUMERIC;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  SELECT id INTO v_campaign_id FROM public.discount_campaigns WHERE name = 'Bulk import – historical adjustment' LIMIT 1;
  IF v_campaign_id IS NULL THEN
    RAISE EXCEPTION 'Discount campaign "Bulk import – historical adjustment" not found. Run migration 20260243.';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    v_studio_id := NULL;
    v_submitted_at := NULL;
    BEGIN
      v_email := LOWER(TRIM(v_row->>'email'));
      IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'Email is required for application import';
      END IF;

      SELECT id INTO v_student_id FROM auth.users WHERE email = v_email LIMIT 1;
      IF v_student_id IS NULL THEN
        RAISE EXCEPTION 'User with email % does not exist. User must be created first via Edge Function.', v_email;
      END IF;

      -- Resolve academic year and studio grade from template contract (contract_slug + academic_year_name)
      SELECT c.id, c.academic_year_id, c.studio_grade_id INTO v_source_contract_id, v_academic_year_id, v_studio_grade_id
      FROM public.contracts c
      JOIN public.academic_years ay ON ay.id = c.academic_year_id AND ay.name = NULLIF(TRIM(v_row->>'academic_year_name'), '')
      WHERE c.slug = TRIM(v_row->>'contract_slug') AND c.student_application_id IS NULL
      LIMIT 1;
      IF v_source_contract_id IS NULL THEN
        RAISE EXCEPTION 'Contract with slug % for academic year % not found (template contract)', v_row->>'contract_slug', v_row->>'academic_year_name';
      END IF;

      -- Skip if application already exists for this student + same contract slug + academic year (idempotent)
      v_existing_id := NULL;
      IF p_skip_existing THEN
        SELECT sa.id INTO v_existing_id
        FROM public.student_applications sa
        JOIN public.contracts c ON c.id = sa.contract_id AND c.source_contract_id = v_source_contract_id
        WHERE sa.student_id = v_student_id
        LIMIT 1;
        IF v_existing_id IS NOT NULL THEN
          RETURN QUERY SELECT v_row_num, 'skipped'::TEXT, v_existing_id, 'Application already exists for this student and contract'::TEXT;
        END IF;
      END IF;

      IF v_existing_id IS NULL THEN
      -- Parse duration (e.g. 48w 3d)
      SELECT pd.weeks, pd.extra_days INTO v_weeks, v_extra_days
      FROM public.parse_duration_weeks_days(NULLIF(TRIM(v_row->>'Nearest Exceeding Duration'), '')) pd
      LIMIT 1;
      IF v_weeks IS NULL OR v_weeks <= 0 THEN
        RAISE EXCEPTION 'Nearest Exceeding Duration must be like 48w 3d';
      END IF;
      v_extra_days := COALESCE(v_extra_days, 0)::SMALLINT;

      -- Parse contract date range
      SELECT pr.contract_start, pr.contract_end INTO v_contract_start, v_contract_end
      FROM public.parse_contract_date_range(NULLIF(TRIM(v_row->>'Custom contract start date'), '')) pr
      LIMIT 1;
      IF v_contract_start IS NULL OR v_contract_end IS NULL THEN
        RAISE EXCEPTION 'Custom contract start date must be like "24 September 2025 to 29 August 2026"';
      END IF;

      -- Weekly rate: strip commas and parse
      v_raw := NULL;
      IF v_row->>'Weekly Rate' IS NOT NULL AND v_row->>'Weekly Rate' != '' THEN
        v_raw := (regexp_replace(v_row->>'Weekly Rate', ',', '', 'g'))::NUMERIC;
      END IF;
      IF v_raw IS NULL OR v_raw <= 0 THEN
        RAISE EXCEPTION 'Weekly Rate is required and must be positive';
      END IF;
      v_weekly_rate := v_raw;

      v_given_total := NULL;
      IF v_row->>'Given Total' IS NOT NULL AND v_row->>'Given Total' != '' THEN
        v_given_total := (regexp_replace(v_row->>'Given Total', ',', '', 'g'))::NUMERIC;
      END IF;
      v_given_total := COALESCE(v_given_total, 0);

      v_discount_needed := NULL;
      IF v_row->>'Discount Needed' IS NOT NULL AND v_row->>'Discount Needed' != '' THEN
        v_discount_needed := (regexp_replace(TRIM(v_row->>'Discount Needed'), '[^0-9.-]', '', 'g'))::NUMERIC;
      END IF;
      v_discount_needed := COALESCE(v_discount_needed, 0);

      -- Unique slug for custom contract (before we have application id we use row number + student id slice)
      v_slug_base := TRIM(v_row->>'contract_slug');
      v_unique_slug := 'custom-import-' || v_row_num::TEXT || '-' || substring(v_student_id::TEXT from 1 for 8);
      -- Ensure slug unique
      IF EXISTS (SELECT 1 FROM public.contracts WHERE slug = v_unique_slug) THEN
        v_unique_slug := v_unique_slug || '-' || (extract(epoch from now())::BIGINT::TEXT);
      END IF;

      -- 1) Create custom payment plan with fixed installments from instalment_due_dates / instalment_amounts
      v_plan_name := COALESCE(NULLIF(TRIM(v_row->>'payment_plan_name'), ''), 'Custom') || ' (Import)';
      v_dates_str := NULLIF(TRIM(v_row->>'instalment_due_dates'), '');
      v_amounts_str := NULLIF(TRIM(v_row->>'instalment_amounts'), '');
      IF v_dates_str IS NULL OR v_amounts_str IS NULL THEN
        RAISE EXCEPTION 'instalment_due_dates and instalment_amounts are required (comma-separated)';
      END IF;
      v_dates_arr := regexp_split_to_array(v_dates_str, '\s*,\s*');
      v_amounts_arr := regexp_split_to_array(v_amounts_str, '\s*,\s*');
      IF array_length(v_amounts_arr, 1) IS NULL OR array_length(v_amounts_arr, 1) = 0 THEN
        v_amounts_arr := ARRAY[v_amounts_str];
      END IF;
      v_num_instalments := LEAST(array_length(v_dates_arr, 1), array_length(v_amounts_arr, 1));
      IF v_num_instalments IS NULL OR v_num_instalments <= 0 THEN
        RAISE EXCEPTION 'At least one instalment date and amount required';
      END IF;

      INSERT INTO public.payment_plans (academic_year_id, name, description, deposit_amount, is_active, source_payment_plan_id, student_application_id)
      VALUES (v_academic_year_id, v_plan_name, 'Bulk import custom schedule', 0, true, NULL, NULL)
      RETURNING id INTO v_new_plan_id;

      FOR v_seq IN 1..v_num_instalments
      LOOP
        v_due_date := NULL;
        IF v_seq <= array_length(v_dates_arr, 1) THEN
          BEGIN
            v_due_date := (trim(v_dates_arr[v_seq]))::DATE;
          EXCEPTION WHEN OTHERS THEN
            NULL;
          END;
        END IF;
        v_amount := 0;
        IF v_seq <= array_length(v_amounts_arr, 1) THEN
          BEGIN
            v_amount := (regexp_replace(trim(v_amounts_arr[v_seq]), ',', '', 'g'))::NUMERIC(12,4);
          EXCEPTION WHEN OTHERS THEN
            v_amount := 0;
          END;
        END IF;
        IF v_due_date IS NULL THEN
          v_due_date := v_contract_start + (v_seq * 30) * INTERVAL '1 day';
        END IF;
        INSERT INTO public.payment_plan_installments (payment_plan_id, sequence, label, due_date, due_date_offset_days, amount_type, amount_value)
        VALUES (v_new_plan_id, v_seq, 'Instalment ' || v_seq, v_due_date, NULL, 'fixed', v_amount);
      END LOOP;

      -- 2) Create custom contract
      INSERT INTO public.contracts (
        academic_year_id, studio_grade_id, payment_plan_id, slug, name, contract_start, contract_end,
        weeks, extra_days, weekly_price_override, deposit_override, display_order, is_active,
        visible_on_portal, source_contract_id, student_application_id
      )
      VALUES (
        v_academic_year_id, v_studio_grade_id, v_new_plan_id, v_unique_slug, v_plan_name || ' Contract',
        v_contract_start, v_contract_end, v_weeks, v_extra_days, v_weekly_rate, NULL, 999, true,
        false, v_source_contract_id, NULL
      )
      RETURNING id INTO v_new_contract_id;

      INSERT INTO public.contract_payment_plans (contract_id, payment_plan_id, display_order)
      VALUES (v_new_contract_id, v_new_plan_id, 1);

      PERFORM public.backfill_contract_payment_schedule_for_contract(v_new_contract_id, v_new_plan_id);

      -- Studio
      IF v_row->>'studio_number' IS NOT NULL AND v_row->>'studio_number' != '' THEN
        SELECT s.id INTO v_studio_id FROM public.studios s WHERE s.studio_number = v_row->>'studio_number' LIMIT 1;
      END IF;

      v_status := COALESCE(NULLIF(TRIM(v_row->>'status'), ''), 'confirmed');
      IF v_row->>'submitted_at' IS NOT NULL AND v_row->>'submitted_at' != '' THEN
        v_submitted_at := (v_row->>'submitted_at')::TIMESTAMPTZ;
      END IF;
      v_booking_source := NULLIF(LOWER(TRIM(v_row->>'booking_source')), '');
      IF v_booking_source IS NOT NULL AND v_booking_source NOT IN ('rebooker', 'website', 'imported', 'partner_referral', 'unity_sales', 'hfs_sales') THEN
        v_booking_source := NULL;
      END IF;

      v_step1_payload := jsonb_build_object(
        'first_name', NULLIF(TRIM(v_row->>'first_name'), ''),
        'last_name', NULLIF(TRIM(v_row->>'last_name'), ''),
        'date_of_birth', NULLIF(TRIM(v_row->>'date_of_birth'), ''),
        'age', CASE WHEN v_row->>'age' IS NOT NULL AND v_row->>'age' != '' THEN v_row->>'age' WHEN v_row->>'date_of_birth' IS NOT NULL AND v_row->>'date_of_birth' != '' THEN EXTRACT(YEAR FROM AGE((v_row->>'date_of_birth')::DATE))::TEXT ELSE NULL END,
        'ethnicity', NULLIF(TRIM(v_row->>'ethnicity'), ''),
        'gender', NULLIF(TRIM(v_row->>'gender'), ''),
        'ucas_id', NULLIF(TRIM(v_row->>'ucas_id'), ''),
        'country', NULLIF(TRIM(v_row->>'country'), ''),
        'referral_code', NULLIF(TRIM(v_row->>'referral_code'), '')
      );
      v_step2_payload := jsonb_build_object('email', v_email, 'mobile', NULLIF(TRIM(v_row->>'mobile'), ''), 'address_line_1', NULLIF(TRIM(v_row->>'address_line_1'), ''), 'address_line_2', NULLIF(TRIM(v_row->>'address_line_2'), ''), 'postcode', NULLIF(TRIM(v_row->>'postcode'), ''), 'town', NULLIF(TRIM(v_row->>'town'), ''));
      v_step3_payload := jsonb_build_object('year_of_study', NULLIF(TRIM(v_row->>'year_of_study'), ''), 'field_of_study', NULLIF(TRIM(v_row->>'field_of_study'), ''), 'disabled', NULLIF(TRIM(v_row->>'disabled'), ''), 'smoker', NULLIF(TRIM(v_row->>'smoker'), ''), 'medical_requirements', NULLIF(TRIM(v_row->>'medical_requirements'), ''), 'entry_into_uk', NULLIF(TRIM(v_row->>'entry_into_uk'), ''));
      v_passport_path := NULLIF(TRIM(v_row->>'passport_path'), '');
      v_visa_path := NULLIF(TRIM(v_row->>'visa_path'), '');
      v_passport_photo_path := NULLIF(TRIM(v_row->>'passport_photo_path'), '');
      v_student_proof_path := NULLIF(TRIM(v_row->>'student_proof_path'), '');
      v_step4_payload := jsonb_build_object('uk_citizen', COALESCE(NULLIF(TRIM(v_row->>'uk_citizen'), ''), 'yes'), 'passport_document', v_passport_path, 'visa_document', v_visa_path, 'passport_photo', v_passport_photo_path, 'student_proof', v_student_proof_path);
      v_utility_bill_path := NULLIF(TRIM(v_row->>'utility_bill_path'), '');
      v_id_document_path := NULLIF(TRIM(v_row->>'id_document_path'), '');
      v_bank_statement_path := NULLIF(TRIM(v_row->>'bank_statement_path'), '');
      v_step5_payload := jsonb_build_object('selected_plan_id', v_new_plan_id::TEXT, 'guarantor_name', NULLIF(TRIM(v_row->>'guarantor_name'), ''), 'guarantor_email', NULLIF(TRIM(v_row->>'guarantor_email'), ''), 'guarantor_phone', NULLIF(TRIM(v_row->>'guarantor_phone'), ''), 'guarantor_relationship', NULLIF(TRIM(v_row->>'guarantor_relationship'), ''), 'guarantor_dob', NULLIF(TRIM(v_row->>'guarantor_dob'), ''), 'witness_name', NULLIF(TRIM(v_row->>'witness_name'), ''), 'witness_email', NULLIF(TRIM(v_row->>'witness_email'), ''), 'witness_phone', NULLIF(TRIM(v_row->>'witness_phone'), ''), 'utility_bill', v_utility_bill_path, 'id_document', v_id_document_path, 'bank_statement', v_bank_statement_path, 'consent', true);
      v_contract_pdf_path := NULLIF(TRIM(v_row->>'contract_pdf_path'), '');
      v_step6_payload := jsonb_build_object('contract_signed', CASE WHEN v_contract_pdf_path IS NOT NULL THEN true ELSE false END, 'contract_pdf_path', v_contract_pdf_path);

      INSERT INTO public.student_applications (
        student_id, studio_grade_id, contract_id, assigned_studio_id, status, submitted_at, reserved_studio_expires_at, selected_payment_plan_id,
        booking_source, is_rebooking, rebooking_reason
      )
      VALUES (
        v_student_id, v_studio_grade_id, v_new_contract_id, v_studio_id, v_status::public.application_status, COALESCE(v_submitted_at, NOW()), NULL, v_new_plan_id,
        v_booking_source, (v_booking_source = 'rebooker'), CASE WHEN v_booking_source = 'rebooker' THEN 'Imported as rebooker' ELSE NULL END
      )
      RETURNING id INTO v_record_id;

      UPDATE public.contracts SET student_application_id = v_record_id WHERE id = v_new_contract_id;
      UPDATE public.payment_plans SET student_application_id = v_record_id WHERE id = v_new_plan_id;

      INSERT INTO public.student_application_steps (application_id, step_number, payload, is_complete)
      VALUES (v_record_id, 1, v_step1_payload, true), (v_record_id, 2, v_step2_payload, true), (v_record_id, 3, v_step3_payload, true), (v_record_id, 4, v_step4_payload, true), (v_record_id, 5, v_step5_payload, true), (v_record_id, 6, v_step6_payload, v_status = 'confirmed')
      ON CONFLICT (application_id, step_number) DO UPDATE SET payload = EXCLUDED.payload, is_complete = EXCLUDED.is_complete, updated_at = NOW();

      IF v_passport_path IS NOT NULL THEN
        INSERT INTO public.student_documents (application_id, document_type, storage_path, original_filename, status, uploaded_by, verified_by, uploaded_at)
        VALUES (v_record_id, 'passport', v_passport_path, (regexp_split_to_array(v_passport_path, '/'))[array_length(regexp_split_to_array(v_passport_path, '/'), 1)], 'approved', p_imported_by, p_imported_by, COALESCE(v_submitted_at, NOW())) ON CONFLICT DO NOTHING;
      END IF;
      IF v_visa_path IS NOT NULL THEN
        INSERT INTO public.student_documents (application_id, document_type, storage_path, original_filename, status, uploaded_by, verified_by, uploaded_at)
        VALUES (v_record_id, 'visa', v_visa_path, (regexp_split_to_array(v_visa_path, '/'))[array_length(regexp_split_to_array(v_visa_path, '/'), 1)], 'approved', p_imported_by, p_imported_by, COALESCE(v_submitted_at, NOW())) ON CONFLICT DO NOTHING;
      END IF;
      IF v_passport_photo_path IS NOT NULL THEN
        INSERT INTO public.student_documents (application_id, document_type, storage_path, original_filename, status, uploaded_by, verified_by, uploaded_at)
        VALUES (v_record_id, 'passport_photo', v_passport_photo_path, (regexp_split_to_array(v_passport_photo_path, '/'))[array_length(regexp_split_to_array(v_passport_photo_path, '/'), 1)], 'approved', p_imported_by, p_imported_by, COALESCE(v_submitted_at, NOW())) ON CONFLICT DO NOTHING;
      END IF;
      IF v_student_proof_path IS NOT NULL THEN
        INSERT INTO public.student_documents (application_id, document_type, storage_path, original_filename, status, uploaded_by, verified_by, uploaded_at)
        VALUES (v_record_id, 'student_proof', v_student_proof_path, (regexp_split_to_array(v_student_proof_path, '/'))[array_length(regexp_split_to_array(v_student_proof_path, '/'), 1)], 'approved', p_imported_by, p_imported_by, COALESCE(v_submitted_at, NOW())) ON CONFLICT DO NOTHING;
      END IF;
      IF v_utility_bill_path IS NOT NULL THEN
        INSERT INTO public.student_documents (application_id, document_type, storage_path, original_filename, status, uploaded_by, verified_by, uploaded_at)
        VALUES (v_record_id, 'utility_bill', v_utility_bill_path, (regexp_split_to_array(v_utility_bill_path, '/'))[array_length(regexp_split_to_array(v_utility_bill_path, '/'), 1)], 'approved', p_imported_by, p_imported_by, COALESCE(v_submitted_at, NOW())) ON CONFLICT DO NOTHING;
      END IF;
      IF v_id_document_path IS NOT NULL THEN
        INSERT INTO public.student_documents (application_id, document_type, storage_path, original_filename, status, uploaded_by, verified_by, uploaded_at)
        VALUES (v_record_id, 'id_document', v_id_document_path, (regexp_split_to_array(v_id_document_path, '/'))[array_length(regexp_split_to_array(v_id_document_path, '/'), 1)], 'approved', p_imported_by, p_imported_by, COALESCE(v_submitted_at, NOW())) ON CONFLICT DO NOTHING;
      END IF;
      IF v_bank_statement_path IS NOT NULL THEN
        INSERT INTO public.student_documents (application_id, document_type, storage_path, original_filename, status, uploaded_by, verified_by, uploaded_at)
        VALUES (v_record_id, 'bank_statement', v_bank_statement_path, (regexp_split_to_array(v_bank_statement_path, '/'))[array_length(regexp_split_to_array(v_bank_statement_path, '/'), 1)], 'approved', p_imported_by, p_imported_by, COALESCE(v_submitted_at, NOW())) ON CONFLICT DO NOTHING;
      END IF;

      v_deposit_amount := NULLIF((v_row->>'deposit_amount')::NUMERIC, NULL);
      v_deposit_paid_date := NULLIF((v_row->>'deposit_paid_date')::DATE, NULL);
      IF v_deposit_amount IS NOT NULL AND v_deposit_amount > 0 THEN
        INSERT INTO public.manual_payments (application_id, amount, payment_date, payment_type, payment_method, notes, recorded_by)
        VALUES (v_record_id, v_deposit_amount, COALESCE(v_deposit_paid_date, v_submitted_at::DATE, CURRENT_DATE), 'deposit', 'bank_transfer', 'Historical deposit payment (imported)', p_imported_by) ON CONFLICT DO NOTHING;
        UPDATE public.student_applications SET deposit_payment_intent_id = 'manual-' || v_record_id::TEXT WHERE id = v_record_id;
      END IF;

      v_referral_code := NULLIF(TRIM(v_row->>'referral_code'), '');
      IF v_referral_code IS NOT NULL THEN
        INSERT INTO public.partner_referrals (partner_id, application_id, referral_code, commission_percentage, created_at)
        SELECT p.id, v_record_id, v_referral_code, p.commission_percentage, COALESCE(v_submitted_at, NOW()) FROM public.partners p WHERE p.referral_code = v_referral_code LIMIT 1 ON CONFLICT DO NOTHING;
      END IF;

      -- Discount: use CSV "Discount Needed" or (system total - given total) when system total > given total
      v_system_total := public.calculate_contract_value(v_new_contract_id);
      v_discount_to_apply := v_discount_needed;
      IF v_discount_to_apply <= 0 AND v_given_total > 0 AND v_system_total > v_given_total THEN
        v_discount_to_apply := v_system_total - v_given_total;
      END IF;
      IF v_discount_to_apply > 0 THEN
        INSERT INTO public.application_discounts (application_id, campaign_id, discount_amount, applied_by, notes)
        VALUES (v_record_id, v_campaign_id, v_discount_to_apply, p_imported_by, 'Bulk import – historical adjustment')
        ON CONFLICT (application_id) DO UPDATE SET discount_amount = EXCLUDED.discount_amount, updated_at = NOW();
        UPDATE public.student_applications SET discount_amount = v_discount_to_apply WHERE id = v_record_id;
      END IF;

      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_import_applications_custom_contracts(JSONB, UUID, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.bulk_import_applications_custom_contracts(JSONB, UUID, BOOLEAN) IS
'Bulk import applications with custom contracts: creates contract (weekly rate + duration), plan from instalment_due_dates/amounts, backfill, application; discount when system total > Given Total.';
