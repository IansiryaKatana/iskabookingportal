-- Copy journey steps 1-5 and documents from a source application to a new rebooker/extension.
-- Step 5 is sanitized (deposit_paid reset, plan aligned to target). Step 6 is not copied.

CREATE OR REPLACE FUNCTION public.copy_application_journey_from_source(
  p_target_application_id UUID,
  p_source_application_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_target_plan_id UUID;
  v_step RECORD;
  v_step5_payload JSONB;
BEGIN
  IF p_target_application_id IS NULL OR p_source_application_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_target_application_id = p_source_application_id THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.student_applications WHERE id = p_target_application_id
  ) THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.student_applications WHERE id = p_source_application_id
  ) THEN
    RETURN FALSE;
  END IF;

  -- Do not overwrite steps already saved on the target application.
  IF EXISTS (
    SELECT 1
    FROM public.student_application_steps
    WHERE application_id = p_target_application_id
  ) THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.student_application_steps
    WHERE application_id = p_source_application_id
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT selected_payment_plan_id
  INTO v_target_plan_id
  FROM public.student_applications
  WHERE id = p_target_application_id;

  FOR v_step IN
    SELECT step_number, payload
    FROM public.student_application_steps
    WHERE application_id = p_source_application_id
      AND step_number BETWEEN 1 AND 5
    ORDER BY step_number
  LOOP
    IF v_step.step_number = 5 THEN
      v_step5_payload := COALESCE(v_step.payload, '{}'::jsonb);
      v_step5_payload := v_step5_payload - 'rebooking_section_confirmed';
      v_step5_payload := v_step5_payload || jsonb_build_object('deposit_paid', false);

      IF v_target_plan_id IS NOT NULL THEN
        v_step5_payload := v_step5_payload || jsonb_build_object(
          'selected_plan_id', v_target_plan_id::text
        );
      ELSE
        v_step5_payload := v_step5_payload - 'selected_plan_id';
      END IF;

      INSERT INTO public.student_application_steps (
        application_id, step_number, payload, is_complete
      )
      VALUES (
        p_target_application_id, 5, v_step5_payload, TRUE
      )
      ON CONFLICT (application_id, step_number) DO UPDATE
      SET payload = EXCLUDED.payload,
          is_complete = EXCLUDED.is_complete,
          updated_at = NOW();
    ELSE
      INSERT INTO public.student_application_steps (
        application_id, step_number, payload, is_complete
      )
      VALUES (
        p_target_application_id,
        v_step.step_number,
        COALESCE(v_step.payload, '{}'::jsonb),
        TRUE
      )
      ON CONFLICT (application_id, step_number) DO UPDATE
      SET payload = EXCLUDED.payload,
          is_complete = EXCLUDED.is_complete,
          updated_at = NOW();
    END IF;
  END LOOP;

  INSERT INTO public.student_documents (
    application_id,
    document_type,
    storage_path,
    original_filename,
    mime_type,
    status,
    uploaded_by,
    uploaded_at,
    verified_by,
    verified_at,
    notes
  )
  SELECT
    p_target_application_id,
    sd.document_type,
    sd.storage_path,
    sd.original_filename,
    sd.mime_type,
    sd.status,
    sd.uploaded_by,
    sd.uploaded_at,
    sd.verified_by,
    sd.verified_at,
    sd.notes
  FROM public.student_documents sd
  WHERE sd.application_id = p_source_application_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.student_documents existing
      WHERE existing.application_id = p_target_application_id
        AND existing.document_type = sd.document_type
    );

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.copy_application_journey_from_source(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.copy_application_journey_from_source IS
  'Copies steps 1-5 and documents from a source application to a rebooker/extension. Sanitizes payment fields on step 5.';

-- Backfill linked rebookers/extensions that have no steps on the target application.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      sa.id AS target_id,
      COALESCE(sa.extension_of_application_id, sa.previous_application_id) AS source_id
    FROM public.student_applications sa
    WHERE COALESCE(sa.extension_of_application_id, sa.previous_application_id) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.student_application_steps s
        WHERE s.application_id = sa.id
      )
  LOOP
    PERFORM public.copy_application_journey_from_source(r.target_id, r.source_id);
  END LOOP;
END;
$$;
