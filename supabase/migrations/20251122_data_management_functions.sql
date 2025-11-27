-- Data Management Functions for Development/Testing
-- Allows safe deletion of student applications and all related records

-- Function to delete a single application and all related records
CREATE OR REPLACE FUNCTION public.delete_student_application(
  p_application_id UUID
)
RETURNS TABLE(
  deleted_tables JSONB,
  total_deleted INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_deleted_tables JSONB := '{}'::JSONB;
  v_studio_id UUID;
BEGIN
  -- Disable RLS for this function to ensure we can access all records
  -- Using set_config with local=true ensures it only affects this transaction
  PERFORM set_config('row_security', 'off', true);
  
  -- Get the studio ID before deletion (for cleanup)
  SELECT assigned_studio_id INTO v_studio_id
  FROM public.student_applications
  WHERE id = p_application_id;
  
  -- If application doesn't exist, return empty result
  IF v_studio_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.student_applications WHERE id = p_application_id) THEN
    RETURN QUERY SELECT '{}'::JSONB, 0;
    RETURN;
  END IF;

  -- Delete related records (most have CASCADE, but we'll track them)
  -- Note: Due to CASCADE constraints, most will auto-delete, but we track for reporting
  
  -- Delete application steps
  DELETE FROM public.student_application_steps WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('student_application_steps', v_deleted_count);
  
  -- Delete documents (also need to delete from storage, but that's handled by trigger or app)
  DELETE FROM public.student_documents WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('student_documents', v_deleted_count);
  
  -- Delete signatures
  DELETE FROM public.student_signatures WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('student_signatures', v_deleted_count);
  
  -- Delete DocuSign envelopes
  DELETE FROM public.docusign_envelopes WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('docusign_envelopes', v_deleted_count);
  
  -- Delete Stripe payments
  DELETE FROM public.stripe_payments WHERE student_application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('stripe_payments', v_deleted_count);
  
  -- Delete manual payments
  DELETE FROM public.manual_payments WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('manual_payments', v_deleted_count);
  
  -- Delete partner referrals
  DELETE FROM public.partner_referrals WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('partner_referrals', v_deleted_count);
  
  -- Delete application cashbacks
  DELETE FROM public.application_cashbacks WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('application_cashbacks', v_deleted_count);
  
  -- Update refunds (set application_id to NULL)
  UPDATE public.refunds SET application_id = NULL WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('refunds_updated', v_deleted_count);
  
  -- Update any applications that reference this as previous_application_id
  UPDATE public.student_applications 
  SET previous_application_id = NULL 
  WHERE previous_application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('rebooking_references_updated', v_deleted_count);
  
  -- Free up the studio if it was assigned
  IF v_studio_id IS NOT NULL THEN
    UPDATE public.studios
    SET 
      status = 'available',
      allocation = NULL
    WHERE id = v_studio_id;
    v_deleted_tables := v_deleted_tables || jsonb_build_object('studio_freed', v_studio_id::TEXT);
  END IF;
  
  -- Finally, delete the application itself
  DELETE FROM public.student_applications WHERE id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('student_applications', v_deleted_count);
  
  -- Calculate total deleted
  -- Only sum numeric values, skip text values like 'studio_freed'
  SELECT SUM((value::TEXT)::INTEGER) INTO v_deleted_count
  FROM jsonb_each_text(v_deleted_tables)
  WHERE key != 'studio_freed' AND value ~ '^[0-9]+$';
  
  -- If sum is NULL (no numeric values), set to 0
  v_deleted_count := COALESCE(v_deleted_count, 0);
  
  RETURN QUERY SELECT v_deleted_tables, v_deleted_count;
END;
$$;

-- Function to delete all applications (for development/testing)
-- Drop existing function if it exists (to change return type)
DROP FUNCTION IF EXISTS public.delete_all_student_applications();

CREATE OR REPLACE FUNCTION public.delete_all_student_applications()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application_id UUID;
  v_total_deleted INTEGER := 0;
  v_details JSONB := '[]'::JSONB;
  v_result RECORD;
  v_deleted_tables JSONB;
  v_total_records INTEGER;
  v_total_applications INTEGER;
BEGIN
  -- Disable RLS for this function to ensure we can see all applications
  -- Note: SECURITY DEFINER should bypass RLS, but we explicitly disable it
  PERFORM set_config('row_security', 'off', true);
  
  -- Count total applications first (for debugging/feedback)
  -- Use explicit schema to avoid any issues
  SELECT COUNT(*) INTO v_total_applications 
  FROM public.student_applications;
  
  -- If no applications, return early with debug info
  IF v_total_applications = 0 THEN
    RETURN jsonb_build_object(
      'deleted_count', 0,
      'details', '[]'::JSONB,
      'message', 'No applications found to delete',
      'total_found', v_total_applications,
      'debug', jsonb_build_object(
        'row_security_disabled', current_setting('row_security', true),
        'query_executed', 'SELECT COUNT(*) FROM public.student_applications'
      )
    );
  END IF;
  
  -- Loop through all applications and delete them
  -- SECURITY DEFINER should allow us to see all rows
  FOR v_application_id IN 
    SELECT id 
    FROM public.student_applications
    ORDER BY created_at ASC
  LOOP
    BEGIN
      -- Call the delete function and get the result
      -- Use STRICT to ensure exactly one row is returned, otherwise raise exception
      SELECT deleted_tables, total_deleted INTO STRICT v_deleted_tables, v_total_records
      FROM public.delete_student_application(v_application_id);
      
      -- Verify we got valid results
      IF v_deleted_tables IS NULL OR v_total_records IS NULL THEN
        RAISE EXCEPTION 'Delete function returned NULL for application %', v_application_id;
      END IF;
      
      -- If we got here, deletion was successful
      v_total_deleted := v_total_deleted + 1;
      v_details := v_details || jsonb_build_object(
        'application_id', v_application_id,
        'deleted_tables', v_deleted_tables,
        'total_deleted', v_total_records,
        'success', true
      );
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        -- Function returned no rows
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', 'Delete function returned no rows - application may not exist or RLS blocked access',
          'error_code', 'P0002',
          'success', false
        );
        RAISE WARNING 'Delete function returned no rows for application %', v_application_id;
      WHEN TOO_MANY_ROWS THEN
        -- Function returned multiple rows (shouldn't happen)
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', 'Delete function returned multiple rows',
          'error_code', 'P0003',
          'success', false
        );
        RAISE WARNING 'Delete function returned multiple rows for application %', v_application_id;
      WHEN OTHERS THEN
        -- Log error but continue with next application
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', SQLERRM,
          'error_code', SQLSTATE,
          'success', false
        );
        -- Raise warning for logging
        RAISE WARNING 'Failed to delete application %: % (Code: %)', v_application_id, SQLERRM, SQLSTATE;
    END;
  END LOOP;
  
  -- Return as JSONB object instead of TABLE
  RETURN jsonb_build_object(
    'deleted_count', v_total_deleted,
    'details', v_details
  );
