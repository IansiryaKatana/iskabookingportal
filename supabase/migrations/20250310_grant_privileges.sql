grant usage on schema public to anon, authenticated, service_role;

grant select on public.academic_years to anon, authenticated;
grant select on public.studio_grades to anon, authenticated;
grant select on public.studio_grade_media to anon, authenticated;
grant select on public.amenities to anon, authenticated;
grant select on public.studio_grade_amenities to anon, authenticated;
grant select on public.studios to anon, authenticated;
grant select on public.payment_plans to anon, authenticated;
grant select on public.payment_plan_installments to anon, authenticated;
grant select on public.studio_grade_prices to anon, authenticated;
grant select on public.contracts to anon, authenticated;
grant select on public.contract_payment_schedule to anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.student_applications to authenticated;
grant select on public.student_application_steps to authenticated;
grant select on public.student_documents to authenticated;
grant select on public.student_signatures to authenticated;

drop policy if exists "Public read studio grades" on public.studio_grades;
create policy "Public read studio grades" on public.studio_grades
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read studio media" on public.studio_grade_media;
create policy "Public read studio media" on public.studio_grade_media
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read amenities" on public.amenities;
create policy "Public read amenities" on public.amenities
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read studio grade amenities" on public.studio_grade_amenities;
create policy "Public read studio grade amenities" on public.studio_grade_amenities
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read grade prices" on public.studio_grade_prices;
create policy "Public read grade prices" on public.studio_grade_prices
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read contracts" on public.contracts;
create policy "Public read contracts" on public.contracts
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read contract schedule" on public.contract_payment_schedule;
create policy "Public read contract schedule" on public.contract_payment_schedule
  for select
  to anon, authenticated
  using (true);

grant insert, update, delete on public.academic_years to authenticated;
grant insert, update, delete on public.studio_grades to authenticated;
grant insert, update, delete on public.studio_grade_media to authenticated;
grant insert, update, delete on public.amenities to authenticated;
grant insert, update, delete on public.studio_grade_amenities to authenticated;
grant insert, update, delete on public.studios to authenticated;
grant insert, update, delete on public.payment_plans to authenticated;
grant insert, update, delete on public.payment_plan_installments to authenticated;
grant insert, update, delete on public.studio_grade_prices to authenticated;
grant insert, update, delete on public.contracts to authenticated;
grant insert, update, delete on public.contract_payment_schedule to authenticated;
grant update on public.profiles to authenticated;
grant insert, update, delete on public.student_applications to authenticated;
grant insert, update, delete on public.student_application_steps to authenticated;
grant insert, update, delete on public.student_documents to authenticated;
grant insert, update, delete on public.student_signatures to authenticated;

grant usage, select on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant select on tables to anon, authenticated;

alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;