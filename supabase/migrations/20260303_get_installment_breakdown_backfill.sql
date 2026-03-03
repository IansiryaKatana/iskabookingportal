-- Backfill instalment_id for historical bulk-imported instalment payments
-- that were created with instalment_id = NULL because no schedule rows existed
-- at import time (notes contain "instalments X & Y - no schedule").
--
-- This migration is idempotent and only affects rows matching that pattern.

DO $$
DECLARE
  mp_rec RECORD;
  v_contract_id UUID;
  v_sequences INT[] := '{}';
  v_seq_str TEXT;
  v_part TEXT;
  v_total_due NUMERIC := 0;
  v_schedule_count INT := 0;
  v_schedule_rec RECORD;
  v_allocated NUMERIC;
  v_sum_allocated NUMERIC;
  v_current INT;
  v_is_duplicate BOOLEAN;
BEGIN
  FOR mp_rec IN
    SELECT *
    FROM public.manual_payments
    WHERE payment_type = 'instalment'
      AND instalment_id IS NULL
      AND application_id IS NOT NULL
      AND notes LIKE '%(instalments % - no schedule)%'
  LOOP
    v_sequences := '{}';
    v_seq_str := substring(mp_rec.notes from 'instalments ([^)]*) - no schedule');

    IF v_seq_str IS NULL OR btrim(v_seq_str) = '' THEN
      CONTINUE;
    END IF;

    FOR v_part IN
      SELECT btrim(s)
      FROM unnest(regexp_split_to_array(v_seq_str, '\s*&\s*')) AS s
    LOOP
      IF v_part ~ '^\d+$' THEN
        v_sequences := array_append(v_sequences, v_part::INT);
      END IF;
    END LOOP;

    IF array_length(v_sequences, 1) IS NULL OR array_length(v_sequences, 1) = 0 THEN
      CONTINUE;
    END IF;

    SELECT contract_id INTO v_contract_id
    FROM public.student_applications
    WHERE id = mp_rec.application_id;

    IF v_contract_id IS NULL THEN
      CONTINUE;
    END IF;

    v_total_due := 0;
    v_schedule_count := 0;

    SELECT COUNT(*)
    INTO v_schedule_count
    FROM public.contract_payment_schedule cps
    WHERE cps.contract_id = v_contract_id
      AND cps.sequence = ANY(v_sequences);

    IF v_schedule_count <= 0 THEN
      -- Still no schedule rows; leave this payment unlinked
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(cps.amount), 0)
    INTO v_total_due
    FROM public.contract_payment_schedule cps
    WHERE cps.contract_id = v_contract_id
      AND cps.sequence = ANY(v_sequences);

    v_current := 0;
    v_sum_allocated := 0;

    IF v_total_due > 0 THEN
      -- Proportional split by schedule (mirrors bulk_import_payment_records)
      FOR v_schedule_rec IN
        SELECT cps.id AS cps_id, cps.sequence AS seq, cps.amount AS due_amt
        FROM public.contract_payment_schedule cps
        WHERE cps.contract_id = v_contract_id
          AND cps.sequence = ANY(v_sequences)
        ORDER BY cps.sequence
      LOOP
        v_current := v_current + 1;
        IF v_current = v_schedule_count THEN
          v_allocated := mp_rec.amount - v_sum_allocated;
        ELSE
          v_allocated := ROUND((COALESCE(v_schedule_rec.due_amt, 0) / v_total_due) * mp_rec.amount, 2);
          v_sum_allocated := v_sum_allocated + v_allocated;
        END IF;

        IF v_allocated <= 0 THEN
          CONTINUE;
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.manual_payments
          WHERE application_id = mp_rec.application_id
            AND instalment_id = v_schedule_rec.cps_id
            AND amount = v_allocated
            AND payment_date = mp_rec.payment_date
            AND payment_type = 'instalment'
        )
        INTO v_is_duplicate;

        IF v_is_duplicate THEN
          CONTINUE;
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
          mp_rec.application_id,
          v_allocated,
          mp_rec.payment_date,
          'instalment',
          mp_rec.payment_method,
          mp_rec.notes || ' (backfilled)',
          mp_rec.recorded_by,
          v_schedule_rec.cps_id
        );
      END LOOP;
    ELSE
      -- Equal split across schedule rows when total_due is 0 (mirrors import fallback)
      v_current := 0;
      v_allocated := ROUND(mp_rec.amount / v_schedule_count, 2);

      FOR v_schedule_rec IN
        SELECT cps.id AS cps_id, cps.sequence AS seq
        FROM public.contract_payment_schedule cps
        WHERE cps.contract_id = v_contract_id
          AND cps.sequence = ANY(v_sequences)
        ORDER BY cps.sequence
      LOOP
        v_current := v_current + 1;
        IF v_current = v_schedule_count THEN
          v_allocated := mp_rec.amount - (v_allocated * (v_schedule_count - 1));
        END IF;

        IF v_allocated <= 0 THEN
          CONTINUE;
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.manual_payments
          WHERE application_id = mp_rec.application_id
            AND instalment_id = v_schedule_rec.cps_id
            AND amount = v_allocated
            AND payment_date = mp_rec.payment_date
            AND payment_type = 'instalment'
        )
        INTO v_is_duplicate;

        IF v_is_duplicate THEN
          CONTINUE;
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
          mp_rec.application_id,
          v_allocated,
          mp_rec.payment_date,
          'instalment',
          mp_rec.payment_method,
          mp_rec.notes || ' (backfilled)',
          mp_rec.recorded_by,
          v_schedule_rec.cps_id
        );
      END LOOP;
    END IF;

    -- Remove original unlinked payment after successful backfill
    DELETE FROM public.manual_payments
    WHERE id = mp_rec.id;
  END LOOP;
END;
$$;

