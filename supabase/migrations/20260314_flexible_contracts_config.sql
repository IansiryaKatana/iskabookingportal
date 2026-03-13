-- Flexible contracts configuration: minimum duration and placeholders
-- - Adds per-academic-year minimum flexible stay duration (in weeks)
-- - Adds optional link to a default flexible payment plan per academic year
-- - Adds requested flexible dates on student applications (for placeholder contracts)
-- - Adds a flag on contracts to mark flexible placeholder contracts

begin;

-- 1) Academic year settings for flexible stays
alter table public.academic_years
  add column if not exists min_flexible_weeks integer not null default 2;

alter table public.academic_years
  add column if not exists flexible_default_payment_plan_id uuid
    references public.payment_plans (id) on delete set null;

comment on column public.academic_years.min_flexible_weeks is
  'Minimum duration in weeks for flexible/custom stay requests in this academic year.';

comment on column public.academic_years.flexible_default_payment_plan_id is
  'Optional default payment plan to use for flexible/custom duration contracts in this academic year.';

-- 2) Student applications: requested flexible dates
alter table public.student_applications
  add column if not exists requested_contract_start date;

alter table public.student_applications
  add column if not exists requested_contract_end date;

comment on column public.student_applications.requested_contract_start is
  'For flexible/custom duration requests: the student''s requested contract start date.';

comment on column public.student_applications.requested_contract_end is
  'For flexible/custom duration requests: the student''s requested contract end date.';

-- 3) Contracts: mark flexible placeholder contracts explicitly
alter table public.contracts
  add column if not exists is_custom_duration_placeholder boolean not null default false;

comment on column public.contracts.is_custom_duration_placeholder is
  'When true, this contract is a flexible/custom-duration placeholder used to start applications; staff later create a specific custom contract from the request.';

commit;

