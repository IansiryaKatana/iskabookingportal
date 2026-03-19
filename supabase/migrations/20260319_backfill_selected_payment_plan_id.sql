-- Backfill `student_applications.selected_payment_plan_id` for existing applications.
-- Why: Admin-created applications (historically) could be created with a contract but without an explicit selected plan,
-- which causes the admin Application Detail "Payment plan" selector to show "Select plan" until manually chosen.
--
-- Strategy:
-- 1) If the contract has `payment_plan_id` set, use that.
-- 2) Otherwise, use the first linked plan from `contract_payment_plans` (lowest display_order, then created_at).
-- 3) Do NOT overwrite any application that already has `selected_payment_plan_id`.
-- 4) Keep step 5 (`student_application_steps`) in sync so the portal journey shows the same selected plan.

do $$
declare
  affected_count integer := 0;
begin
  -- We use a temp table because CTEs don't persist across statements in plpgsql.
  create temp table if not exists tmp_backfilled_plans (
    application_id uuid primary key,
    plan_id uuid not null
  ) on commit drop;

  truncate table tmp_backfilled_plans;

  -- 1) Materialize candidates (non-modifying query)
  insert into tmp_backfilled_plans (application_id, plan_id)
  with first_linked_plan as (
    select
      cpp.contract_id,
      cpp.payment_plan_id,
      row_number() over (
        partition by cpp.contract_id
        order by cpp.display_order nulls last, cpp.created_at nulls last
      ) as rn
    from public.contract_payment_plans cpp
    where cpp.payment_plan_id is not null
  ),
  candidates as (
    select
      sa.id as application_id,
      coalesce(c.payment_plan_id, flp.payment_plan_id) as plan_id
    from public.student_applications sa
    join public.contracts c on c.id = sa.contract_id
    left join first_linked_plan flp
      on flp.contract_id = c.id and flp.rn = 1
    where sa.selected_payment_plan_id is null
      and coalesce(c.payment_plan_id, flp.payment_plan_id) is not null
  )
  select application_id, plan_id from candidates
  on conflict (application_id) do update set plan_id = excluded.plan_id;

  -- 2) Apply backfill to applications that are still null (do not overwrite existing selections)
  update public.student_applications sa
  set selected_payment_plan_id = t.plan_id,
      updated_at = now()
  from tmp_backfilled_plans t
  where sa.id = t.application_id
    and sa.selected_payment_plan_id is null;

  get diagnostics affected_count = row_count;

  -- Sync step 5 payload for updated applications
  insert into public.student_application_steps (application_id, step_number, payload, is_complete)
  select
    t.application_id,
    5,
    jsonb_build_object('selected_plan_id', t.plan_id::text),
    false
  from tmp_backfilled_plans t
  join public.student_applications sa on sa.id = t.application_id and sa.selected_payment_plan_id = t.plan_id
  on conflict (application_id, step_number)
  do update set
    payload = jsonb_set(
      coalesce(student_application_steps.payload, '{}'::jsonb),
      '{selected_plan_id}',
      to_jsonb(excluded.payload->>'selected_plan_id'),
      true
    ),
    updated_at = now();

  raise notice 'Backfilled selected_payment_plan_id for % application(s).', affected_count;
end $$;

