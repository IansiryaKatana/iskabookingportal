-- Signups from signup_deny_networks were already rejected by
-- hook_block_abusive_signups. Logins only emailed Ian
-- (trg_alert_suspicious_auth_session AFTER INSERT). Reject the
-- session so password / OTP / magic-link from a banned IP cannot
-- issue a token. Students stay without MFA.

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
    RAISE EXCEPTION 'Sign-in is not allowed from your network.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alert_suspicious_auth_session ON auth.sessions;
CREATE TRIGGER trg_alert_suspicious_auth_session
  BEFORE INSERT OR UPDATE ON auth.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_alert_suspicious_auth_session();

COMMENT ON TABLE public.signup_deny_networks IS
  'CIDRs blocked for Auth: Before User Created (signups) and session insert/update (logins).';

DELETE FROM auth.sessions s
USING public.signup_deny_networks d
WHERE s.ip IS NOT NULL
  AND s.ip <<= d.cidr;
