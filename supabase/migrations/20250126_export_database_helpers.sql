-- Helper functions for database export
-- These functions allow the export-database edge function to query system catalogs

-- Function to get all tables with their structure
CREATE OR REPLACE FUNCTION public.export_get_tables()
RETURNS TABLE (
  table_schema text,
  table_name text,
  table_type text,
  table_comment text,
  columns jsonb,
  constraints jsonb
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.table_schema::text,
    t.table_name::text,
    t.table_type::text,
    COALESCE(obj_description(c.oid, 'pg_class'), '')::text as table_comment,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'column_name', column_name,
          'data_type', data_type,
          'udt_name', udt_name,
          'character_maximum_length', character_maximum_length,
          'numeric_precision', numeric_precision,
          'numeric_scale', numeric_scale,
          'is_nullable', is_nullable,
          'column_default', column_default,
          'ordinal_position', ordinal_position
        ) ORDER BY ordinal_position
      )
      FROM information_schema.columns
      WHERE table_schema = t.table_schema AND table_name = t.table_name
    ) as columns,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'constraint_name', tc.constraint_name,
          'constraint_type', tc.constraint_type,
          'column_name', kcu.column_name,
          'foreign_table_schema', ccu.table_schema,
          'foreign_table_name', ccu.table_name,
          'foreign_column_name', ccu.column_name,
          'update_rule', rc.update_rule,
          'delete_rule', rc.delete_rule
        )
      )
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      LEFT JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
      WHERE tc.table_schema = t.table_schema AND tc.table_name = t.table_name
    ) as constraints
  FROM information_schema.tables t
  LEFT JOIN pg_class c ON c.relname = t.table_name
  LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
  WHERE t.table_schema IN ('public', 'storage')
    AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_schema, t.table_name;
END;
$$;

-- Function to get all functions
CREATE OR REPLACE FUNCTION public.export_get_functions()
RETURNS TABLE (
  schema_name text,
  function_name text,
  arguments text,
  return_type text,
  definition text,
  comment text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.nspname::text,
    p.proname::text,
    pg_get_function_arguments(p.oid)::text,
    pg_get_function_result(p.oid)::text,
    pg_get_functiondef(p.oid)::text,
    COALESCE(obj_description(p.oid, 'pg_proc'), '')::text
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname IN ('public', 'storage')
    AND p.prokind = 'f'
  ORDER BY n.nspname, p.proname;
END;
$$;

-- Function to get all views
CREATE OR REPLACE FUNCTION public.export_get_views()
RETURNS TABLE (
  table_schema text,
  table_name text,
  view_definition text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    table_schema::text,
    table_name::text,
    view_definition::text
  FROM information_schema.views
  WHERE table_schema IN ('public', 'storage')
  ORDER BY table_schema, table_name;
END;
$$;

-- Function to get all enums
CREATE OR REPLACE FUNCTION public.export_get_enums()
RETURNS TABLE (
  enum_name text,
  schema_name text,
  enum_values text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.typname::text,
    n.nspname::text,
    array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[]
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_namespace n ON t.typnamespace = n.oid
  WHERE n.nspname = 'public'
  GROUP BY t.typname, n.nspname
  ORDER BY n.nspname, t.typname;
END;
$$;

-- Function to get all triggers
CREATE OR REPLACE FUNCTION public.export_get_triggers()
RETURNS TABLE (
  trigger_schema text,
  trigger_name text,
  event_manipulation text,
  event_object_table text,
  action_statement text,
  action_timing text,
  action_orientation text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    trigger_schema::text,
    trigger_name::text,
    event_manipulation::text,
    event_object_table::text,
    action_statement::text,
    action_timing::text,
    action_orientation::text
  FROM information_schema.triggers
  WHERE trigger_schema IN ('public', 'storage')
  ORDER BY trigger_schema, event_object_table, trigger_name;
END;
$$;

-- Function to get all indexes
CREATE OR REPLACE FUNCTION public.export_get_indexes()
RETURNS TABLE (
  schemaname text,
  tablename text,
  indexname text,
  indexdef text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    schemaname::text,
    tablename::text,
    indexname::text,
    indexdef::text
  FROM pg_indexes
  WHERE schemaname IN ('public', 'storage')
  ORDER BY schemaname, tablename, indexname;
END;
$$;

-- Function to get all RLS policies
CREATE OR REPLACE FUNCTION public.export_get_rls_policies()
RETURNS TABLE (
  schemaname text,
  tablename text,
  policyname text,
  permissive text,
  roles text[],
  cmd text,
  qual text,
  with_check text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    schemaname::text,
    tablename::text,
    policyname::text,
    permissive::text,
    roles::text[],
    cmd::text,
    qual::text,
    with_check::text
  FROM pg_policies
  WHERE schemaname IN ('public', 'storage')
  ORDER BY schemaname, tablename, policyname;
END;
$$;

-- Function to get all grants
CREATE OR REPLACE FUNCTION public.export_get_grants()
RETURNS TABLE (
  grantee text,
  table_schema text,
  table_name text,
  privilege_type text,
  is_grantable text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    grantee::text,
    table_schema::text,
    table_name::text,
    privilege_type::text,
    is_grantable::text
  FROM information_schema.role_table_grants
  WHERE table_schema IN ('public', 'storage')
    AND grantee IN ('authenticated', 'anon', 'service_role')
  ORDER BY table_schema, table_name, grantee, privilege_type;
END;
$$;

-- Grant execute permissions to service_role
GRANT EXECUTE ON FUNCTION public.export_get_tables() TO service_role;
GRANT EXECUTE ON FUNCTION public.export_get_functions() TO service_role;
GRANT EXECUTE ON FUNCTION public.export_get_views() TO service_role;
GRANT EXECUTE ON FUNCTION public.export_get_enums() TO service_role;
GRANT EXECUTE ON FUNCTION public.export_get_triggers() TO service_role;
GRANT EXECUTE ON FUNCTION public.export_get_indexes() TO service_role;
GRANT EXECUTE ON FUNCTION public.export_get_rls_policies() TO service_role;
GRANT EXECUTE ON FUNCTION public.export_get_grants() TO service_role;

