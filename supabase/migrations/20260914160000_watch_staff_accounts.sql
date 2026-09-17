-- Watchlist for staff accounts under investigation. Login and IP-change
-- on a watched user emails superadmins. Events stay after sessions expire.

CREATE TABLE IF NOT EXISTS public.watched_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  reason text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE IF NOT EXISTS public.watched_account_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  ip inet,
  user_agent text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS watched_account_events_user_created_idx
  ON public.watched_account_events (user_id, created_at DESC);

ALTER TABLE public.watched_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watched_account_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.watched_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.watched_account_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.watched_accounts TO authenticated;
GRANT SELECT ON TABLE public.watched_account_events TO authenticated;
GRANT ALL ON TABLE public.watched_accounts TO service_role;
GRANT ALL ON TABLE public.watched_account_events TO service_role;

DROP POLICY IF EXISTS "Superadmins with MFA can read watched accounts"
  ON public.watched_accounts;
CREATE POLICY "Superadmins with MFA can read watched accounts"
  ON public.watched_accounts
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin() AND public.jwt_is_aal2());

DROP POLICY IF EXISTS "Superadmins with MFA can read watched events"
  ON public.watched_account_events;
CREATE POLICY "Superadmins with MFA can read watched events"
  ON public.watched_account_events
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin() AND public.jwt_is_aal2());

INSERT INTO public.watched_accounts (user_id, email, reason, created_by)
SELECT
  u.id,
  u.email,
  'SEO staff account under review after Sep 2026 incident',
  '04ecefaf-6837-4bfa-84d1-1b5a3afc43bf'
FROM auth.users u
WHERE u.id = '58fd90fc-6289-45e4-acf9-1c1cda1121ae'
ON CONFLICT (user_id) DO UPDATE
SET is_active = true,
    email = EXCLUDED.email,
    reason = EXCLUDED.reason;

CREATE OR REPLACE FUNCTION public.trg_alert_suspicious_auth_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_email text;
  v_agent text;
BEGIN
  SELECT p.role, u.email
  INTO v_role, v_email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = NEW.user_id;

  v_agent := lower(COALESCE(NEW.user_agent, ''));

  IF EXISTS (
    SELECT 1
    FROM public.watched_accounts w
    WHERE w.user_id = NEW.user_id
      AND w.is_active
  ) AND (
    TG_OP = 'INSERT'
    OR (TG_OP = 'UPDATE' AND NEW.ip IS DISTINCT FROM OLD.ip)
  ) THEN
    INSERT INTO public.watched_account_events (
      user_id, event_type, ip, user_agent, detail
    ) VALUES (
      NEW.user_id,
      CASE
        WHEN TG_OP = 'INSERT' THEN 'login'
        ELSE 'session_ip_changed'
      END,
      NEW.ip,
      NEW.user_agent,
      jsonb_build_object(
        'role', v_role,
        'previous_ip', CASE WHEN TG_OP = 'UPDATE' THEN OLD.ip::text ELSE NULL END
      )
    );

    PERFORM public.raise_security_alert(
      CASE
        WHEN TG_OP = 'INSERT' THEN 'watched_account_login'
        ELSE 'watched_account_ip_change'
      END,
      jsonb_build_object(
        'ip', NEW.ip,
        'user_agent', NEW.user_agent,
        'role', v_role
      ),
      NEW.user_id,
      v_email
    );
  END IF;

  IF v_role IN ('staff', 'admin', 'superadmin')
     AND (
       v_agent LIKE '%curl%'
       OR v_agent LIKE '%wget%'
       OR v_agent LIKE '%python-requests%'
       OR v_agent LIKE '%libwww%'
       OR v_agent LIKE '%httpie%'
       OR v_agent LIKE '%postmanruntime%'
     ) THEN
    PERFORM public.raise_security_alert(
      'staff_login_non_browser',
      jsonb_build_object(
        'ip', NEW.ip,
        'user_agent', NEW.user_agent,
        'role', v_role
      ),
      NEW.user_id,
      v_email
    );
  END IF;

  IF NEW.ip IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.signup_deny_networks n
       WHERE NEW.ip <<= n.cidr
     ) THEN
    PERFORM public.raise_security_alert(
      'login_from_banned_ip',
      jsonb_build_object(
        'ip', NEW.ip,
        'user_agent', NEW.user_agent,
        'role', v_role
      ),
      NEW.user_id,
      v_email
    );
    RAISE EXCEPTION 'Sign-in is not allowed from your network.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_watch_staff_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.watched_accounts w
    WHERE w.user_id = NEW.staff_id
      AND w.is_active
  ) THEN
    RETURN NEW;
  END IF;

  SELECT u.email INTO v_email
  FROM auth.users u
  WHERE u.id = NEW.staff_id;

  INSERT INTO public.watched_account_events (
    user_id, event_type, ip, user_agent, detail
  ) VALUES (
    NEW.staff_id,
    'staff_activity',
    NEW.ip_address,
    NULL,
    jsonb_build_object(
      'action', NEW.action,
      'entity_type', NEW.entity_type,
      'entity_id', NEW.entity_id
    )
  );

  PERFORM public.raise_security_alert(
    'watched_account_activity',
    jsonb_build_object(
      'action', NEW.action,
      'entity_type', NEW.entity_type,
      'entity_id', NEW.entity_id,
      'ip', NEW.ip_address
    ),
    NEW.staff_id,
    v_email
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_watch_staff_activity ON public.staff_activity_logs;
CREATE TRIGGER trg_watch_staff_activity
  AFTER INSERT ON public.staff_activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_watch_staff_activity();
