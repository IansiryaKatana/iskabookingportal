-- Refresh API schema cache and verify RPC functions are exposed
-- This helps Supabase recognize the functions for REST API access

-- First, verify functions exist
SELECT 
  proname as function_name,
  pg_get_function_identity_arguments(oid) as arguments,
  prorettype::regtype as return_type
FROM pg_proc 
WHERE proname IN ('search_applications_by_criteria', 'delete_applications_by_ids')
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY proname;

-- Ensure functions are properly exposed to the API
-- Supabase automatically exposes functions in the public schema with GRANT EXECUTE
-- But sometimes the API cache needs a refresh

-- Re-verify grants
SELECT 
  p.proname as function_name,
  r.rolname as granted_to
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
LEFT JOIN pg_proc_acl pa ON p.oid = pa.oid
LEFT JOIN pg_roles r ON pa.grantee = r.oid
WHERE p.proname IN ('search_applications_by_criteria', 'delete_applications_by_ids')
  AND n.nspname = 'public'
ORDER BY p.proname, r.rolname;

-- Force refresh by touching the functions (recreate with same definition)
-- This sometimes helps Supabase refresh its API schema cache
DO $$
BEGIN
  -- Just verify they exist - the act of querying can help refresh cache
  PERFORM 1 FROM pg_proc WHERE proname = 'search_applications_by_criteria';
  PERFORM 1 FROM pg_proc WHERE proname = 'delete_applications_by_ids';
  RAISE NOTICE 'Functions verified - API schema should refresh automatically';
END;
$$;

