-- Allow Edge Functions (service role, no auth.uid()) to read credentials via get_credential_value
-- Previously only is_staff() was allowed; service role has no user so is_staff() was false.
CREATE OR REPLACE FUNCTION public.get_credential_value(
  p_credential_key TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credential RECORD;
  v_decrypted_value TEXT;
BEGIN
  -- Allow service role / backend (no user context) or staff
  IF auth.uid() IS NOT NULL AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'Access denied. Staff privileges required.';
  END IF;

  -- Get credential
  SELECT * INTO v_credential
  FROM public.credentials
  WHERE credential_key = p_credential_key;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Return decrypted value if encrypted, otherwise plain value
  IF v_credential.is_encrypted AND v_credential.encrypted_value IS NOT NULL THEN
    v_decrypted_value := public.decrypt_credential_value(v_credential.encrypted_value);
    RETURN v_decrypted_value;
  ELSE
    RETURN v_credential.credential_value;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_credential_value(TEXT) IS 'Get decrypted credential value. Allowed: service role (Edge Functions) or staff.';
