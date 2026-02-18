-- Dashboard occupancy: total studios must always be the full count of active studios (e.g. 425).
-- Previously, when an academic year was selected, occupancy_total only counted studios that had
-- no application or had an application for that year, so studios with applications in other
-- years were excluded (e.g. 26/27 showed 423, 25/26 showed 242). This restores a fixed total
-- and scopes only "occupied" by the selected year.

create or replace function public.get_admin_dashboard_stats(p_academic_year_id uuid default null)
returns table (
  total_students bigint,
  total_applications bigint,
  confirmed_applications bigint,
  recent_applications bigint,
  total_revenue numeric,
  occupancy_total bigint,
  occupancy_occupied bigint,
  occupancy_percentage numeric,
  upcoming_instalments_count bigint,
  upcoming_instalments_total numeric,
  upcoming_instalments_next_due date,
  pending_verifications bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract_ids uuid[] := null;
  v_occupancy_total bigint := 0;
  v_occupancy_occupied bigint := 0;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  if p_academic_year_id is not null then
    select coalesce(array_agg(id), array[]::uuid[])
      into v_contract_ids
      from public.contracts
      where academic_year_id = p_academic_year_id;
  end if;

  -- Total students
  if p_academic_year_id is not null then
    select count(distinct sa.student_id)::bigint
      into total_students
      from public.student_applications sa
      where sa.contract_id = any(v_contract_ids);
  else
    select count(*) into total_students
      from public.profiles
      where role = 'student';
  end if;

  -- Application stats
  if p_academic_year_id is not null then
    select
      count(*)::bigint,
      count(*) filter (where status = 'confirmed')::bigint,
      count(*) filter (where created_at >= (now() - interval '7 days'))::bigint
    into
      total_applications,
      confirmed_applications,
      recent_applications
    from public.student_applications
    where contract_id = any(v_contract_ids);
  else
    select
      count(*)::bigint,
      count(*) filter (where status = 'confirmed')::bigint,
      count(*) filter (where created_at >= (now() - interval '7 days'))::bigint
    into
      total_applications,
      confirmed_applications,
      recent_applications
    from public.student_applications;
  end if;

  -- Total revenue
  if p_academic_year_id is not null then
    select coalesce(sum(uph.amount_paid), 0)
      into total_revenue
      from public.unified_payment_history uph
      where uph.payment_status in ('completed', 'succeeded')
        and uph.contract_id = any(v_contract_ids);
  else
    select coalesce(sum(amount_paid), 0)
      into total_revenue
      from public.unified_payment_history
      where payment_status in ('completed', 'succeeded');
  end if;

  -- Occupancy: total is always all active studios (fixed denominator). Occupied is year-scoped when year selected.
  select count(*)::bigint into v_occupancy_total
  from public.studios
  where is_active is true;

  if p_academic_year_id is not null then
    select count(distinct sa.assigned_studio_id)::bigint into v_occupancy_occupied
    from public.student_applications sa
    inner join public.contracts c on c.id = sa.contract_id
    where sa.status = 'confirmed'
      and c.academic_year_id = p_academic_year_id
      and sa.assigned_studio_id is not null;
  else
    select count(*)::bigint into v_occupancy_occupied
    from public.studios
    where is_active is true and status = 'occupied';
  end if;

  occupancy_total := coalesce(v_occupancy_total, 0);
  occupancy_occupied := coalesce(v_occupancy_occupied, 0);

  occupancy_percentage :=
    case
      when occupancy_total > 0
        then round((occupancy_occupied::numeric / occupancy_total) * 100)
      else 0
    end;

  -- Upcoming instalments
  select
    count(*)::bigint,
    coalesce(sum(amount), 0),
    min(due_date)
  into
    upcoming_instalments_count,
    upcoming_instalments_total,
    upcoming_instalments_next_due
  from public.contract_payment_schedule
  where due_date between current_date and (current_date + interval '30 days')
    and (
      p_academic_year_id is null
      or contract_id = any(v_contract_ids)
    );

  -- Pending verifications
  if p_academic_year_id is not null then
    select count(*)::bigint
      into pending_verifications
      from public.student_documents sd
      inner join public.student_applications sa on sd.application_id = sa.id
      where sd.status = 'pending'
        and sa.contract_id = any(v_contract_ids);
  else
    select count(*)::bigint
      into pending_verifications
      from public.student_documents
      where status = 'pending';
  end if;

  return query
  select
    coalesce(total_students, 0),
    coalesce(total_applications, 0),
    coalesce(confirmed_applications, 0),
    coalesce(recent_applications, 0),
    coalesce(total_revenue, 0),
    coalesce(occupancy_total, 0),
    coalesce(occupancy_occupied, 0),
    coalesce(occupancy_percentage, 0),
    coalesce(upcoming_instalments_count, 0),
    coalesce(upcoming_instalments_total, 0),
    upcoming_instalments_next_due,
    coalesce(pending_verifications, 0);
end;
$$;

grant execute on function public.get_admin_dashboard_stats(uuid) to authenticated;

comment on function public.get_admin_dashboard_stats(uuid) is
'Admin dashboard stats. Occupancy total is always count of all active studios; occupied is year-scoped when academic year is selected.';
