drop policy if exists "Staff manage payment plans" on public.payment_plans;
create policy "Staff manage payment plans"
  on public.payment_plans
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Staff manage plan installments" on public.payment_plan_installments;
create policy "Staff manage plan installments"
  on public.payment_plan_installments
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create table if not exists public.contract_payment_plans (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  payment_plan_id uuid not null references public.payment_plans (id) on delete cascade,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, payment_plan_id)
);

create index if not exists contract_payment_plans_contract_idx
  on public.contract_payment_plans (contract_id);

create index if not exists contract_payment_plans_plan_idx
  on public.contract_payment_plans (payment_plan_id);

drop trigger if exists set_timestamp_contract_payment_plans on public.contract_payment_plans;
create trigger set_timestamp_contract_payment_plans
before update on public.contract_payment_plans
for each row execute function public.set_current_timestamp_updated_at();

alter table public.contract_payment_plans enable row level security;

drop policy if exists "Public read contract payment plans" on public.contract_payment_plans;
create policy "Public read contract payment plans"
  on public.contract_payment_plans
  for select
  using (true);

drop policy if exists "Staff manage contract payment plans" on public.contract_payment_plans;
create policy "Staff manage contract payment plans"
  on public.contract_payment_plans
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

insert into public.contract_payment_plans (contract_id, payment_plan_id, display_order)
select id as contract_id, payment_plan_id, 0
from public.contracts
where payment_plan_id is not null
on conflict (contract_id, payment_plan_id) do nothing;

alter table public.student_applications
  add column if not exists selected_payment_plan_id uuid references public.payment_plans (id);

