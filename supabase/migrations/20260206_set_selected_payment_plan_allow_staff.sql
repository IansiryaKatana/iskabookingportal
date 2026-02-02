-- Allow staff/admin/superadmin to set payment plan when opening journey on behalf of student
drop function if exists public.set_selected_payment_plan(uuid, uuid);

create or replace function public.set_selected_payment_plan(
  p_application_id uuid,
  p_plan_id uuid
) returns public.student_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.student_applications;
  requester uuid;
  is_staff_or_admin boolean;
begin
  requester := auth.uid();

  if requester is null then
    raise exception 'Not authenticated';
  end if;

  -- Staff/admin/superadmin can set plan for any application (e.g. when opening journey on behalf of student)
  select (p.role in ('staff', 'admin', 'superadmin'))
  into is_staff_or_admin
  from public.profiles p
  where p.id = requester; 

  begin
    if is_staff_or_admin then
      update public.student_applications
      set selected_payment_plan_id = p_plan_id,
          updated_at = now()
      where id = p_application_id
      returning * into updated_row;
    else
      update public.student_applications
      set selected_payment_plan_id = p_plan_id,
          updated_at = now()
      where id = p_application_id
        and student_id = requester
      returning * into updated_row;
    end if;
  exception
    when undefined_column then
      if is_staff_or_admin then
        update public.student_applications
        set updated_at = now()
        where id = p_application_id
        returning * into updated_row;
      else
        update public.student_applications
        set updated_at = now()
        where id = p_application_id
          and student_id = requester
        returning * into updated_row;
      end if;
  end;

  if not found then
    raise exception 'Application not found or access denied';
  end if;

  return updated_row;
end;
$$;

revoke all on function public.set_selected_payment_plan(uuid, uuid) from public;
grant execute on function public.set_selected_payment_plan(uuid, uuid) to anon;
grant execute on function public.set_selected_payment_plan(uuid, uuid) to authenticated;
grant execute on function public.set_selected_payment_plan(uuid, uuid) to service_role;
