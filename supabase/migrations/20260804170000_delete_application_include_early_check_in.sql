-- Fix application deletion blocked by early_check_ins / early_check_in_payments
-- (both use ON DELETE RESTRICT against student_applications).

CREATE OR REPLACE FUNCTION public.delete_student_application(
  p_application_id UUID
)
RETURNS TABLE(deleted_tables JSONB, total_deleted INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted_count INTEGER := 0;
  v_deleted_tables JSONB := '{}'::JSONB;
  v_studio_id UUID;
  v_exists BOOLEAN;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  SELECT assigned_studio_id, TRUE
  INTO v_studio_id, v_exists
  FROM public.student_applications
  WHERE id = p_application_id;

  IF NOT COALESCE(v_exists, FALSE) THEN
    RETURN QUERY SELECT '{}'::JSONB, 0;
    RETURN;
  END IF;

  -- Early check-in payments first (RESTRICT on application_id and early_check_in_id)
  DELETE FROM public.early_check_in_payments WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('early_check_in_payments', v_deleted_count);

  -- Early check-ins (RESTRICT on application_id)
  DELETE FROM public.early_check_ins WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('early_check_ins', v_deleted_count);

  DELETE FROM public.student_application_steps WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('student_application_steps', v_deleted_count);

  DELETE FROM public.student_documents WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('student_documents', v_deleted_count);

  DELETE FROM public.student_signatures WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('student_signatures', v_deleted_count);

  DELETE FROM public.docusign_envelopes WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('docusign_envelopes', v_deleted_count);

  DELETE FROM public.stripe_payments WHERE student_application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('stripe_payments', v_deleted_count);

  DELETE FROM public.manual_payments WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('manual_payments', v_deleted_count);

  DELETE FROM public.partner_referrals WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('partner_referrals', v_deleted_count);

  DELETE FROM public.application_cashbacks WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('application_cashbacks', v_deleted_count);

  UPDATE public.refunds SET application_id = NULL WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('refunds_updated', v_deleted_count);

  UPDATE public.student_applications
  SET previous_application_id = NULL
  WHERE previous_application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('rebooking_references_updated', v_deleted_count);

  UPDATE public.student_applications
  SET extension_of_application_id = NULL
  WHERE extension_of_application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('extension_references_updated', v_deleted_count);

  IF v_studio_id IS NOT NULL THEN
    UPDATE public.studios
    SET
      status = 'available',
      allocation = NULL,
      reservation_expires_at = NULL
    WHERE id = v_studio_id;
    v_deleted_tables := v_deleted_tables || jsonb_build_object('studio_freed', v_studio_id::TEXT);
  END IF;

  DELETE FROM public.student_applications WHERE id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('student_applications', v_deleted_count);

  SELECT SUM((value::TEXT)::INTEGER) INTO v_deleted_count
  FROM jsonb_each_text(v_deleted_tables)
  WHERE key != 'studio_freed' AND value ~ '^[0-9]+$';

  v_deleted_count := COALESCE(v_deleted_count, 0);

  RETURN QUERY SELECT v_deleted_tables, v_deleted_count;
END;
$function$;

COMMENT ON FUNCTION public.delete_student_application(UUID) IS
  'Deletes a student application and related records, including early check-in rows that otherwise RESTRICT deletion.';

GRANT EXECUTE ON FUNCTION public.delete_student_application(UUID) TO authenticated;
