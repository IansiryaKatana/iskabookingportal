drop policy if exists "Public read studios" on public.studios;
create policy "Public read studios"
  on public.studios
  for select
  to anon, authenticated
  using (is_active);

drop policy if exists "Staff manage studios" on public.studios;
create policy "Staff manage studios"
  on public.studios
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

