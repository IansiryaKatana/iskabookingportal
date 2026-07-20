-- Keep one active envelope per application and type. Completed envelopes win;
-- otherwise the most recently updated envelope remains active.
with ranked_envelopes as (
  select
    id,
    row_number() over (
      partition by application_id, envelope_type
      order by
        case when lower(status) = 'completed' then 0 else 1 end,
        updated_at desc,
        created_at desc,
        id desc
    ) as active_rank
  from public.docusign_envelopes
  where lower(status) <> 'superseded'
)
update public.docusign_envelopes as envelope
set
  status = 'superseded',
  metadata = coalesce(envelope.metadata, '{}'::jsonb) || jsonb_build_object(
    'superseded_reason', 'duplicate_envelope_cleanup',
    'superseded_at', now()
  )
from ranked_envelopes as ranked
where envelope.id = ranked.id
  and ranked.active_rank > 1;

-- Historical superseded envelopes remain available for audit/download, while
-- active creation is protected against concurrent duplicate submissions.
create unique index if not exists docusign_envelopes_one_active_type_idx
  on public.docusign_envelopes (application_id, envelope_type)
  where lower(status) <> 'superseded';
