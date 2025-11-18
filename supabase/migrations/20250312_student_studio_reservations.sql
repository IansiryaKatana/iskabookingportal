-- Allow students to reserve and release studios they interact with

drop policy if exists "Students reserve studios" on public.studios;
create policy "Students reserve studios"
  on public.studios
  for update
  to authenticated
  using (
    status = 'available'
    or allocation = auth.uid()::text
  )
  with check (
    (status = 'reserved' and allocation = auth.uid()::text)
    or (status = 'available' and allocation is null)
  );

