-- Smart Deletion Feature
-- Enhances delete_all_student_applications and delete_student_applications_by_academic_year
-- to optionally delete orphaned user accounts with intelligent safety checks

-- Drop and recreate delete_all_student_applications with smart deletion parameter
DROP FUNCTION IF EXISTS public.delete_all_student_applications();

CREATE OR REPLACE FUNCTION public.delete_all_student_applications(
  p_delete_orphaned_users BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application_id UUID;
  v_student_id UUID;
  v_total_deleted INTEGER := 0;
  v_users_deleted INTEGER := 0;
  v_users_preserved INTEGER := 0;
  v_details JSONB := '[]'::JSONB;
  v_user_details JSONB := '[]'::JSONB;
  v_result RECORD;
  v_deleted_tables JSONB;
  v_total_records INTEGER;
  v_total_applications INTEGER;
  v_user_role TEXT;
  v_has_remaining_apps BOOLEAN;
  v_has_refunds BOOLEAN;
  v_has_maintenance BOOLEAN;
  v_has_utility_payments BOOLEAN;
  v_has_activity_logs BOOLEAN;
  v_should_preserve BOOLEAN;
  v_preservation_reason TEXT;
  v_deleted_user_ids UUID[] := '{}';
  v_preserved_user_ids UUID[] := '{}';
  v_student_ids_from_apps UUID[] := '{}';
BEGIN
  -- Disable RLS for this function
  PERFORM set_config('row_security', 'off', true);
  
  -- Count total applications first
  SELECT COUNT(*) INTO v_total_applications 
  FROM public.student_applications;
  
  IF v_total_applications = 0 THEN
    RETURN jsonb_build_object(
      'deleted_count', 0,
      'users_deleted', 0,
      'users_preserved', 0,
      'details', '[]'::JSONB,
      'user_details', '[]'::JSONB,
      'message', 'No applications found to delete'
    );
  END IF;
  
  -- Step 1: Delete all applications and collect student_ids
  FOR v_application_id IN 
    SELECT id 
    FROM public.student_applications
    ORDER BY created_at ASC
  LOOP
    BEGIN
      -- Get student_id before deletion
      SELECT student_id INTO v_student_id
      FROM public.student_applications
      WHERE id = v_application_id;
      
      -- Add to collection if not already present
      IF v_student_id IS NOT NULL AND NOT (v_student_id = ANY(v_student_ids_from_apps)) THEN
        v_student_ids_from_apps := v_student_ids_from_apps || v_student_id;
      END IF;
      
      -- Call the delete function
      SELECT deleted_tables, total_deleted INTO STRICT v_deleted_tables, v_total_records
      FROM public.delete_student_application(v_application_id);
      
      v_total_deleted := v_total_deleted + 1;
      v_details := v_details || jsonb_build_object(
        'application_id', v_application_id,
        'student_id', v_student_id,
        'deleted_tables', v_deleted_tables,
        'total_deleted', v_total_records,
        'success', true
      );
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', 'Delete function returned no rows - application may not exist or RLS blocked access',
          'error_code', 'P0002',
          'success', false
        );
        RAISE WARNING 'Delete function returned no rows for application %', v_application_id;
      WHEN TOO_MANY_ROWS THEN
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', 'Delete function returned multiple rows',
          'error_code', 'P0003',
          'success', false
        );
        RAISE WARNING 'Delete function returned multiple rows for application %', v_application_id;
      WHEN OTHERS THEN
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', SQLERRM,
          'error_code', SQLSTATE,
          'success', false
        );
        RAISE WARNING 'Failed to delete application %: % (Code: %)', v_application_id, SQLERRM, SQLSTATE;
    END;
  END LOOP;
  
  -- Step 2: Smart User Deletion (if enabled)
  IF p_delete_orphaned_users THEN
    -- Process each unique student_id
    FOREACH v_student_id IN ARRAY v_student_ids_from_apps
    LOOP
      -- Skip if already processed
      IF v_student_id = ANY(v_deleted_user_ids) OR v_student_id = ANY(v_preserved_user_ids) THEN
        CONTINUE;
      END IF;
      
      -- Initialize preservation check
      v_should_preserve := false;
      v_preservation_reason := '';
      v_user_role := NULL;
      v_has_remaining_apps := false;
      v_has_refunds := false;
      v_has_maintenance := false;
      v_has_utility_payments := false;
      v_has_activity_logs := false;
      
      -- Rule 1: Check if user is staff/superadmin
      SELECT role INTO v_user_role
      FROM public.profiles
      WHERE id = v_student_id;
      
      IF v_user_role IN ('staff', 'superadmin') THEN
        v_should_preserve := true;
        v_preservation_reason := 'User is staff/superadmin';
      END IF;
      
      -- Rule 2: Check for remaining applications
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_remaining_apps
        FROM public.student_applications
        WHERE student_id = v_student_id;
        
        IF v_has_remaining_apps THEN
          v_should_preserve := true;
          v_preservation_reason := 'User has remaining applications';
        END IF;
      END IF;
      
      -- Rule 3: Check for refunds
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_refunds
        FROM public.refunds
        WHERE student_id = v_student_id;
        
        IF v_has_refunds THEN
          v_should_preserve := true;
          v_preservation_reason := 'User has refund records (accounting requirement)';
        END IF;
      END IF;
      
      -- Rule 4: Check for maintenance requests
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_maintenance
        FROM public.maintenance_requests
        WHERE student_id = v_student_id;
        
        IF v_has_maintenance THEN
          v_should_preserve := true;
          v_preservation_reason := 'User has maintenance request history';
        END IF;
      END IF;
      
      -- Rule 5: Check for utility payments created by user
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_utility_payments
        FROM public.utility_payments
        WHERE created_by = v_student_id;
        
        IF v_has_utility_payments THEN
          v_should_preserve := true;
          v_preservation_reason := 'User created utility payment records (financial audit)';
        END IF;
      END IF;
      
      -- Rule 6: Check for activity logs
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_activity_logs
        FROM public.staff_activity_logs
        WHERE staff_id = v_student_id;
        
        IF v_has_activity_logs THEN
          v_should_preserve := true;
          v_preservation_reason := 'User has activity log entries (audit trail)';
        END IF;
      END IF;
      
      -- Decision: Delete or Preserve
      IF v_should_preserve THEN
        v_users_preserved := v_users_preserved + 1;
        v_preserved_user_ids := v_preserved_user_ids || v_student_id;
        v_user_details := v_user_details || jsonb_build_object(
          'user_id', v_student_id,
          'action', 'preserved',
          'reason', v_preservation_reason,
          'has_remaining_apps', v_has_remaining_apps,
          'has_refunds', v_has_refunds,
          'has_maintenance', v_has_maintenance,
          'has_utility_payments', v_has_utility_payments,
          'has_activity_logs', v_has_activity_logs,
          'role', v_user_role
        );
      ELSE
        -- Safe to delete - user has no important data
        BEGIN
          -- Delete from auth.users (will cascade to profiles, notifications, etc.)
          DELETE FROM auth.users WHERE id = v_student_id;
          
          v_users_deleted := v_users_deleted + 1;
          v_deleted_user_ids := v_deleted_user_ids || v_student_id;
          v_user_details := v_user_details || jsonb_build_object(
            'user_id', v_student_id,
            'action', 'deleted',
            'reason', 'No important data found - safe to delete',
            'has_remaining_apps', false,
            'has_refunds', false,
            'has_maintenance', false,
            'has_utility_payments', false,
            'has_activity_logs', false
          );
        EXCEPTION
          WHEN OTHERS THEN
            -- Deletion failed (e.g., RESTRICT constraint)
            v_users_preserved := v_users_preserved + 1;
            v_preserved_user_ids := v_preserved_user_ids || v_student_id;
            v_user_details := v_user_details || jsonb_build_object(
              'user_id', v_student_id,
              'action', 'preserved',
              'reason', 'Deletion blocked: ' || SQLERRM,
              'error', SQLERRM,
              'error_code', SQLSTATE
            );
        END;
      END IF;
    END LOOP;
  END IF;
  
  -- Cleanup orphaned studio allocations
  UPDATE public.studios
  SET 
    allocation = NULL,
    reservation_expires_at = NULL,
    status = CASE 
      WHEN status = 'reserved' THEN 'available'
      ELSE status
    END
  WHERE 
    allocation IS NOT NULL
    AND allocation ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND allocation::UUID NOT IN (
      SELECT id FROM public.student_applications
    );
  
  -- Clear all expired reservations
  UPDATE public.studios
  SET 
    reservation_expires_at = NULL,
    status = CASE 
      WHEN status = 'reserved' AND reservation_expires_at < NOW() THEN 'available'
      ELSE status
    END
  WHERE 
    reservation_expires_at IS NOT NULL
    AND reservation_expires_at < NOW();
  
  -- Reset any studios that are still marked as reserved but have no allocation
  UPDATE public.studios
  SET 
    status = 'available',
    allocation = NULL,
    reservation_expires_at = NULL
  WHERE 
    status = 'reserved'
    AND (allocation IS NULL OR allocation = '');
  
  -- Return comprehensive result
  RETURN jsonb_build_object(
    'deleted_count', v_total_deleted,
    'users_deleted', v_users_deleted,
    'users_preserved', v_users_preserved,
    'details', v_details,
    'user_details', v_user_details,
    'cleanup_performed', true,
    'message', format(
      'Deleted %s applications. Users: %s deleted, %s preserved.',
      v_total_deleted,
      v_users_deleted,
      v_users_preserved
    )
  );
