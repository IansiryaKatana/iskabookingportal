-- Reinstate student portal RLS policies (select/insert/update) that allow students to manage their own data

drop policy if exists "Students manage own applications" on public.student_applications;
create policy "Students manage own applications"
  on public.student_applications
  for select
  to authenticated
  using (
    student_id = auth.uid()
    or public.is_staff()
  );

drop policy if exists "Students insert applications" on public.student_applications;
create policy "Students insert applications"
  on public.student_applications
  for insert
  to authenticated
  with check (student_id = auth.uid());

drop policy if exists "Students update own applications" on public.student_applications;
create policy "Students update own applications"
  on public.student_applications
  for update
  to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists "Staff manage applications" on public.student_applications;
create policy "Staff manage applications"
  on public.student_applications
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Students manage own steps" on public.student_application_steps;
create policy "Students manage own steps"
  on public.student_application_steps
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_applications a
      where a.id = application_id
        and a.student_id = auth.uid()
    )
    or public.is_staff()
  );

drop policy if exists "Students insert steps" on public.student_application_steps;
create policy "Students insert steps"
  on public.student_application_steps
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.student_applications a
      where a.id = application_id
        and a.student_id = auth.uid()
    )
  );

drop policy if exists "Students update steps" on public.student_application_steps;
create policy "Students update steps"
  on public.student_application_steps
  for update
  to authenticated
  using (
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

drop policy if exists "Staff manage steps" on public.student_application_steps;
create policy "Staff manage steps"
  on public.student_application_steps
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Students manage own documents" on public.student_documents;
create policy "Students manage own documents"
  on public.student_documents
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_applications a
      where a.id = application_id
        and a.student_id = auth.uid()
    )
    or public.is_staff()
  );

drop policy if exists "Students insert documents" on public.student_documents;
create policy "Students insert documents"
  on public.student_documents
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.student_applications a
      where a.id = application_id
        and a.student_id = auth.uid()
    )
  );

drop policy if exists "Students update documents" on public.student_documents;
create policy "Students update documents"
  on public.student_documents
  for update
  to authenticated
  using (
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

drop policy if exists "Staff manage documents" on public.student_documents;
create policy "Staff manage documents"
  on public.student_documents
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Students view own signatures" on public.student_signatures;
create policy "Students view own signatures"
  on public.student_signatures
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_applications a
      where a.id = application_id
        and a.student_id = auth.uid()
    )
    or public.is_staff()
  );

drop policy if exists "Students insert signatures" on public.student_signatures;
create policy "Students insert signatures"
  on public.student_signatures
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.student_applications a
      where a.id = application_id
        and a.student_id = auth.uid()
    )
  );

drop policy if exists "Staff manage signatures" on public.student_signatures;
create policy "Staff manage signatures"
  on public.student_signatures
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());


