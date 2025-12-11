-- Setup cron jobs for automated tasks
-- This migration provides cron job setup for automated tasks
-- 
-- IMPORTANT: pg_cron extension requires superuser privileges to enable
-- If you don't have superuser access, use external cron service instead
-- See DEPLOYMENT.md for alternative scheduling options (GitHub Actions, Vercel Cron, etc.)

-- Check if pg_cron extension exists and is enabled
DO $$
BEGIN
  -- Check if pg_cron extension is available
  IF EXISTS (
    SELECT 1 
    FROM pg_extension 
    WHERE extname = 'pg_cron'
  ) THEN
    -- Extension exists, try to schedule the job
    -- Note: This will only work if pg_cron is properly enabled
    -- Note: net.http_post requires pg_net extension which may not be available
    -- For most users, GitHub Actions cron is the recommended approach
    BEGIN
      -- Try to schedule using a simple SQL function call
      -- The actual HTTP call should be made by external cron service
      PERFORM cron.schedule(
        'release-expired-reservations',
        '*/15 * * * *', -- Every 15 minutes
        'SELECT public.trigger_release_expired_reservations();'
      );
      RAISE NOTICE 'Cron job "release-expired-reservations" scheduled successfully';
      RAISE NOTICE 'Note: This requires the trigger function to be called via external HTTP.';
      RAISE NOTICE 'Recommended: Use GitHub Actions cron instead (see .github/workflows/cron-jobs.yml)';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to schedule cron job. Error: %. Use external cron service instead.', SQLERRM;
      RAISE NOTICE 'See .github/workflows/cron-jobs.yml for GitHub Actions cron configuration.';
    END;
  ELSE
    RAISE NOTICE 'pg_cron extension not found. Skipping cron job setup. Use external cron service (GitHub Actions) instead.';
    RAISE NOTICE 'See .github/workflows/cron-jobs.yml for GitHub Actions cron configuration.';
  END IF;
END $$;

-- Helper function for manual triggering (can be called by external cron services)
CREATE OR REPLACE FUNCTION public.trigger_release_expired_reservations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- This function is a placeholder for external cron services
  -- External services should call the edge function directly via HTTP
  -- This function exists for documentation purposes
  result := jsonb_build_object(
    'message', 'This function should be called via HTTP to the release-expired-reservations edge function',
    'endpoint', '/functions/v1/release-expired-reservations',
    'method', 'POST',
    'note', 'Use external cron service (GitHub Actions, Vercel Cron, etc.) to call the edge function directly'
  );
  RETURN result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.trigger_release_expired_reservations() TO authenticated;

COMMENT ON FUNCTION public.trigger_release_expired_reservations() IS 
'Helper function for releasing expired studio reservations. 
External cron services should call the edge function directly via HTTP: 
POST https://your-project.supabase.co/functions/v1/release-expired-reservations
See .github/workflows/cron-jobs.yml for GitHub Actions example.';

-- Note: If pg_cron is not available, the migration will complete successfully
-- but the cron job will not be scheduled. Use external cron service instead.

