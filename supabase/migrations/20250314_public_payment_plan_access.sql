do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_plans'
      and policyname = 'Public read payment plans'
  ) then
    create policy "Public read payment plans"
      on public.payment_plans
      for select
      to public
      using (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_plan_installments'
      and policyname = 'Public read plan installments'
  ) then
    create policy "Public read plan installments"
      on public.payment_plan_installments
      for select
      to public
      using (true);
  end if;
end;
$$;

