-- Ensure staff helper bypasses RLS safely
create or replace function public.is_staff()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid;
begin
  current_uid := auth.uid();

  if current_uid is null then
    return false;
  end if;

  return exists (
    select 1
    from public.profiles p
    where p.id = current_uid
      and p.role in ('staff', 'superadmin')
  );
exception
  when others then
    -- If anything goes wrong (e.g. RLS recursion), fail closed but without crashing policy evaluation
    return false;
end;
$$;

grant execute on function public.is_staff() to anon, authenticated, service_role;

-- Recreate the debug helper so it survives schema cache resets
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


