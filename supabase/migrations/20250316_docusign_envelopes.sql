alter type public.signature_type add value if not exists 'witness';

create table if not exists public.docusign_envelopes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.student_applications (id) on delete cascade,
  envelope_type text not null,
  envelope_id text,
  status text not null default 'created',
  recipients jsonb,
  metadata jsonb,
  last_webhook_event jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists docusign_envelopes_application_idx
  on public.docusign_envelopes (application_id);

drop trigger if exists set_timestamp_docusign_envelopes on public.docusign_envelopes;
create trigger set_timestamp_docusign_envelopes
before update on public.docusign_envelopes
for each row execute function public.set_current_timestamp_updated_at();

alter table public.docusign_envelopes enable row level security;

drop policy if exists "Students view own envelopes" on public.docusign_envelopes;
create policy "Students view own envelopes"
  on public.docusign_envelopes
  for select
  using (
    exists (
      select 1
      from public.student_applications a
      where a.id = application_id
        and (a.student_id = auth.uid() or public.is_staff())
    )
  );

drop policy if exists "Staff manage envelopes" on public.docusign_envelopes;
create policy "Staff manage envelopes"
  on public.docusign_envelopes
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

grant select on public.docusign_envelopes to authenticated;
grant insert, update, delete on public.docusign_envelopes to authenticated;

