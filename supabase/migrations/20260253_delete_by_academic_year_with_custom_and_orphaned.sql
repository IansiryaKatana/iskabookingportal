-- Delete by academic year: add optional flags for applications, custom contracts/plans, orphaned contracts/plans.
-- Staff can choose academic year and check what to delete. Default contracts (slug not starting with 'custom') are never deleted.

DROP FUNCTION IF EXISTS public.delete_student_applications_by_academic_year(UUID);

CREATE OR REPLACE FUNCTION public.delete_student_applications_by_academic_year(
  p_academic_year_id UUID,
  p_delete_applications BOOLEAN DEFAULT true,
  p_delete_custom_contracts_and_plans BOOLEAN DEFAULT false,
  p_delete_orphaned_contracts_and_plans BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application_id UUID;
  v_total_deleted INTEGER := 0;
  v_details JSONB := '[]'::JSONB;
  v_deleted_tables JSONB;
  v_total_records INTEGER;
  v_total_applications INTEGER;
  v_custom_contract_ids UUID[] := '{}';
  v_orphaned_contract_ids UUID[] := '{}';
  v_plan_ids UUID[] := '{}';
  v_cid UUID;
  v_custom_deleted INT := 0;
  v_orphaned_deleted INT := 0;
BEGIN
  SET LOCAL row_security = off;

  IF NOT EXISTS (SELECT 1 FROM public.academic_years WHERE id = p_academic_year_id) THEN
    RAISE EXCEPTION 'Academic year with id % does not exist', p_academic_year_id;
  END IF;

  -- 1. Delete applications for this academic year (and their payment records, steps, documents, etc.)
  IF p_delete_applications THEN
    SELECT COUNT(*) INTO v_total_applications
    FROM public.student_applications sa
    INNER JOIN public.contracts c ON sa.contract_id = c.id
    WHERE c.academic_year_id = p_academic_year_id;

    FOR v_application_id IN
      SELECT sa.id
      FROM public.student_applications sa
      INNER JOIN public.contracts c ON sa.contract_id = c.id
      WHERE c.academic_year_id = p_academic_year_id
      ORDER BY sa.created_at ASC
    LOOP
      BEGIN
        SELECT deleted_tables, total_deleted INTO STRICT v_deleted_tables, v_total_records
        FROM public.delete_student_application(v_application_id);
        v_total_deleted := v_total_deleted + 1;
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id, 'deleted_tables', v_deleted_tables, 'total_deleted', v_total_records, 'success', true
        );
      EXCEPTION WHEN OTHERS THEN
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id, 'error', SQLERRM, 'error_code', SQLSTATE, 'success', false
        );
        RAISE WARNING 'Failed to delete application %: %', v_application_id, SQLERRM;
      END;
    END LOOP;

    -- Studio cleanup after application deletions
    UPDATE public.studios
    SET allocation = NULL, reservation_expires_at = NULL,
        status = CASE WHEN status = 'reserved' THEN 'available' ELSE status END
    WHERE allocation IS NOT NULL
      AND allocation ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND allocation::UUID NOT IN (SELECT id FROM public.student_applications);

    UPDATE public.studios
    SET reservation_expires_at = NULL,
        status = CASE WHEN status = 'reserved' AND reservation_expires_at < NOW() THEN 'available' ELSE status END
    WHERE reservation_expires_at IS NOT NULL AND reservation_expires_at < NOW();

    UPDATE public.studios
    SET status = 'available', allocation = NULL, reservation_expires_at = NULL
    WHERE status = 'reserved' AND (allocation IS NULL OR allocation = '');
  END IF;

  -- 2. Delete custom contracts and their payment plans (slug starts with 'custom')
  IF p_delete_custom_contracts_and_plans THEN
    SELECT ARRAY_AGG(c.id) INTO v_custom_contract_ids
    FROM public.contracts c
    WHERE c.academic_year_id = p_academic_year_id
      AND c.slug LIKE 'custom%';

    v_custom_contract_ids := COALESCE(v_custom_contract_ids, '{}');

    IF array_length(v_custom_contract_ids, 1) > 0 THEN
      DELETE FROM public.contract_payment_schedule WHERE contract_id = ANY(v_custom_contract_ids);

      SELECT ARRAY_AGG(DISTINCT cpp.payment_plan_id) INTO v_plan_ids
      FROM public.contract_payment_plans cpp
      WHERE cpp.contract_id = ANY(v_custom_contract_ids);
      v_plan_ids := COALESCE(v_plan_ids, '{}');

      DELETE FROM public.contract_payment_plans WHERE contract_id = ANY(v_custom_contract_ids);
      IF array_length(v_plan_ids, 1) > 0 THEN
        DELETE FROM public.payment_plan_installments WHERE payment_plan_id = ANY(v_plan_ids);
        DELETE FROM public.payment_plans WHERE id = ANY(v_plan_ids);
      END IF;
      DELETE FROM public.contracts WHERE id = ANY(v_custom_contract_ids);
      GET DIAGNOSTICS v_custom_deleted = ROW_COUNT;
    END IF;
  END IF;

  -- 3. Delete orphaned contracts and their payment plans (no application points to them)
  IF p_delete_orphaned_contracts_and_plans THEN
    SELECT ARRAY_AGG(c.id) INTO v_orphaned_contract_ids
    FROM public.contracts c
    WHERE c.academic_year_id = p_academic_year_id
      AND NOT EXISTS (SELECT 1 FROM public.student_applications sa WHERE sa.contract_id = c.id);

    v_orphaned_contract_ids := COALESCE(v_orphaned_contract_ids, '{}');

    IF array_length(v_orphaned_contract_ids, 1) > 0 THEN
      DELETE FROM public.contract_payment_schedule WHERE contract_id = ANY(v_orphaned_contract_ids);

      SELECT ARRAY_AGG(DISTINCT cpp.payment_plan_id) INTO v_plan_ids
      FROM public.contract_payment_plans cpp
      WHERE cpp.contract_id = ANY(v_orphaned_contract_ids);
      v_plan_ids := COALESCE(v_plan_ids, '{}');

      DELETE FROM public.contract_payment_plans WHERE contract_id = ANY(v_orphaned_contract_ids);
      IF array_length(v_plan_ids, 1) > 0 THEN
        DELETE FROM public.payment_plan_installments WHERE payment_plan_id = ANY(v_plan_ids);
        DELETE FROM public.payment_plans WHERE id = ANY(v_plan_ids);
      END IF;
      DELETE FROM public.contracts WHERE id = ANY(v_orphaned_contract_ids);
      GET DIAGNOSTICS v_orphaned_deleted = ROW_COUNT;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'deleted_count', v_total_deleted,
    'custom_contracts_deleted', v_custom_deleted,
    'orphaned_contracts_deleted', v_orphaned_deleted,
    'details', v_details,
    'cleanup_performed', true,
    'message', format(
      'Deleted %s application(s). Custom contracts removed: %s. Orphaned contracts removed: %s.',
      v_total_deleted, v_custom_deleted, v_orphaned_deleted
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_student_applications_by_academic_year(UUID, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.delete_student_applications_by_academic_year(UUID, BOOLEAN, BOOLEAN, BOOLEAN) IS
'Delete by academic year with options: applications (and related records), custom contracts/plans (slug like custom%), orphaned contracts/plans. Default contracts are never deleted.';