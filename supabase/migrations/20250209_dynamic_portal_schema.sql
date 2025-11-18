-- Dynamic portal foundational schema
create extension if not exists "pgcrypto";

create or replace function public.set_current_timestamp_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create type public.studio_status as enum ('available', 'reserved', 'occupied', 'maintenance');
create type public.application_status as enum (
  'draft',
  'awaiting_deposit',
  'awaiting_signature',
  'awaiting_verification',
  'confirmed',
  'cancelled',
  'expired'
);
create type public.payment_amount_type as enum ('percentage', 'fixed');
create type public.document_status as enum ('pending', 'approved', 'rejected');
create type public.signature_type as enum ('student', 'guarantor', 'staff');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'student',
  first_name text,
  last_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_timestamp_profiles
before update on public.profiles
for each row execute function public.set_current_timestamp_updated_at();

create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('staff', 'superadmin')
  );
$$;

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_year_dates_check check (start_date < end_date)
);

drop trigger if exists set_timestamp_academic_years on public.academic_years;
create trigger set_timestamp_academic_years
before update on public.academic_years
for each row execute function public.set_current_timestamp_updated_at();

create table public.studio_grades (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  short_description text,
  long_description text,
  max_occupancy integer,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_timestamp_studio_grades on public.studio_grades;
create trigger set_timestamp_studio_grades
before update on public.studio_grades
for each row execute function public.set_current_timestamp_updated_at();

create table public.studio_grade_media (
  id uuid primary key default gen_random_uuid(),
  studio_grade_id uuid not null references public.studio_grades (id) on delete cascade,
  media_type text not null,
  title text,
  description text,
  url text not null,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_grade_media_type_check check (media_type in ('image', 'video'))
);

create unique index studio_grade_media_unique_position
  on public.studio_grade_media (studio_grade_id, media_type, position);

drop trigger if exists set_timestamp_studio_grade_media on public.studio_grade_media;
create trigger set_timestamp_studio_grade_media
before update on public.studio_grade_media
for each row execute function public.set_current_timestamp_updated_at();

create table public.amenities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  icon_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_timestamp_amenities on public.amenities;
create trigger set_timestamp_amenities
before update on public.amenities
for each row execute function public.set_current_timestamp_updated_at();

create table public.studio_grade_amenities (
  id uuid primary key default gen_random_uuid(),
  studio_grade_id uuid not null references public.studio_grades (id) on delete cascade,
  amenity_id uuid not null references public.amenities (id) on delete cascade,
  description_override text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index studio_grade_amenities_unique
  on public.studio_grade_amenities (studio_grade_id, amenity_id);

drop trigger if exists set_timestamp_studio_grade_amenities on public.studio_grade_amenities;
create trigger set_timestamp_studio_grade_amenities
before update on public.studio_grade_amenities
for each row execute function public.set_current_timestamp_updated_at();

create table public.studios (
  id uuid primary key default gen_random_uuid(),
  studio_number text not null,
  studio_grade_id uuid not null references public.studio_grades (id) on delete restrict,
  floor text,
  status public.studio_status not null default 'available',
  allocation text,
  is_active boolean not null default true,
  reservation_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studios_unique_number unique (studio_number)
);

create index studios_grade_idx on public.studios (studio_grade_id);

drop trigger if exists set_timestamp_studios on public.studios;
create trigger set_timestamp_studios
before update on public.studios
for each row execute function public.set_current_timestamp_updated_at();

create table public.payment_plans (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  name text not null,
  description text,
  deposit_amount numeric(10,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payment_plans_year_idx on public.payment_plans (academic_year_id);

drop trigger if exists set_timestamp_payment_plans on public.payment_plans;
create trigger set_timestamp_payment_plans
before update on public.payment_plans
for each row execute function public.set_current_timestamp_updated_at();

create table public.payment_plan_installments (
  id uuid primary key default gen_random_uuid(),
  payment_plan_id uuid not null references public.payment_plans (id) on delete cascade,
  sequence smallint not null,
  label text,
  due_date_offset_days integer,
  due_date date,
  amount_type public.payment_amount_type not null default 'percentage',
  amount_value numeric(10,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_plan_installment_due_check check (due_date_offset_days is not null or due_date is not null),
  constraint payment_plan_installment_percentage_check check (
    (amount_type = 'percentage' and amount_value >= 0 and amount_value <= 100)
    or amount_type = 'fixed'
  )
);

create unique index payment_plan_installments_unique_seq
  on public.payment_plan_installments (payment_plan_id, sequence);

drop trigger if exists set_timestamp_payment_plan_installments on public.payment_plan_installments;
create trigger set_timestamp_payment_plan_installments
before update on public.payment_plan_installments
for each row execute function public.set_current_timestamp_updated_at();

create table public.studio_grade_prices (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  studio_grade_id uuid not null references public.studio_grades (id) on delete cascade,
  weekly_price numeric(10,2) not null,
  deposit_amount_override numeric(10,2),
  currency_code text not null default 'GBP',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_grade_prices_currency_check check (char_length(currency_code) = 3)
);

create unique index studio_grade_prices_unique
  on public.studio_grade_prices (academic_year_id, studio_grade_id);

drop trigger if exists set_timestamp_studio_grade_prices on public.studio_grade_prices;
create trigger set_timestamp_studio_grade_prices
before update on public.studio_grade_prices
for each row execute function public.set_current_timestamp_updated_at();

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  studio_grade_id uuid not null references public.studio_grades (id) on delete cascade,
  payment_plan_id uuid references public.payment_plans (id) on delete set null,
  slug text not null unique,
  name text not null,
  summary text,
  contract_start date not null,
  contract_end date not null,
  weeks integer not null,
  weekly_price_override numeric(10,2),
  deposit_override numeric(10,2),
  cta_label text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contracts_date_check check (contract_start < contract_end)
);

create index contracts_grade_idx on public.contracts (studio_grade_id);

drop trigger if exists set_timestamp_contracts on public.contracts;
create trigger set_timestamp_contracts
before update on public.contracts
for each row execute function public.set_current_timestamp_updated_at();

create table public.contract_payment_schedule (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  label text,
  sequence smallint not null,
  due_date date not null,
  amount numeric(10,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index contract_payment_schedule_unique
  on public.contract_payment_schedule (contract_id, sequence);

drop trigger if exists set_timestamp_contract_payment_schedule on public.contract_payment_schedule;
create trigger set_timestamp_contract_payment_schedule
before update on public.contract_payment_schedule
for each row execute function public.set_current_timestamp_updated_at();

create table public.student_applications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  studio_grade_id uuid not null references public.studio_grades (id) on delete restrict,
  contract_id uuid not null references public.contracts (id) on delete restrict,
  assigned_studio_id uuid references public.studios (id) on delete set null,
  status public.application_status not null default 'draft',
  stripe_customer_id text,
  deposit_payment_intent_id text,
  reserved_studio_expires_at timestamptz,
  submitted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index student_applications_student_idx on public.student_applications (student_id);
create index student_applications_contract_idx on public.student_applications (contract_id);

drop trigger if exists set_timestamp_student_applications on public.student_applications;
create trigger set_timestamp_student_applications
before update on public.student_applications
for each row execute function public.set_current_timestamp_updated_at();

create table public.student_application_steps (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.student_applications (id) on delete cascade,
  step_number smallint not null,
  payload jsonb not null default '{}'::jsonb,
  is_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index student_application_steps_unique
  on public.student_application_steps (application_id, step_number);

drop trigger if exists set_timestamp_student_application_steps on public.student_application_steps;
create trigger set_timestamp_student_application_steps
before update on public.student_application_steps
for each row execute function public.set_current_timestamp_updated_at();

create table public.student_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.student_applications (id) on delete cascade,
  document_type text not null,
  storage_path text not null,
  original_filename text,
  mime_type text,
  status public.document_status not null default 'pending',
  uploaded_by uuid references auth.users (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index student_documents_application_idx on public.student_documents (application_id);

drop trigger if exists set_timestamp_student_documents on public.student_documents;
create trigger set_timestamp_student_documents
before update on public.student_documents
for each row execute function public.set_current_timestamp_updated_at();

create table public.student_signatures (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.student_applications (id) on delete cascade,
  signature_type public.signature_type not null,
  storage_path text not null,
  signature_external_id text,
  metadata jsonb,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_timestamp_student_signatures on public.student_signatures;
create trigger set_timestamp_student_signatures
before update on public.student_signatures
for each row execute function public.set_current_timestamp_updated_at();

create table public.staff_activity_logs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  notification_type text not null,
  title text,
  message text,
  metadata jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id);

-- RLS policies
alter table public.profiles enable row level security;
alter table public.academic_years enable row level security;
alter table public.studio_grades enable row level security;
alter table public.studio_grade_media enable row level security;
alter table public.amenities enable row level security;
alter table public.studio_grade_amenities enable row level security;
alter table public.studios enable row level security;
alter table public.payment_plans enable row level security;
alter table public.payment_plan_installments enable row level security;
alter table public.studio_grade_prices enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_payment_schedule enable row level security;
alter table public.student_applications enable row level security;
alter table public.student_application_steps enable row level security;
alter table public.student_documents enable row level security;
alter table public.student_signatures enable row level security;
alter table public.staff_activity_logs enable row level security;
alter table public.notifications enable row level security;

create policy "Public read academic years" on public.academic_years
  for select using (true);
create policy "Public read studio grades" on public.studio_grades
  for select using (true);
create policy "Public read studio media" on public.studio_grade_media
  for select using (true);
create policy "Public read amenities" on public.amenities
  for select using (true);
create policy "Public read studio grade amenities" on public.studio_grade_amenities
  for select using (true);
create policy "Public read studios" on public.studios
  for select using (true);
create policy "Public read payment plans" on public.payment_plans
  for select using (true);
create policy "Public read plan installments" on public.payment_plan_installments
  for select using (true);
create policy "Public read grade prices" on public.studio_grade_prices
  for select using (true);
create policy "Public read contracts" on public.contracts
  for select using (true);
create policy "Public read contract schedule" on public.contract_payment_schedule
  for select using (true);

create policy "Users read own profile" on public.profiles
  for select using (
    auth.uid() = id
    or public.is_staff()
  );

create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Staff manage profiles" on public.profiles
  for all using (public.is_staff())
  with check (public.is_staff());

create policy "Students manage own applications" on public.student_applications
  for select using (
    student_id = auth.uid()
    or public.is_staff()
  );

create policy "Students insert applications" on public.student_applications
  for insert with check (student_id = auth.uid());

create policy "Students update own applications" on public.student_applications
  for update using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy "Staff manage applications" on public.student_applications
  for all using (public.is_staff())
  with check (public.is_staff());

create policy "Students manage own steps" on public.student_application_steps
  for select using (
    exists (
      select 1
      from public.student_applications a
      where a.id = application_id
        and a.student_id = auth.uid()
    )
    or public.is_staff()
  );

create policy "Students insert steps" on public.student_application_steps
  for insert with check (
    exists (
      select 1
      from public.student_applications a
      where a.id = application_id
        and a.student_id = auth.uid()
    )
  );

create policy "Students update steps" on public.student_application_steps
  for update using (
    exists (
      select 1
      from public.student_applications a
      where a.id = application_id
        and a.student_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.student_applications a
      where a.id = application_id
        and a.student_id = auth.uid()
    )
  );

create policy "Staff manage steps" on public.student_application_steps
  for all using (public.is_staff())
  with check (public.is_staff());

create policy "Students manage own documents" on public.student_documents
  for select using (
    exists (
      select 1 from public.student_applications a
      where a.id = application_id
        and a.student_id = auth.uid()
    )
    or public.is_staff()
  );

create policy "Students insert documents" on public.student_documents
  for insert with check (
    exists (
      select 1 from public.student_applications a
      where a.id = application_id
        and a.student_id = auth.uid()
    )
  );

create policy "Students update documents" on public.student_documents
  for update using (
    exists (
      select 1 from public.student_applications a
      where a.id = application_id
        and a.student_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.student_applications a
      where a.id = application_id
        and a.student_id = auth.uid()
    )
  );

create policy "Staff manage documents" on public.student_documents
  for all using (public.is_staff())
  with check (public.is_staff());

create policy "Students view own signatures" on public.student_signatures
  for select using (
    exists (
      select 1 from public.student_applications a
      where a.id = application_id
        and a.student_id = auth.uid()
    )
    or public.is_staff()
  );

create policy "Students insert signatures" on public.student_signatures
  for insert with check (
    exists (
      select 1 from public.student_applications a
      where a.id = application_id
        and a.student_id = auth.uid()
    )
  );

create policy "Staff manage signatures" on public.student_signatures
  for all using (public.is_staff())
  with check (public.is_staff());

create policy "Staff read activity logs" on public.staff_activity_logs
  for select using (public.is_staff());

create policy "Staff insert activity logs" on public.staff_activity_logs
  for insert with check (public.is_staff());

create policy "Users read own notifications" on public.notifications
  for select using (
    user_id = auth.uid() or public.is_staff()
  );

create policy "Users insert notifications" on public.notifications
  for insert with check (
    user_id = auth.uid() or public.is_staff()
  );

create policy "Users update own notifications" on public.notifications
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Staff manage notifications" on public.notifications
  for all using (public.is_staff())
  with check (public.is_staff());

-- auth trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Storage buckets (insert if missing)
insert into storage.buckets (id, name, public)
values 
  ('studio-media', 'studio-media', false),
  ('documents', 'documents', false),
  ('contracts', 'contracts', false)
on conflict (id) do nothing;

-- NOTE: Storage policies must be created using storage admin helpers or the Supabase dashboard
-- because this migration does not own storage.objects. Configure the following policies manually:
--   • Public read on bucket 'studio-media'
--   • Staff full access on bucket 'studio-media'
--   • Students own-document access on bucket 'documents'
--   • Staff full access on bucket 'contracts'
