-- Fix get_admin_dashboard_stats function to handle edge cases
-- This ensures the function works correctly in production even if views are missing

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
  -- Check authorization
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  -- Get contract IDs if academic year is specified
  if p_academic_year_id is not null then
    select coalesce(array_agg(id), array[]::uuid[])
      into v_contract_ids
      from public.contracts
      where academic_year_id = p_academic_year_id;
  end if;

  -- Get total students
  select count(*) into total_students
  from public.profiles
  where role = 'student';

  -- Get application stats
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

  -- Get total revenue
  select coalesce(sum(amount_paid), 0)
    into total_revenue
  from public.unified_payment_history
  where payment_status in ('completed', 'succeeded');

  -- Get occupancy stats - handle case where view might not exist
  if p_academic_year_id is not null then
    -- Try to use studio_status_by_academic_year view if it exists
    begin
      select
        count(*)::bigint,
        count(*) filter (where effective_status = 'occupied')::bigint
      into
        v_occupancy_total,
        v_occupancy_occupied
      from public.studio_status_by_academic_year
      where academic_year_id = p_academic_year_id
        and is_active is true;
    exception when others then
      -- Fallback to studios table if view doesn't exist
      select
        count(*)::bigint,
        count(*) filter (where status = 'occupied')::bigint
      into
        v_occupancy_total,
        v_occupancy_occupied
      from public.studios
      where is_active is true;
    end;
  else
    select
      count(*)::bigint,
      count(*) filter (where status = 'occupied')::bigint
    into
      v_occupancy_total,
      v_occupancy_occupied
    from public.studios
    where is_active is true;
  end if;

  occupancy_total := coalesce(v_occupancy_total, 0);
  occupancy_occupied := coalesce(v_occupancy_occupied, 0);

  -- Calculate occupancy percentage
  occupancy_percentage :=
    case
      when occupancy_total > 0
        then round((occupancy_occupied::numeric / occupancy_total) * 100)
      else 0
    end;

  -- Get upcoming instalments
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

  -- Get pending verifications
  select count(*)::bigint
    into pending_verifications
  from public.student_documents
  where status = 'pending';

  -- Return results
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

-- Ensure permissions are set
grant execute on function public.get_admin_dashboard_stats(uuid) to authenticated;

