-- Bulk Import Student Applications Function
-- Handles bulk import of historical student applications with all steps, documents, and related data

-- ============================================================================
-- HELPER FUNCTION: Find or create user email lookup (for validation only)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.find_user_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM auth.users WHERE email = LOWER(p_email) LIMIT 1;
$$;

COMMENT ON FUNCTION public.find_user_by_email IS 'Find user ID by email (case-insensitive)';

-- ============================================================================
-- FUNCTION: BULK IMPORT STUDENT APPLICATIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_import_student_applications(
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
  
  -- User fields
  v_student_id UUID;
  v_email TEXT;
  v_user_exists BOOLEAN;
  
  -- Application fields
  v_contract_id UUID;
  v_studio_grade_id UUID;
  v_studio_id UUID;
  v_status TEXT;
  v_submitted_at TIMESTAMPTZ;
  
  -- Step payloads
  v_step1_payload JSONB;
  v_step2_payload JSONB;
  v_step3_payload JSONB;
  v_step4_payload JSONB;
  v_step5_payload JSONB;
  v_step6_payload JSONB;
  
  -- Documents
  v_passport_path TEXT;
  v_visa_path TEXT;
  v_passport_photo_path TEXT;
  v_student_proof_path TEXT;
  v_utility_bill_path TEXT;
  v_id_document_path TEXT;
  v_bank_statement_path TEXT;
  v_contract_pdf_path TEXT;
  
  -- Other fields
  v_referral_code TEXT;
  v_payment_plan_id UUID;
  v_deposit_amount NUMERIC;
  v_deposit_paid_date DATE;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      -- Extract email and check if user exists
      -- Note: User creation must happen in Edge Function via Admin API
      -- This function expects student_id to be provided or user to already exist
      v_email := LOWER(TRIM(v_row->>'email'));
      
      IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'Email is required for application import';
      END IF;
      
      -- Try to find existing user
      SELECT id INTO v_student_id FROM auth.users WHERE email = v_email LIMIT 1;
      
      IF v_student_id IS NULL THEN
        -- User doesn't exist - will be created by Edge Function
        -- For now, we'll return an error indicating user needs to be created
        -- Edge Function should create user first, then call this function again
        RAISE EXCEPTION 'User with email % does not exist. User must be created first via Edge Function.', v_email;
      END IF;
      
      -- Validate and get contract
      SELECT c.id, c.studio_grade_id INTO v_contract_id, v_studio_grade_id
      FROM public.contracts c
      WHERE c.slug = v_row->>'contract_slug'
      LIMIT 1;
      
      IF v_contract_id IS NULL THEN
        RAISE EXCEPTION 'Contract with slug % not found', v_row->>'contract_slug';
      END IF;
      
      -- Get studio if provided
      IF v_row->>'studio_number' IS NOT NULL AND v_row->>'studio_number' != '' THEN
        SELECT s.id INTO v_studio_id
        FROM public.studios s
        WHERE s.studio_number = v_row->>'studio_number'
        LIMIT 1;
        
        IF v_studio_id IS NULL THEN
          RAISE EXCEPTION 'Studio with number % not found', v_row->>'studio_number';
        END IF;
      END IF;
      
      -- Get payment plan if provided
      IF v_row->>'payment_plan_name' IS NOT NULL AND v_row->>'payment_plan_name' != '' THEN
        -- First try direct lookup via contract's academic year
        SELECT pp.id INTO v_payment_plan_id
        FROM public.payment_plans pp
        INNER JOIN public.contracts c ON c.academic_year_id = pp.academic_year_id
        WHERE pp.name = v_row->>'payment_plan_name'
        AND c.id = v_contract_id
        LIMIT 1;
        
        -- If not found, check contract_payment_plans junction table
        IF v_payment_plan_id IS NULL THEN
          SELECT cpp.payment_plan_id INTO v_payment_plan_id
          FROM public.contract_payment_plans cpp
          INNER JOIN public.payment_plans pp ON pp.id = cpp.payment_plan_id
          WHERE cpp.contract_id = v_contract_id
            AND pp.name = v_row->>'payment_plan_name'
          LIMIT 1;
        END IF;
      END IF;
      
      -- Determine status
      v_status := COALESCE(
        NULLIF(TRIM(v_row->>'status'), ''),
        'confirmed' -- Default for historical imports
      );
      
      -- Parse dates
      IF v_row->>'submitted_at' IS NOT NULL AND v_row->>'submitted_at' != '' THEN
        v_submitted_at := (v_row->>'submitted_at')::TIMESTAMPTZ;
      END IF;
      
      -- Build step payloads
      -- Step 1: Personal Details
      -- Auto-calculate age from date_of_birth if age not provided
      v_step1_payload := jsonb_build_object(
        'first_name', NULLIF(TRIM(v_row->>'first_name'), ''),
        'last_name', NULLIF(TRIM(v_row->>'last_name'), ''),
        'date_of_birth', NULLIF(TRIM(v_row->>'date_of_birth'), ''),
        'age', CASE 
          WHEN v_row->>'age' IS NOT NULL AND v_row->>'age' != '' 
            THEN v_row->>'age'
          WHEN v_row->>'date_of_birth' IS NOT NULL AND v_row->>'date_of_birth' != '' 
            THEN EXTRACT(YEAR FROM AGE((v_row->>'date_of_birth')::DATE))::TEXT
          ELSE NULL
        END,
        'ethnicity', NULLIF(TRIM(v_row->>'ethnicity'), ''),
        'gender', NULLIF(TRIM(v_row->>'gender'), ''),
        'ucas_id', NULLIF(TRIM(v_row->>'ucas_id'), ''),
        'country', NULLIF(TRIM(v_row->>'country'), ''),
        'referral_code', NULLIF(TRIM(v_row->>'referral_code'), '')
      );
      
      -- Step 2: Contact Information
      v_step2_payload := jsonb_build_object(
        'email', v_email,
        'mobile', NULLIF(TRIM(v_row->>'mobile'), ''),
        'address_line_1', NULLIF(TRIM(v_row->>'address_line_1'), ''),
        'address_line_2', NULLIF(TRIM(v_row->>'address_line_2'), ''),
        'postcode', NULLIF(TRIM(v_row->>'postcode'), ''),
        'town', NULLIF(TRIM(v_row->>'town'), '')
      );
      
      -- Step 3: Academic & Additional Info
      v_step3_payload := jsonb_build_object(
        'year_of_study', NULLIF(TRIM(v_row->>'year_of_study'), ''),
        'field_of_study', NULLIF(TRIM(v_row->>'field_of_study'), ''),
        'disabled', NULLIF(TRIM(v_row->>'disabled'), ''),
        'smoker', NULLIF(TRIM(v_row->>'smoker'), ''),
        'medical_requirements', NULLIF(TRIM(v_row->>'medical_requirements'), ''),
        'entry_into_uk', NULLIF(TRIM(v_row->>'entry_into_uk'), '')
      );
      
      -- Step 4: Documentation
      v_passport_path := NULLIF(TRIM(v_row->>'passport_path'), '');
      v_visa_path := NULLIF(TRIM(v_row->>'visa_path'), '');
      v_passport_photo_path := NULLIF(TRIM(v_row->>'passport_photo_path'), '');
      v_student_proof_path := NULLIF(TRIM(v_row->>'student_proof_path'), '');
      
      v_step4_payload := jsonb_build_object(
        'uk_citizen', COALESCE(NULLIF(TRIM(v_row->>'uk_citizen'), ''), 'yes'),
        'passport_document', v_passport_path,
        'visa_document', v_visa_path,
        'passport_photo', v_passport_photo_path,
        'student_proof', v_student_proof_path
      );
      
      -- Step 5: Payment Plan & Guarantor
      v_utility_bill_path := NULLIF(TRIM(v_row->>'utility_bill_path'), '');
      v_id_document_path := NULLIF(TRIM(v_row->>'id_document_path'), '');
      v_bank_statement_path := NULLIF(TRIM(v_row->>'bank_statement_path'), '');
      
      v_step5_payload := jsonb_build_object(
        'selected_plan_id', CASE WHEN v_payment_plan_id IS NOT NULL THEN v_payment_plan_id::TEXT ELSE NULL END,
        'guarantor_name', NULLIF(TRIM(v_row->>'guarantor_name'), ''),
        'guarantor_email', NULLIF(TRIM(v_row->>'guarantor_email'), ''),
        'guarantor_phone', NULLIF(TRIM(v_row->>'guarantor_phone'), ''),
        'guarantor_relationship', NULLIF(TRIM(v_row->>'guarantor_relationship'), ''),
        'guarantor_dob', NULLIF(TRIM(v_row->>'guarantor_dob'), ''),
        'witness_name', NULLIF(TRIM(v_row->>'witness_name'), ''),
        'witness_email', NULLIF(TRIM(v_row->>'witness_email'), ''),
        'witness_phone', NULLIF(TRIM(v_row->>'witness_phone'), ''),
        'utility_bill', v_utility_bill_path,
        'id_document', v_id_document_path,
        'bank_statement', v_bank_statement_path,
        'consent', COALESCE((v_row->>'consent')::BOOLEAN, true)
      );
      
      -- Step 6: Agreement & Signing (minimal for historical)
      v_contract_pdf_path := NULLIF(TRIM(v_row->>'contract_pdf_path'), '');
      
      v_step6_payload := jsonb_build_object(
        'contract_signed', CASE WHEN v_contract_pdf_path IS NOT NULL THEN true ELSE false END,
        'contract_pdf_path', v_contract_pdf_path
      );
      
      -- Create application
      INSERT INTO public.student_applications (
        student_id,
        studio_grade_id,
        contract_id,
        assigned_studio_id,
        status,
        submitted_at,
        reserved_studio_expires_at,
        selected_payment_plan_id
      )
      VALUES (
        v_student_id,
        v_studio_grade_id,
        v_contract_id,
        v_studio_id,
        v_status::public.application_status,
        COALESCE(v_submitted_at, NOW()),
        NULL, -- No reservation expiry for historical imports
        v_payment_plan_id
      )
      RETURNING id INTO v_record_id;
      
      -- Create application steps
      INSERT INTO public.student_application_steps (application_id, step_number, payload, is_complete)
      VALUES
        (v_record_id, 1, v_step1_payload, true),
        (v_record_id, 2, v_step2_payload, true),
        (v_record_id, 3, v_step3_payload, true),
        (v_record_id, 4, v_step4_payload, true),
        (v_record_id, 5, v_step5_payload, true),
        (v_record_id, 6, v_step6_payload, v_status = 'confirmed')
      ON CONFLICT (application_id, step_number) DO UPDATE
      SET
        payload = EXCLUDED.payload,
        is_complete = EXCLUDED.is_complete,
        updated_at = NOW();
      
      -- Create document records
      IF v_passport_path IS NOT NULL THEN
        INSERT INTO public.student_documents (
          application_id,
          document_type,
          storage_path,
          original_filename,
          status,
          uploaded_by,
          verified_by,
          uploaded_at
        )
        VALUES (
          v_record_id,
          'passport',
          v_passport_path,
          (regexp_split_to_array(v_passport_path, '/'))[array_length(regexp_split_to_array(v_passport_path, '/'), 1)],
          'approved',
          p_imported_by,
          p_imported_by,
          COALESCE(v_submitted_at, NOW())
        )
        ON CONFLICT DO NOTHING;
      END IF;
      
      IF v_visa_path IS NOT NULL THEN
        INSERT INTO public.student_documents (
          application_id,
          document_type,
          storage_path,
          original_filename,
          status,
          uploaded_by,
          verified_by,
          uploaded_at
        )
        VALUES (
          v_record_id,
          'visa',
          v_visa_path,
          (regexp_split_to_array(v_visa_path, '/'))[array_length(regexp_split_to_array(v_visa_path, '/'), 1)],
          'approved',
          p_imported_by,
          p_imported_by,
          COALESCE(v_submitted_at, NOW())
        )
        ON CONFLICT DO NOTHING;
      END IF;

      IF v_passport_photo_path IS NOT NULL THEN
        INSERT INTO public.student_documents (
          application_id,
          document_type,
          storage_path,
          original_filename,
          status,
          uploaded_by,
          verified_by,
          uploaded_at
        )
        VALUES (
          v_record_id,
          'passport_photo',
          v_passport_photo_path,
          (regexp_split_to_array(v_passport_photo_path, '/'))[array_length(regexp_split_to_array(v_passport_photo_path, '/'), 1)],
          'approved',
          p_imported_by,
          p_imported_by,
          COALESCE(v_submitted_at, NOW())
        )
        ON CONFLICT DO NOTHING;
      END IF;

      IF v_student_proof_path IS NOT NULL THEN
        INSERT INTO public.student_documents (
          application_id,
          document_type,
          storage_path,
          original_filename,
          status,
          uploaded_by,
          verified_by,
          uploaded_at
        )
        VALUES (
          v_record_id,
          'student_proof',
          v_student_proof_path,
          (regexp_split_to_array(v_student_proof_path, '/'))[array_length(regexp_split_to_array(v_student_proof_path, '/'), 1)],
          'approved',
          p_imported_by,
          p_imported_by,
          COALESCE(v_submitted_at, NOW())
        )
        ON CONFLICT DO NOTHING;
      END IF;
      
      IF v_utility_bill_path IS NOT NULL THEN
        INSERT INTO public.student_documents (
          application_id,
          document_type,
          storage_path,
          original_filename,
          status,
          uploaded_by,
          verified_by,
          uploaded_at
        )
        VALUES (
          v_record_id,
          'utility_bill',
          v_utility_bill_path,
          (regexp_split_to_array(v_utility_bill_path, '/'))[array_length(regexp_split_to_array(v_utility_bill_path, '/'), 1)],
          'approved',
          p_imported_by,
          p_imported_by,
          COALESCE(v_submitted_at, NOW())
        )
        ON CONFLICT DO NOTHING;
      END IF;
      
      IF v_id_document_path IS NOT NULL THEN
        INSERT INTO public.student_documents (
          application_id,
          document_type,
          storage_path,
          original_filename,
          status,
          uploaded_by,
          verified_by,
          uploaded_at
        )
        VALUES (
          v_record_id,
          'id_document',
          v_id_document_path,
          (regexp_split_to_array(v_id_document_path, '/'))[array_length(regexp_split_to_array(v_id_document_path, '/'), 1)],
          'approved',
          p_imported_by,
          p_imported_by,
          COALESCE(v_submitted_at, NOW())
        )
        ON CONFLICT DO NOTHING;
      END IF;
      
      IF v_bank_statement_path IS NOT NULL THEN
        INSERT INTO public.student_documents (
          application_id,
          document_type,
          storage_path,
          original_filename,
          status,
          uploaded_by,
          verified_by,
          uploaded_at
        )
        VALUES (
          v_record_id,
          'bank_statement',
          v_bank_statement_path,
          (regexp_split_to_array(v_bank_statement_path, '/'))[array_length(regexp_split_to_array(v_bank_statement_path, '/'), 1)],
          'approved',
          p_imported_by,
          p_imported_by,
          COALESCE(v_submitted_at, NOW())
        )
        ON CONFLICT DO NOTHING;
      END IF;
      
      -- Handle deposit payment if provided
      v_deposit_amount := NULLIF((v_row->>'deposit_amount')::NUMERIC, NULL);
      v_deposit_paid_date := NULLIF((v_row->>'deposit_paid_date')::DATE, NULL);
      
      IF v_deposit_amount IS NOT NULL AND v_deposit_amount > 0 THEN
        INSERT INTO public.manual_payments (
          application_id,
          amount,
          payment_date,
          payment_type,
          payment_method,
          notes,
          recorded_by
        )
        VALUES (
          v_record_id,
          v_deposit_amount,
          COALESCE(v_deposit_paid_date, v_submitted_at::DATE, CURRENT_DATE),
          'deposit',
          'bank_transfer', -- Default payment method for historical imports
          'Historical deposit payment (imported)',
          p_imported_by
        )
        ON CONFLICT DO NOTHING;
        
        -- Update application deposit_payment_intent_id
        UPDATE public.student_applications
        SET deposit_payment_intent_id = 'manual-' || v_record_id::TEXT
        WHERE id = v_record_id;
      END IF;
      
      -- Handle partner referral if provided
      v_referral_code := NULLIF(TRIM(v_row->>'referral_code'), '');
      
      IF v_referral_code IS NOT NULL THEN
        INSERT INTO public.partner_referrals (
          partner_id,
          application_id,
          referral_code,
          commission_percentage,
          created_at
        )
        SELECT
          p.id,
          v_record_id,
          v_referral_code,
          p.commission_percentage,
          COALESCE(v_submitted_at, NOW())
        FROM public.partners p
        WHERE p.referral_code = v_referral_code
        LIMIT 1
        ON CONFLICT DO NOTHING;
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
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.bulk_import_student_applications(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_by_email(TEXT) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.bulk_import_student_applications IS 
'Bulk import student applications with all steps, documents, and related data. 
Note: Users must be created via Edge Function Admin API before calling this function.';

