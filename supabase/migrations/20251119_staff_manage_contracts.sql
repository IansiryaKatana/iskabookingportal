-- Add RLS policy for staff to manage contracts
drop policy if exists "Staff manage contracts" on public.contracts;
create policy "Staff manage contracts"
  on public.contracts
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