END;
$$;

-- Drop and recreate delete_student_applications_by_academic_year with smart deletion parameter
DROP FUNCTION IF EXISTS public.delete_student_applications_by_academic_year(UUID);

CREATE OR REPLACE FUNCTION public.delete_student_applications_by_academic_year(
  p_academic_year_id UUID,
  p_delete_orphaned_users BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application_id UUID;
  v_student_id UUID;
  v_total_deleted INTEGER := 0;
  v_users_deleted INTEGER := 0;
  v_users_preserved INTEGER := 0;
  v_details JSONB := '[]'::JSONB;
  v_user_details JSONB := '[]'::JSONB;
  v_result RECORD;
  v_deleted_tables JSONB;
  v_total_records INTEGER;
  v_total_applications INTEGER;
  v_user_role TEXT;
  v_has_remaining_apps BOOLEAN;
  v_has_refunds BOOLEAN;
  v_has_maintenance BOOLEAN;
  v_has_utility_payments BOOLEAN;
  v_has_activity_logs BOOLEAN;
  v_should_preserve BOOLEAN;
  v_preservation_reason TEXT;
  v_deleted_user_ids UUID[] := '{}';
  v_preserved_user_ids UUID[] := '{}';
  v_student_ids_from_apps UUID[] := '{}';
BEGIN
  -- Disable RLS for this function
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
      'users_deleted', 0,
      'users_preserved', 0,
      'details', '[]'::JSONB,
      'user_details', '[]'::JSONB,
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
      -- Get student_id before deletion
      SELECT sa.student_id INTO v_student_id
      FROM public.student_applications sa
      WHERE sa.id = v_application_id;
      
      -- Add to collection if not already present
      IF v_student_id IS NOT NULL AND NOT (v_student_id = ANY(v_student_ids_from_apps)) THEN
        v_student_ids_from_apps := v_student_ids_from_apps || v_student_id;
      END IF;
      
      -- Call the delete function
      SELECT deleted_tables, total_deleted INTO STRICT v_deleted_tables, v_total_records
      FROM public.delete_student_application(v_application_id);
      
      v_total_deleted := v_total_deleted + 1;
      v_details := v_details || jsonb_build_object(
        'application_id', v_application_id,
        'student_id', v_student_id,
        'deleted_tables', v_deleted_tables,
        'total_deleted', v_total_records,
        'success', true
      );
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', 'Delete function returned no rows - application may not exist or RLS blocked access',
          'error_code', 'P0002',
          'success', false
        );
        RAISE WARNING 'Delete function returned no rows for application %', v_application_id;
      WHEN TOO_MANY_ROWS THEN
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', 'Delete function returned multiple rows',
          'error_code', 'P0003',
          'success', false
        );
        RAISE WARNING 'Delete function returned multiple rows for application %', v_application_id;
      WHEN OTHERS THEN
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', SQLERRM,
          'error_code', SQLSTATE,
          'success', false
        );
        RAISE WARNING 'Failed to delete application %: % (Code: %)', v_application_id, SQLERRM, SQLSTATE;
    END;
  END LOOP;
  
  -- Step 2: Smart User Deletion (if enabled)
  IF p_delete_orphaned_users THEN
    -- Process each unique student_id
    FOREACH v_student_id IN ARRAY v_student_ids_from_apps
    LOOP
      -- Skip if already processed
      IF v_student_id = ANY(v_deleted_user_ids) OR v_student_id = ANY(v_preserved_user_ids) THEN
        CONTINUE;
      END IF;
      
      -- Initialize preservation check
      v_should_preserve := false;
      v_preservation_reason := '';
      v_user_role := NULL;
      v_has_remaining_apps := false;
      v_has_refunds := false;
      v_has_maintenance := false;
      v_has_utility_payments := false;
      v_has_activity_logs := false;
      
      -- Rule 1: Check if user is staff/superadmin
      SELECT role INTO v_user_role
      FROM public.profiles
      WHERE id = v_student_id;
      
      IF v_user_role IN ('staff', 'superadmin') THEN
        v_should_preserve := true;
        v_preservation_reason := 'User is staff/superadmin';
      END IF;
      
      -- Rule 2: Check for remaining applications
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_remaining_apps
        FROM public.student_applications
        WHERE student_id = v_student_id;
        
        IF v_has_remaining_apps THEN
          v_should_preserve := true;
          v_preservation_reason := 'User has remaining applications';
        END IF;
      END IF;
      
      -- Rule 3: Check for refunds
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_refunds
        FROM public.refunds
        WHERE student_id = v_student_id;
        
        IF v_has_refunds THEN
          v_should_preserve := true;
          v_preservation_reason := 'User has refund records (accounting requirement)';
        END IF;
      END IF;
      
      -- Rule 4: Check for maintenance requests
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_maintenance
        FROM public.maintenance_requests
        WHERE student_id = v_student_id;
        
        IF v_has_maintenance THEN
          v_should_preserve := true;
          v_preservation_reason := 'User has maintenance request history';
        END IF;
      END IF;
      
      -- Rule 5: Check for utility payments created by user
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_utility_payments
        FROM public.utility_payments
        WHERE created_by = v_student_id;
        
        IF v_has_utility_payments THEN
          v_should_preserve := true;
          v_preservation_reason := 'User created utility payment records (financial audit)';
        END IF;
      END IF;
      
      -- Rule 6: Check for activity logs
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_activity_logs
        FROM public.staff_activity_logs
        WHERE staff_id = v_student_id;
        
        IF v_has_activity_logs THEN
          v_should_preserve := true;
          v_preservation_reason := 'User has activity log entries (audit trail)';
        END IF;
      END IF;
      
      -- Decision: Delete or Preserve
      IF v_should_preserve THEN
        v_users_preserved := v_users_preserved + 1;
        v_preserved_user_ids := v_preserved_user_ids || v_student_id;
        v_user_details := v_user_details || jsonb_build_object(
          'user_id', v_student_id,
          'action', 'preserved',
          'reason', v_preservation_reason,
          'has_remaining_apps', v_has_remaining_apps,
          'has_refunds', v_has_refunds,
          'has_maintenance', v_has_maintenance,
          'has_utility_payments', v_has_utility_payments,
          'has_activity_logs', v_has_activity_logs,
          'role', v_user_role
        );
      ELSE
        -- Safe to delete - user has no important data
        BEGIN
          -- Delete from auth.users (will cascade to profiles, notifications, etc.)
          DELETE FROM auth.users WHERE id = v_student_id;
          
          v_users_deleted := v_users_deleted + 1;
          v_deleted_user_ids := v_deleted_user_ids || v_student_id;
          v_user_details := v_user_details || jsonb_build_object(
            'user_id', v_student_id,
            'action', 'deleted',
            'reason', 'No important data found - safe to delete',
            'has_remaining_apps', false,
            'has_refunds', false,
            'has_maintenance', false,
            'has_utility_payments', false,
            'has_activity_logs', false
          );
        EXCEPTION
          WHEN OTHERS THEN
            -- Deletion failed (e.g., RESTRICT constraint)
            v_users_preserved := v_users_preserved + 1;
            v_preserved_user_ids := v_preserved_user_ids || v_student_id;
            v_user_details := v_user_details || jsonb_build_object(
              'user_id', v_student_id,
              'action', 'preserved',
              'reason', 'Deletion blocked: ' || SQLERRM,
              'error', SQLERRM,
              'error_code', SQLSTATE
            );
        END;
      END IF;
    END LOOP;
  END IF;
  
  -- Cleanup orphaned studio allocations
  UPDATE public.studios
  SET 
    allocation = NULL,
    reservation_expires_at = NULL,
    status = CASE 
      WHEN status = 'reserved' THEN 'available'
      ELSE status
    END
  WHERE 
    allocation IS NOT NULL
    AND allocation ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND allocation::UUID NOT IN (
      SELECT id FROM public.student_applications
    );
  
  -- Clear all expired reservations
  UPDATE public.studios
  SET 
    reservation_expires_at = NULL,
    status = CASE 
      WHEN status = 'reserved' AND reservation_expires_at < NOW() THEN 'available'
      ELSE status
    END
  WHERE 
    reservation_expires_at IS NOT NULL
    AND reservation_expires_at < NOW();
  
  -- Reset any studios that are still marked as reserved but have no allocation
  UPDATE public.studios
  SET 
    status = 'available',
    allocation = NULL,
    reservation_expires_at = NULL
  WHERE 
    status = 'reserved'
    AND (allocation IS NULL OR allocation = '');
  
  -- Return comprehensive result
  RETURN jsonb_build_object(
    'deleted_count', v_total_deleted,
    'users_deleted', v_users_deleted,
    'users_preserved', v_users_preserved,
    'details', v_details,
    'user_details', v_user_details,
    'cleanup_performed', true,
    'message', format(
      'Deleted %s applications for academic year. Users: %s deleted, %s preserved.',
      v_total_deleted,
      v_users_deleted,
      v_users_preserved
    )
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.delete_all_student_applications(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_student_applications_by_academic_year(UUID, BOOLEAN) TO authenticated;

-- Comments
COMMENT ON FUNCTION public.delete_all_student_applications(BOOLEAN) IS 
'Deletes all student applications. If p_delete_orphaned_users is true, intelligently deletes orphaned user accounts that have no important data (refunds, maintenance requests, etc.). Staff accounts are never deleted.';

COMMENT ON FUNCTION public.delete_student_applications_by_academic_year(UUID, BOOLEAN) IS 
'Deletes all student applications for a specific academic year. If p_delete_orphaned_users is true, intelligently deletes orphaned user accounts that have no important data. Staff accounts are never deleted.';

