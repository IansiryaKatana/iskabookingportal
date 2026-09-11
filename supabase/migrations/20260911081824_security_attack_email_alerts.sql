-- Email superadmins when the 10–11 Sep 2026 attack pattern repeats:
-- curl/non-browser staff login, login from a banned IP, MFA enrolled on a
-- privileged account, blocked secrets/superadmin RPCs, blocked abusive signup.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.security_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  actor_id uuid,
  actor_email text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_alerts_dedup_idx
  ON public.security_alerts (kind, actor_id, created_at DESC);

ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.security_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.security_alerts TO authenticated;
GRANT ALL ON TABLE public.security_alerts TO service_role;

DROP POLICY IF EXISTS "Superadmins with MFA can read security alerts" ON public.security_alerts;
CREATE POLICY "Superadmins with MFA can read security alerts"
  ON public.security_alerts
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin() AND public.jwt_is_aal2());

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
  'security_alert_webhook_secret',
  encode(gen_random_bytes(32), 'hex'),
  'other',
  'Shared secret for pg_net calling send-security-alert (x-security-alert-secret)',
  'webhook',
  true,
  false,
  false
)
ON CONFLICT (credential_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.raise_security_alert(
  p_kind text,
  p_detail jsonb DEFAULT '{}'::jsonb,
  p_actor_id uuid DEFAULT NULL,
  p_actor_email text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_email text;
  v_id uuid;
  v_secret text;
BEGIN
  v_actor := COALESCE(p_actor_id, auth.uid());
  v_email := NULLIF(btrim(COALESCE(p_actor_email, '')), '');

  IF v_email IS NULL AND v_actor IS NOT NULL THEN
    SELECT u.email INTO v_email
    FROM auth.users u
    WHERE u.id = v_actor;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.security_alerts a
    WHERE a.kind = p_kind
      AND a.actor_id IS NOT DISTINCT FROM v_actor
      AND a.created_at > now() - interval '15 minutes'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.security_alerts (kind, actor_id, actor_email, detail)
  VALUES (p_kind, v_actor, v_email, COALESCE(p_detail, '{}'::jsonb))
  RETURNING id INTO v_id;

  SELECT c.credential_value INTO v_secret
  FROM public.credentials c
  WHERE lower(c.credential_key) = 'security_alert_webhook_secret'
  LIMIT 1;

  IF COALESCE(v_secret, '') = '' THEN
    RETURN;
  END IF;

  -- Synchronous HTTP so the email still leaves if the caller RAISES
  -- (pg_net only fires after COMMIT, which never happens on blocked RPCs).
  PERFORM extensions.http((
    'POST',
    'https://pzptocwdaqpczexlbajr.supabase.co/functions/v1/send-security-alert',
    ARRAY[
      extensions.http_header('Content-Type', 'application/json'),
      extensions.http_header('x-security-alert-secret', v_secret)
    ],
    'application/json',
    jsonb_build_object(
      'id', v_id,
      'kind', p_kind,
      'actor_id', v_actor,
      'actor_email', v_email,
      'detail', COALESCE(p_detail, '{}'::jsonb),
      'created_at', now()
    )::text
  )::extensions.http_request);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN
      PERFORM net.http_post(
        url := 'https://pzptocwdaqpczexlbajr.supabase.co/functions/v1/send-security-alert',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-security-alert-secret', v_secret
        ),
        body := jsonb_build_object(
          'id', v_id,
          'kind', p_kind,
          'actor_id', v_actor,
          'actor_email', v_email,
          'detail', COALESCE(p_detail, '{}'::jsonb),
          'created_at', now()
        ),
        timeout_milliseconds := 5000
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.raise_security_alert(text, jsonb, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raise_security_alert(text, jsonb, uuid, text) TO authenticated, service_role;

DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION public.raise_security_alert(text, jsonb, uuid, text) TO supabase_auth_admin;
EXCEPTION WHEN undefined_object THEN
  NULL;
END
$$;

CREATE OR REPLACE FUNCTION public.require_superadmin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    PERFORM public.raise_security_alert(
      'blocked_privileged_action',
      jsonb_build_object('reason', 'not_superadmin')
    );
    RAISE EXCEPTION 'Forbidden: Superadmin access required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.jwt_is_aal2() THEN
    PERFORM public.raise_security_alert(
      'blocked_privileged_action',
      jsonb_build_object('reason', 'superadmin_without_mfa')
    );
    RAISE EXCEPTION 'Forbidden: Superadmin MFA (authenticator) is required'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alert_suspicious_auth_session ON auth.sessions;
CREATE TRIGGER trg_alert_suspicious_auth_session
  AFTER INSERT ON auth.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_alert_suspicious_auth_session();

CREATE OR REPLACE FUNCTION public.trg_alert_privileged_mfa_enrolled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_email text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'verified' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'verified' THEN
    RETURN NEW;
  END IF;

  SELECT p.role, u.email
  INTO v_role, v_email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = NEW.user_id;

  IF v_role IN ('staff', 'admin', 'superadmin') THEN
    PERFORM public.raise_security_alert(
      'privileged_mfa_enrolled',
      jsonb_build_object(
        'factor_type', NEW.factor_type,
        'role', v_role
      ),
      NEW.user_id,
      v_email
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alert_privileged_mfa_enrolled ON auth.mfa_factors;
CREATE TRIGGER trg_alert_privileged_mfa_enrolled
  AFTER INSERT OR UPDATE OF status ON auth.mfa_factors
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_alert_privileged_mfa_enrolled();

CREATE OR REPLACE FUNCTION public.hook_block_abusive_signups(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_domain text;
  v_ip inet;
  v_denied int;
BEGIN
  v_email := lower(COALESCE(event->'user'->>'email', ''));
  v_domain := split_part(v_email, '@', 2);

  IF v_domain IN (
    'guerrillamail.com',
    'guerrillamailblock.com',
    'guerrillamail.org',
    'sharklasers.com',
    'grr.la',
    'mailinator.com',
    '10minutemail.com',
    'tempmail.com',
    'trashmail.com',
    'yopmail.com',
    'example.com'
  ) THEN
    PERFORM public.raise_security_alert(
      'abusive_signup_blocked',
      jsonb_build_object(
        'reason', 'disposable_email',
        'email', v_email,
        'ip', event->'metadata'->>'ip_address'
      ),
      NULL,
      v_email
    );
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'This email provider is not allowed.',
        'http_code', 403
      )
    );
  END IF;

  BEGIN
    v_ip := NULLIF(event->'metadata'->>'ip_address', '')::inet;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  IF v_ip IS NOT NULL THEN
    SELECT COUNT(*) INTO v_denied
    FROM public.signup_deny_networks
    WHERE v_ip <<= cidr;

    IF v_denied > 0 THEN
      PERFORM public.raise_security_alert(
        'abusive_signup_blocked',
        jsonb_build_object(
          'reason', 'banned_ip',
          'email', v_email,
          'ip', v_ip
        ),
        NULL,
        v_email
      );
      RETURN jsonb_build_object(
        'error', jsonb_build_object(
          'message', 'Signups are not allowed from your network.',
          'http_code', 403
        )
      );
    END IF;
  END IF;

  RETURN '{}'::jsonb;
END;
$$;

REVOKE ALL ON FUNCTION public.hook_block_abusive_signups(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hook_block_abusive_signups(jsonb) TO service_role;

DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION public.hook_block_abusive_signups(jsonb) TO supabase_auth_admin;
EXCEPTION WHEN undefined_object THEN
  NULL;
END
$$;
