create or replace view public.debug_policies as
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  permissive,
  qual,
  with_check
from pg_policies;

grant select on public.debug_policies to anon, authenticated, service_role;

create or replace function public.debug_table_privilege(
  role_name text,
  qualified_table text,
  privilege text
)
returns boolean
language sql
stable
as $$
  select has_table_privilege(
    role_name,
    qualified_table,
    privilege
  );
$$;

grant execute on function public.debug_table_privilege(text, text, text) to anon, authenticated, service_role;


