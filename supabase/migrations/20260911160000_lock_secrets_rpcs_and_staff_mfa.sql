-- Close the Data API holes used on 11 Sep 2026 after the stolen
-- info@iankatana.com password login:
--   * set_user_password* (no auth check, PUBLIC execute)
--   * get_encryption_key / encrypt / decrypt (PUBLIC execute)
--   * get_credential_value (any staff JWT)
--   * export_get_* and bulk_import_* (PUBLIC execute)
--   * credentials readable by any superadmin JWT (aal1 / curl)
-- Password-only staff JWTs (aal1) can still authenticate, but they can no
-- longer read secrets, reset passwords, or mutate sensitive tables.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_privileged_portal_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('staff', 'admin', 'superadmin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_privileged_portal_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_privileged_portal_user() TO authenticated, service_role;

COMMENT ON FUNCTION public.is_privileged_portal_user() IS
  'True when the current user is staff, admin, or superadmin. Used by MFA-restrictive RLS.';

CREATE OR REPLACE FUNCTION public.require_service_role_or_superadmin_mfa()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN;
  END IF;
  PERFORM public.require_superadmin();
END;
$$;

REVOKE ALL ON FUNCTION public.require_service_role_or_superadmin_mfa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.require_service_role_or_superadmin_mfa() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_credential_value: service role OR superadmin with MFA
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_credential_value(p_credential_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credential RECORD;
  v_decrypted_value TEXT;
BEGIN
  PERFORM public.require_service_role_or_superadmin_mfa();

  SELECT * INTO v_credential
  FROM public.credentials
  WHERE credential_key = p_credential_key;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_credential.is_encrypted AND v_credential.encrypted_value IS NOT NULL THEN
    v_decrypted_value := public.decrypt_credential_value(v_credential.encrypted_value);
    RETURN v_decrypted_value;
  END IF;

  RETURN v_credential.credential_value;
END;
$$;

COMMENT ON FUNCTION public.get_credential_value(TEXT) IS
  'Decrypted credential. Allowed: service_role, or superadmin with an aal2 JWT.';

REVOKE ALL ON FUNCTION public.get_credential_value(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_credential_value(TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Revoke Data API execute on password, crypto, export, import, debug RPCs
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proname IN (
          'set_user_password',
          'set_user_password_by_id',
          'get_encryption_key',
          'encrypt_credential_value',
          'decrypt_credential_value',
          'export_get_enums',
          'export_get_functions',
          'export_get_grants',
          'export_get_indexes',
          'export_get_rls_policies',
          'export_get_tables',
          'export_get_triggers',
          'export_get_views',
          'find_user_by_email',
          'get_debug_logs',
          'debug_payment_summary',
          'update_credential_sync_status'
        )
        OR p.proname LIKE 'bulk_import_%'
      )
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      r.nspname, r.proname, r.args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',
      r.nspname, r.proname, r.args
    );
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Credentials: revoke anon, require MFA even for superadmin
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.credentials FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.credentials TO authenticated, service_role;

DROP POLICY IF EXISTS "Privileged staff Data API requires MFA" ON public.credentials;
CREATE POLICY "Privileged staff Data API requires MFA"
  ON public.credentials
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.jwt_is_aal2())
  WITH CHECK (public.jwt_is_aal2());

-- ---------------------------------------------------------------------------
-- Sensitive tables: password-only staff JWTs cannot read/write them
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  policy_name text := 'Privileged staff Data API requires MFA';
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'stripe_payments',
    'docusign_envelopes',
    'student_applications',
    'student_documents',
    'student_application_steps',
    'staff_activity_logs',
    'activity_log',
    'payment_plans',
    'payment_plan_installments',
    'manual_payments',
    'manual_payment_requests',
    'refunds',
    'ota_bookings',
    'ota_payments',
    'ota_expenses',
    'partners',
    'partner_referrals',
    'email_templates',
    'contracts',
    'contract_payment_plans',
    'early_check_ins',
    'early_check_in_payments',
    'utility_payments',
    'financial_forecasts',
    'financial_forecast_breakdowns',
    'bulk_messages',
    'application_outbound_messages',
    'application_discounts'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
       USING (NOT public.is_privileged_portal_user() OR public.jwt_is_aal2())
       WITH CHECK (NOT public.is_privileged_portal_user() OR public.jwt_is_aal2())',
      policy_name, t
    );
  END LOOP;
END
$$;

-- Own profile must remain readable at aal1 so MFA setup can load AuthContext.
DROP POLICY IF EXISTS "Privileged staff Data API requires MFA" ON public.profiles;
CREATE POLICY "Privileged staff Data API requires MFA"
  ON public.profiles
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    (SELECT auth.uid()) = id
    OR NOT public.is_privileged_portal_user()
    OR public.jwt_is_aal2()
  )
  WITH CHECK (
    (SELECT auth.uid()) = id
    OR NOT public.is_privileged_portal_user()
    OR public.jwt_is_aal2()
  );

-- Catalog tables: allow SELECT (public site), block writes without MFA.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['studio_grades', 'studios', 'academic_years', 'studio_grade_media']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Privileged staff writes require MFA ins', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Privileged staff writes require MFA upd', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Privileged staff writes require MFA del', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
       WITH CHECK (NOT public.is_privileged_portal_user() OR public.jwt_is_aal2())',
      'Privileged staff writes require MFA ins', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
       USING (NOT public.is_privileged_portal_user() OR public.jwt_is_aal2())
       WITH CHECK (NOT public.is_privileged_portal_user() OR public.jwt_is_aal2())',
      'Privileged staff writes require MFA upd', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
       USING (NOT public.is_privileged_portal_user() OR public.jwt_is_aal2())',
      'Privileged staff writes require MFA del', t
    );
  END LOOP;
END
$$;

-- Replace the applications MFA policy so admin is included (is_staff omits admin).
DROP POLICY IF EXISTS "Staff data access requires MFA" ON public.student_applications;

-- ---------------------------------------------------------------------------
-- Block disposable-email signups
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain text;
BEGIN
  v_domain := lower(split_part(COALESCE(NEW.email, ''), '@', 2));

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
    RAISE EXCEPTION 'This email provider is not allowed'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Signup hook: disposable domains + banned attacker IP
-- Enable "Before User Created" in Dashboard > Authentication > Hooks
-- pointing at public.hook_block_abusive_signups.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.signup_deny_networks (
  id bigserial PRIMARY KEY,
  cidr cidr NOT NULL UNIQUE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.signup_deny_networks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.signup_deny_networks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.signup_deny_networks TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.signup_deny_networks_id_seq TO service_role;

DO $$
BEGIN
  GRANT ALL ON TABLE public.signup_deny_networks TO supabase_auth_admin;
  GRANT USAGE, SELECT ON SEQUENCE public.signup_deny_networks_id_seq TO supabase_auth_admin;
EXCEPTION WHEN undefined_object THEN
  NULL;
END
$$;

INSERT INTO public.signup_deny_networks (cidr, reason)
VALUES ('185.227.153.36/32', 'Repeated credential theft and API abuse, 10-11 Sep 2026')
ON CONFLICT (cidr) DO NOTHING;

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