END;
$$;

-- Function to delete applications by academic year
-- Drop existing function if it exists (to change return type)
DROP FUNCTION IF EXISTS public.delete_student_applications_by_academic_year(UUID);

CREATE OR REPLACE FUNCTION public.delete_student_applications_by_academic_year(
  p_academic_year_id UUID
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
  v_result RECORD;
  v_deleted_tables JSONB;
  v_total_records INTEGER;
  v_total_applications INTEGER;
BEGIN
  -- Disable RLS for this function to ensure we can see all applications
  SET LOCAL row_security = off;
  
  -- Validate academic year exists
  IF NOT EXISTS (SELECT 1 FROM public.academic_years WHERE id = p_academic_year_id) THEN
    RAISE EXCEPTION 'Academic year with id % does not exist', p_academic_year_id;
  END IF;

  -- Count applications for this academic year
  SELECT COUNT(*) INTO v_total_applications
  FROM public.student_applications sa
  INNER JOIN public.contracts c ON sa.contract_id = c.id
  WHERE c.academic_year_id = p_academic_year_id;
  
  -- If no applications, return early
  IF v_total_applications = 0 THEN
    RETURN jsonb_build_object(
      'deleted_count', 0,
      'details', '[]'::JSONB,
      'message', format('No applications found for academic year %s to delete', p_academic_year_id),
      'total_found', v_total_applications
    );
  END IF;

  -- Loop through applications for the specified academic year
  FOR v_application_id IN 
    SELECT sa.id 
    FROM public.student_applications sa
    INNER JOIN public.contracts c ON sa.contract_id = c.id
    WHERE c.academic_year_id = p_academic_year_id
    ORDER BY sa.created_at ASC
  LOOP
    BEGIN
      -- Call the delete function and get the result
      -- Use STRICT to ensure exactly one row is returned, otherwise raise exception
      SELECT deleted_tables, total_deleted INTO STRICT v_deleted_tables, v_total_records
      FROM public.delete_student_application(v_application_id);
      
      -- Verify we got valid results
      IF v_deleted_tables IS NULL OR v_total_records IS NULL THEN
        RAISE EXCEPTION 'Delete function returned NULL for application %', v_application_id;
      END IF;
      
      -- If we got here, deletion was successful
      v_total_deleted := v_total_deleted + 1;
      v_details := v_details || jsonb_build_object(
        'application_id', v_application_id,
        'deleted_tables', v_deleted_tables,
        'total_deleted', v_total_records,
        'success', true
      );
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        -- Function returned no rows
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', 'Delete function returned no rows - application may not exist or RLS blocked access',
          'error_code', 'P0002',
          'success', false
        );
        RAISE WARNING 'Delete function returned no rows for application %', v_application_id;
      WHEN TOO_MANY_ROWS THEN
        -- Function returned multiple rows (shouldn't happen)
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', 'Delete function returned multiple rows',
          'error_code', 'P0003',
          'success', false
        );
        RAISE WARNING 'Delete function returned multiple rows for application %', v_application_id;
      WHEN OTHERS THEN
        -- Log error but continue with next application
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', SQLERRM,
          'error_code', SQLSTATE,
          'success', false
        );
        -- Raise warning for logging
        RAISE WARNING 'Failed to delete application %: % (Code: %)', v_application_id, SQLERRM, SQLSTATE;
    END;
  END LOOP;
  
  -- Return as JSONB object instead of TABLE
  RETURN jsonb_build_object(
    'deleted_count', v_total_deleted,
    'details', v_details
  );
END;
$$;

-- Grant execute permissions to authenticated users
-- The functions use SECURITY DEFINER and disable RLS internally
GRANT EXECUTE ON FUNCTION public.delete_student_application(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_all_student_applications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_student_applications_by_academic_year(UUID) TO authenticated;

-- Ensure the functions are owned by a superuser or postgres role
-- This is important for SECURITY DEFINER functions to bypass RLS properly
-- Note: In Supabase, functions created by migrations are typically owned by postgres

