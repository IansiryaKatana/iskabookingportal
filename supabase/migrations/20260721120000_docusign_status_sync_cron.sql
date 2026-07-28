-- Durable DocuSign status sync backup:
-- 1) Enable pg_net so cron can POST to the sync-pending-docusign Edge Function
-- 2) Store a shared cron secret in credentials
-- 3) Schedule a 15-minute poll of applications with open envelopes

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

INSERT INTO public.credentials (
  credential_key,
  credential_value,
  credential_type,
  description,
  category,
  sync_to_edge_function,
  is_encrypted,
  requires_encryption
)
VALUES (
  'docusign_sync_cron_secret',
  'cf353df547d9339fd1de2085819c2ced428c4e90b4952f1b977cde28daa1daee',
  'other',
  'Shared secret for pg_cron calling sync-pending-docusign (x-cron-secret header)',
  'webhook',
  true,
  false,
  false
)
ON CONFLICT (credential_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Replace any previous schedule with the same name
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-pending-docusign') THEN
      PERFORM cron.unschedule('sync-pending-docusign');
    END IF;

    PERFORM cron.schedule(
      'sync-pending-docusign',
      '*/15 * * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://pzptocwdaqpczexlbajr.supabase.co/functions/v1/sync-pending-docusign',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', coalesce(
            (
              SELECT credential_value
              FROM public.credentials
              WHERE lower(credential_key) = 'docusign_sync_cron_secret'
              LIMIT 1
            ),
            ''
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
      $cron$
    );
    RAISE NOTICE 'Scheduled sync-pending-docusign every 15 minutes';
  ELSE
    RAISE NOTICE 'pg_cron not enabled; skipped scheduling sync-pending-docusign';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule sync-pending-docusign: %', SQLERRM;
END $$;
