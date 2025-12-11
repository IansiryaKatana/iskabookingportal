alter table public.studio_grade_media
  add column if not exists is_hero boolean not null default false;

create unique index if not exists studio_grade_media_single_hero
  on public.studio_grade_media (studio_grade_id)
  where is_hero;

alter table public.studio_grades
  add column if not exists promo_video_url text;

create table if not exists public.studio_grade_banners (
  id uuid primary key default gen_random_uuid(),
  studio_grade_id uuid not null references public.studio_grades (id) on delete cascade,
  display_order smallint not null default 0,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists studio_grade_banners_order_idx
  on public.studio_grade_banners (studio_grade_id, display_order);

drop trigger if exists set_timestamp_studio_grade_banners on public.studio_grade_banners;
create trigger set_timestamp_studio_grade_banners
before update on public.studio_grade_banners
for each row execute function public.set_current_timestamp_updated_at();

grant select on public.studio_grade_banners to anon, authenticated;
grant insert, update, delete on public.studio_grade_banners to authenticated;

alter table public.studio_grade_banners enable row level security;

drop policy if exists "Public read grade banners" on public.studio_grade_banners;
create policy "Public read grade banners"
  on public.studio_grade_banners
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Staff manage grade banners" on public.studio_grade_banners;
create policy "Staff manage grade banners"
  on public.studio_grade_banners
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Staff manage studio grades" on public.studio_grades;
create policy "Staff manage studio grades"
  on public.studio_grades
  for select
  to authenticated
  using (public.is_staff());

drop policy if exists "Staff update studio grades" on public.studio_grades;
create policy "Staff update studio grades"
  on public.studio_grades
  for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Staff insert studio grades" on public.studio_grades;
create policy "Staff insert studio grades"
  on public.studio_grades
  for insert
  to authenticated
  with check (public.is_staff());

drop policy if exists "Staff delete studio grades" on public.studio_grades;
create policy "Staff delete studio grades"
  on public.studio_grades
  for delete
  to authenticated
  using (public.is_staff());

drop policy if exists "Staff manage studio media" on public.studio_grade_media;
create policy "Staff manage studio media"
  on public.studio_grade_media
  for select
  to authenticated
  using (public.is_staff());

drop policy if exists "Staff insert studio media" on public.studio_grade_media;
create policy "Staff insert studio media"
  on public.studio_grade_media
  for insert
  to authenticated
  with check (public.is_staff());

drop policy if exists "Staff update studio media" on public.studio_grade_media;
create policy "Staff update studio media"
  on public.studio_grade_media
  for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Staff delete studio media" on public.studio_grade_media;
create policy "Staff delete studio media"
  on public.studio_grade_media
  for delete
  to authenticated
  using (public.is_staff());

-- default hero assignment for existing data: mark lowest position image per grade
with ranked as (
  select id
  from (
    select
      id,
      studio_grade_id,
      row_number() over (partition by studio_grade_id order by position asc, created_at asc) as rn
    from public.studio_grade_media
    where media_type = 'image'
  ) ordered
  where rn = 1
)
update public.studio_grade_media
set is_hero = true
where id in (select id from ranked);


