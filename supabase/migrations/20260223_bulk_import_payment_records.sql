-- Bulk Import Payment Records (installments and other manual payments)
-- Use after applications are imported. Does not create deposits (use application import for that).
-- Resolves application by application_id or by student_email + academic_year_name.

CREATE OR REPLACE FUNCTION public.bulk_import_payment_records(
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
  v_application_id UUID;
  v_student_id UUID;
  v_email TEXT;
  v_academic_year_name TEXT;
  v_amount NUMERIC(10,2);
  v_payment_date DATE;
  v_payment_method TEXT;
  v_notes TEXT;
  v_instalment_id UUID;
  v_contract_id UUID;
  v_instalment_sequence INT;
  v_payment_method_ok TEXT;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    v_record_id := NULL;
    v_application_id := NULL;
    v_instalment_id := NULL;

    BEGIN
      -- Resolve application: by application_id (UUID) or by student_email + academic_year_name
      IF (v_row->>'application_id') IS NOT NULL AND (v_row->>'application_id')::TEXT <> '' THEN
        v_application_id := (v_row->>'application_id')::UUID;
        IF NOT EXISTS (SELECT 1 FROM public.student_applications WHERE id = v_application_id) THEN
          RAISE EXCEPTION 'Application not found for application_id %', v_application_id;
        END IF;
      ELSE
        v_email := NULLIF(LOWER(TRIM((v_row->>'student_email')::TEXT)), '');
        v_academic_year_name := NULLIF(TRIM((v_row->>'academic_year_name')::TEXT), '');
        IF v_email IS NULL OR v_academic_year_name IS NULL THEN
          RAISE EXCEPTION 'Either application_id or both student_email and academic_year_name are required';
        END IF;

        SELECT id INTO v_student_id FROM auth.users WHERE LOWER(email) = v_email LIMIT 1;
        IF v_student_id IS NULL THEN
          RAISE EXCEPTION 'No user found with email %', v_email;
        END IF;

        SELECT sa.id INTO v_application_id
        FROM public.student_applications sa
        INNER JOIN public.contracts c ON c.id = sa.contract_id
        INNER JOIN public.academic_years ay ON ay.id = c.academic_year_id
        WHERE sa.student_id = v_student_id
          AND ay.name = v_academic_year_name
        ORDER BY sa.created_at DESC
        LIMIT 1;

        IF v_application_id IS NULL THEN
          RAISE EXCEPTION 'No application found for email % and academic year %', v_email, v_academic_year_name;
        END IF;
      END IF;

      -- Amount and date
      v_amount := (v_row->>'amount')::NUMERIC(10,2);
      IF v_amount IS NULL OR v_amount <= 0 THEN
        RAISE EXCEPTION 'amount must be a positive number';
      END IF;

      v_payment_date := (v_row->>'payment_date')::DATE;
      IF v_payment_date IS NULL THEN
        RAISE EXCEPTION 'payment_date is required (YYYY-MM-DD)';
      END IF;

      -- payment_type: only 'instalment' allowed in this import (deposits are in application import)
      IF NULLIF(LOWER(TRIM((v_row->>'payment_type')::TEXT)), '') NOT IN ('instalment', 'installment') THEN
        RAISE EXCEPTION 'payment_type must be instalment (deposits are imported with applications)';
      END IF;

      -- payment_method: must be one of cash, card, bank_transfer, cheque
      v_payment_method := NULLIF(LOWER(TRIM((v_row->>'payment_method')::TEXT)), '');
      IF v_payment_method IS NULL THEN
        v_payment_method := 'bank_transfer';
      END IF;
      v_payment_method_ok := CASE v_payment_method
        WHEN 'cash' THEN 'cash'
        WHEN 'card' THEN 'card'
        WHEN 'bank_transfer' THEN 'bank_transfer'
        WHEN 'cheque' THEN 'cheque'
        ELSE NULL
      END;
      IF v_payment_method_ok IS NULL THEN
        RAISE EXCEPTION 'payment_method must be one of: cash, card, bank_transfer, cheque';
      END IF;

      v_notes := NULLIF(TRIM((v_row->>'notes')::TEXT), '');
      IF v_notes IS NULL THEN
        v_notes := 'Historical payment (imported)';
      END IF;

      -- Optional: link to contract_payment_schedule by instalment sequence (1-based)
      v_instalment_sequence := (v_row->>'instalment_sequence')::INT;
      IF v_instalment_sequence IS NOT NULL AND v_instalment_sequence > 0 THEN
        SELECT cps.id, sa.contract_id INTO v_instalment_id, v_contract_id
        FROM public.student_applications sa
        INNER JOIN public.contract_payment_schedule cps ON cps.contract_id = sa.contract_id
        WHERE sa.id = v_application_id
          AND cps.sequence = v_instalment_sequence
        LIMIT 1;
        -- If not found, we still insert the payment without instalment_id (allowed)
      END IF;

      INSERT INTO public.manual_payments (
        application_id,
        amount,
        payment_date,
        payment_type,
        payment_method,
        notes,
        recorded_by,
        instalment_id
      )
      VALUES (
        v_application_id,
        v_amount,
        v_payment_date,
        'instalment',
        v_payment_method_ok,
        v_notes,
        p_imported_by,
        v_instalment_id
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

GRANT EXECUTE ON FUNCTION public.bulk_import_payment_records(JSONB, UUID) TO authenticated;

COMMENT ON FUNCTION public.bulk_import_payment_records(JSONB, UUID) IS
'Bulk import manual payment records (installments only). Use after applications exist. Resolve application by application_id or by student_email + academic_year_name. Deposits are not created here (use application bulk import).';
