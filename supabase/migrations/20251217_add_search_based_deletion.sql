-- Search-Based Application Deletion Feature
-- Allows searching for applications by student name or studio number and deleting them

-- Function to search applications by criteria
CREATE OR REPLACE FUNCTION public.search_applications_by_criteria(
  p_search_term TEXT,
  p_search_type TEXT -- 'student_name' or 'studio_number'
)
RETURNS TABLE(
  application_id UUID,
  student_name TEXT,
  student_email TEXT,
  studio_number TEXT,
  studio_grade_name TEXT,
  contract_name TEXT,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('row_security', 'off', true);
  
  IF p_search_type = 'student_name' THEN
    RETURN QUERY
    SELECT DISTINCT
      sa.id AS application_id,
      COALESCE(
        NULLIF(TRIM(p.first_name || ' ' || p.last_name), ''),
        NULLIF(TRIM(COALESCE(sas1.payload->>'first_name', '') || ' ' || COALESCE(sas1.payload->>'last_name', '')), ''),
        'Unknown'
      )::TEXT AS student_name,
      COALESCE(auth_user.email, '')::TEXT AS student_email,
      COALESCE(s.studio_number, '')::TEXT AS studio_number,
      COALESCE(sg.name, '')::TEXT AS studio_grade_name,
      COALESCE(c.name, '')::TEXT AS contract_name,
      sa.status::TEXT,
      sa.created_at
    FROM public.student_applications sa
    LEFT JOIN public.profiles p ON sa.student_id = p.id
    LEFT JOIN auth.users auth_user ON sa.student_id = auth_user.id
    LEFT JOIN public.studios s ON sa.assigned_studio_id = s.id
    LEFT JOIN public.studio_grades sg ON sa.studio_grade_id = sg.id
    LEFT JOIN public.contracts c ON sa.contract_id = c.id
    LEFT JOIN public.student_application_steps sas1 
      ON sa.id = sas1.application_id AND sas1.step_number = 1
    WHERE 
      LOWER(COALESCE(p.first_name || ' ' || p.last_name, '')) LIKE LOWER('%' || p_search_term || '%')
      OR LOWER(COALESCE(sas1.payload->>'first_name', '') || ' ' || COALESCE(sas1.payload->>'last_name', '')) 
         LIKE LOWER('%' || p_search_term || '%')
    ORDER BY sa.created_at DESC;
    
  ELSIF p_search_type = 'studio_number' THEN
    RETURN QUERY
    SELECT DISTINCT
      sa.id AS application_id,
      COALESCE(
        NULLIF(TRIM(p.first_name || ' ' || p.last_name), ''),
        NULLIF(TRIM(COALESCE(sas1.payload->>'first_name', '') || ' ' || COALESCE(sas1.payload->>'last_name', '')), ''),
        'Unknown'
      )::TEXT AS student_name,
      COALESCE(auth_user.email, '')::TEXT AS student_email,
      COALESCE(s.studio_number, '')::TEXT AS studio_number,
      COALESCE(sg.name, '')::TEXT AS studio_grade_name,
      COALESCE(c.name, '')::TEXT AS contract_name,
      sa.status::TEXT,
      sa.created_at
    FROM public.student_applications sa
    INNER JOIN public.studios s ON sa.assigned_studio_id = s.id
    LEFT JOIN public.profiles p ON sa.student_id = p.id
    LEFT JOIN auth.users auth_user ON sa.student_id = auth_user.id
    LEFT JOIN public.studio_grades sg ON sa.studio_grade_id = sg.id
    LEFT JOIN public.contracts c ON sa.contract_id = c.id
    LEFT JOIN public.student_application_steps sas1 
      ON sa.id = sas1.application_id AND sas1.step_number = 1
    WHERE LOWER(s.studio_number) LIKE LOWER('%' || p_search_term || '%')
    ORDER BY sa.created_at DESC;
  ELSE
    RAISE EXCEPTION 'Invalid search_type. Must be "student_name" or "studio_number"';
  END IF;
END;
$$;

-- Function to delete applications by IDs with smart deletion support
CREATE OR REPLACE FUNCTION public.delete_applications_by_ids(
  p_application_ids UUID[],
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
  v_deleted_tables JSONB;
  v_total_records INTEGER;
  v_student_ids_from_apps UUID[] := '{}';
  v_deleted_user_ids UUID[] := '{}';
  v_preserved_user_ids UUID[] := '{}';
  -- Smart deletion variables
  v_user_role TEXT;
  v_has_remaining_apps BOOLEAN;
  v_has_refunds BOOLEAN;
  v_has_maintenance BOOLEAN;
  v_has_utility_payments BOOLEAN;
  v_has_activity_logs BOOLEAN;
  v_should_preserve BOOLEAN;
  v_preservation_reason TEXT;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  
  IF array_length(p_application_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'deleted_count', 0,
      'users_deleted', 0,
      'users_preserved', 0,
      'details', '[]'::JSONB,
      'user_details', '[]'::JSONB,
      'message', 'No application IDs provided'
    );
  END IF;
  
  -- Step 1: Delete all applications and collect student_ids
  FOREACH v_application_id IN ARRAY p_application_ids
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
          'error', 'Application not found or already deleted',
          'error_code', 'P0002',
          'success', false
        );
      WHEN OTHERS THEN
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', SQLERRM,
          'error_code', SQLSTATE,
          'success', false
        );
    END;
  END LOOP;
  
  -- Step 2: Smart User Deletion (if enabled)
  IF p_delete_orphaned_users THEN
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
      'Deleted %s application(s). Users: %s deleted, %s preserved.',
      v_total_deleted,
      v_users_deleted,
      v_users_preserved
    )
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.search_applications_by_criteria(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_applications_by_ids(UUID[], BOOLEAN) TO authenticated;

-- Comments
COMMENT ON FUNCTION public.search_applications_by_criteria(TEXT, TEXT) IS 
'Searches for student applications by student name or studio number. Returns matching applications with details.';

COMMENT ON FUNCTION public.delete_applications_by_ids(UUID[], BOOLEAN) IS 
'Deletes applications by their IDs. If p_delete_orphaned_users is true, intelligently deletes orphaned user accounts that have no important data. Staff accounts are never deleted.';

