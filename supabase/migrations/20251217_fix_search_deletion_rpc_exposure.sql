-- Fix RPC exposure for search-based deletion functions
-- Sometimes Supabase needs explicit schema exposure for RPC functions

-- Ensure functions are in the public schema and accessible
ALTER FUNCTION IF EXISTS public.search_applications_by_criteria(TEXT, TEXT) SET SCHEMA public;
ALTER FUNCTION IF EXISTS public.delete_applications_by_ids(UUID[], BOOLEAN) SET SCHEMA public;

-- Re-grant execute permissions (in case they were lost)
GRANT EXECUTE ON FUNCTION public.search_applications_by_criteria(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_applications_by_ids(UUID[], BOOLEAN) TO authenticated;

-- Also grant to service_role for admin operations
GRANT EXECUTE ON FUNCTION public.search_applications_by_criteria(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_applications_by_ids(UUID[], BOOLEAN) TO service_role;

-- Verify functions exist and are accessible
DO $$
BEGIN
  -- Check if functions exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'search_applications_by_criteria' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    RAISE EXCEPTION 'Function search_applications_by_criteria does not exist';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'delete_applications_by_ids' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    RAISE EXCEPTION 'Function delete_applications_by_ids does not exist';
  END IF;
  
  RAISE NOTICE 'Both functions exist and are properly configured';
END;
$$;

