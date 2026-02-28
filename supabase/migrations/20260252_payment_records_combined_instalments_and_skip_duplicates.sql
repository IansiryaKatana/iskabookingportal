-- Payment records import: combined instalment sequences (e.g. "4 & 5"), proportional split by schedule, and skip already-imported rows on re-upload.

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
  v_payment_method_ok TEXT;
  v_seq_str TEXT;
  v_sequences INT[] := '{}';
  v_part TEXT;
  v_single_int INT;
  v_schedule_rec RECORD;
  v_total_due NUMERIC := 0;
  v_allocated NUMERIC;
  v_sum_allocated NUMERIC := 0;
  v_skip_count INT := 0;
  v_inserted_count INT := 0;
  v_payment_type_ok TEXT;
  v_is_duplicate BOOLEAN;
  v_schedule_count INT := 0;
  v_current INT := 0;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    v_record_id := NULL;
    v_application_id := NULL;
    v_instalment_id := NULL;
    v_sequences := '{}';
    v_skip_count := 0;
    v_inserted_count := 0;

    BEGIN
      -- Resolve application: by application_id or by student_email + academic_year_name
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

      -- Get contract_id for schedule lookup
      SELECT contract_id INTO v_contract_id FROM public.student_applications WHERE id = v_application_id;

      -- Amount and date
      v_amount := (v_row->>'amount')::NUMERIC(10,2);
      IF v_amount IS NULL OR v_amount <= 0 THEN
        RAISE EXCEPTION 'amount must be a positive number';
      END IF;

      v_payment_date := (v_row->>'payment_date')::DATE;
      IF v_payment_date IS NULL THEN
        RAISE EXCEPTION 'payment_date is required (YYYY-MM-DD)';
      END IF;

      -- payment_type: default to instalment when missing (CSV often omits it)
      v_payment_type_ok := NULLIF(LOWER(TRIM((v_row->>'payment_type')::TEXT)), '');
      IF v_payment_type_ok IS NULL THEN
        v_payment_type_ok := 'instalment';
      END IF;
      IF v_payment_type_ok NOT IN ('instalment', 'installment') THEN
        RAISE EXCEPTION 'payment_type must be instalment (deposits are imported with applications)';
      END IF;

      -- payment_method
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

      -- Parse instalment_sequence: single integer or "2&3", "4 & 5", "6 & 7" etc.
      v_seq_str := NULLIF(TRIM((v_row->>'instalment_sequence')::TEXT), '');
      IF v_seq_str IS NOT NULL THEN
        IF v_seq_str ~ '^\d+$' THEN
          v_single_int := v_seq_str::INT;
          IF v_single_int > 0 THEN
            v_sequences := ARRAY[v_single_int];
          END IF;
        ELSE
          -- Split by & and collect integers (e.g. "2&3", "4 & 5", "6 & 7")
          FOR v_part IN SELECT trim(s) FROM unnest(regexp_split_to_array(v_seq_str, '\s*&\s*')) AS s
          LOOP
            IF v_part ~ '^\d+$' AND v_part <> '' THEN
              v_sequences := array_append(v_sequences, v_part::INT);
            END IF;
          END LOOP;
        END IF;
      END IF;

      -- Single instalment (one sequence or none)
      IF array_length(v_sequences, 1) IS NULL OR array_length(v_sequences, 1) <= 1 THEN
        IF array_length(v_sequences, 1) = 1 THEN
          SELECT cps.id INTO v_instalment_id
          FROM public.student_applications sa
          INNER JOIN public.contract_payment_schedule cps ON cps.contract_id = sa.contract_id
          WHERE sa.id = v_application_id
            AND cps.sequence = v_sequences[1]
          LIMIT 1;
        END IF;

        -- Skip if duplicate: same application, instalment_id, amount, date
        SELECT EXISTS (
          SELECT 1 FROM public.manual_payments
          WHERE application_id = v_application_id
            AND (instalment_id IS NOT DISTINCT FROM v_instalment_id)
            AND amount = v_amount
            AND payment_date = v_payment_date
            AND payment_type = 'instalment'
        ) INTO v_is_duplicate;

        IF v_is_duplicate THEN
          RETURN QUERY SELECT v_row_num, 'success'::TEXT, NULL::UUID, 'skipped - duplicate'::TEXT;
        ELSE
          INSERT INTO public.manual_payments (
            application_id, amount, payment_date, payment_type, payment_method, notes, recorded_by, instalment_id
          )
          VALUES (
            v_application_id, v_amount, v_payment_date, 'instalment', v_payment_method_ok, v_notes, p_imported_by, v_instalment_id
          )
          RETURNING id INTO v_record_id;
          RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
        END IF;
        CONTINUE;
      END IF;

      -- Combined instalments: proportional split by schedule (or equal if no schedule)
      v_total_due := 0;
      SELECT count(*) INTO v_schedule_count
        FROM public.contract_payment_schedule cps
        WHERE cps.contract_id = v_contract_id AND cps.sequence = ANY(v_sequences);
      FOR v_schedule_rec IN
        SELECT cps.id AS cps_id, cps.sequence AS seq, cps.amount AS due_amt
        FROM public.contract_payment_schedule cps
        WHERE cps.contract_id = v_contract_id
          AND cps.sequence = ANY(v_sequences)
        ORDER BY cps.sequence
      LOOP
        v_total_due := v_total_due + COALESCE(v_schedule_rec.due_amt, 0);
      END LOOP;

      -- Allocate amounts and insert (or skip duplicates)
      IF v_total_due > 0 AND v_schedule_count > 0 THEN
        -- Proportional split by schedule
        v_current := 0;
        v_sum_allocated := 0;
        FOR v_schedule_rec IN
          SELECT cps.id AS cps_id, cps.sequence AS seq, cps.amount AS due_amt
          FROM public.contract_payment_schedule cps
          WHERE cps.contract_id = v_contract_id
            AND cps.sequence = ANY(v_sequences)
          ORDER BY cps.sequence
        LOOP
          v_current := v_current + 1;
          IF v_current = v_schedule_count THEN
            v_allocated := v_amount - v_sum_allocated;
          ELSE
            v_allocated := ROUND((COALESCE(v_schedule_rec.due_amt, 0) / v_total_due) * v_amount, 2);
            v_sum_allocated := v_sum_allocated + v_allocated;
          END IF;
          IF v_allocated <= 0 THEN
            CONTINUE;
          END IF;

          SELECT EXISTS (
            SELECT 1 FROM public.manual_payments
            WHERE application_id = v_application_id
              AND instalment_id = v_schedule_rec.cps_id
              AND amount = v_allocated
              AND payment_date = v_payment_date
              AND payment_type = 'instalment'
          ) INTO v_is_duplicate;

          IF v_is_duplicate THEN
            v_skip_count := v_skip_count + 1;
          ELSE
            INSERT INTO public.manual_payments (
              application_id, amount, payment_date, payment_type, payment_method, notes, recorded_by, instalment_id
            )
            VALUES (
              v_application_id,
              v_allocated,
              v_payment_date,
              'instalment',
              v_payment_method_ok,
              v_notes || ' (instalments ' || array_to_string(v_sequences, ' & ') || ')',
              p_imported_by,
              v_schedule_rec.cps_id
            );
            v_inserted_count := v_inserted_count + 1;
          END IF;
        END LOOP;
      ELSIF v_schedule_count > 0 THEN
        -- Schedule exists but total_due is 0: equal split across schedule rows
        v_current := 0;
        v_allocated := ROUND(v_amount / v_schedule_count, 2);
        FOR v_schedule_rec IN
          SELECT cps.id AS cps_id, cps.sequence AS seq
          FROM public.contract_payment_schedule cps
          WHERE cps.contract_id = v_contract_id
            AND cps.sequence = ANY(v_sequences)
          ORDER BY cps.sequence
        LOOP
          v_current := v_current + 1;
          IF v_current = v_schedule_count THEN
            v_allocated := v_amount - (v_allocated * (v_schedule_count - 1));
          END IF;
          IF v_allocated <= 0 THEN
            CONTINUE;
          END IF;

          SELECT EXISTS (
            SELECT 1 FROM public.manual_payments
            WHERE application_id = v_application_id
              AND instalment_id = v_schedule_rec.cps_id
              AND amount = v_allocated
              AND payment_date = v_payment_date
              AND payment_type = 'instalment'
          ) INTO v_is_duplicate;

          IF v_is_duplicate THEN
            v_skip_count := v_skip_count + 1;
          ELSE
            INSERT INTO public.manual_payments (
              application_id, amount, payment_date, payment_type, payment_method, notes, recorded_by, instalment_id
            )
            VALUES (
              v_application_id,
              v_allocated,
              v_payment_date,
              'instalment',
              v_payment_method_ok,
              v_notes || ' (instalments ' || array_to_string(v_sequences, ' & ') || ')',
              p_imported_by,
              v_schedule_rec.cps_id
            );
            v_inserted_count := v_inserted_count + 1;
          END IF;
        END LOOP;
      ELSE
        -- No schedule rows for these sequences: insert one unlinked payment (fallback)
        IF TRUE THEN
          SELECT EXISTS (
            SELECT 1 FROM public.manual_payments
            WHERE application_id = v_application_id
              AND instalment_id IS NULL
              AND amount = v_amount
              AND payment_date = v_payment_date
              AND payment_type = 'instalment'
          ) INTO v_is_duplicate;
          IF NOT v_is_duplicate THEN
            INSERT INTO public.manual_payments (
              application_id, amount, payment_date, payment_type, payment_method, notes, recorded_by, instalment_id
            )
            VALUES (
              v_application_id, v_amount, v_payment_date, 'instalment', v_payment_method_ok,
              v_notes || ' (instalments ' || array_to_string(v_sequences, ' & ') || ' - no schedule)',
              p_imported_by, NULL
            );
            v_inserted_count := v_inserted_count + 1;
          END IF;
        END IF;
      END IF;

      IF v_skip_count > 0 AND v_inserted_count = 0 THEN
        RETURN QUERY SELECT v_row_num, 'success'::TEXT, NULL::UUID, ('skipped - duplicate (' || v_skip_count || ')'::TEXT)::TEXT;
      ELSIF v_skip_count > 0 THEN
        RETURN QUERY SELECT v_row_num, 'success'::TEXT, NULL::UUID, ('partial - ' || v_skip_count || ' skipped as duplicate'::TEXT)::TEXT;
      ELSE
        RETURN QUERY SELECT v_row_num, 'success'::TEXT, NULL::UUID, NULL::TEXT;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_import_payment_records(JSONB, UUID) TO authenticated;

COMMENT ON FUNCTION public.bulk_import_payment_records(JSONB, UUID) IS
'Bulk import manual payment records (installments only). Supports single instalment_sequence (e.g. 1) or combined (e.g. "2&3", "4 & 5") with proportional split by contract schedule. Skips rows that would duplicate an existing payment (same application, instalment_id, amount, payment_date). Use after applications exist. Default payment_type to instalment when omitted.';