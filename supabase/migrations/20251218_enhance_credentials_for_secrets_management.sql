-- Migration: Enhance credentials table for comprehensive secrets management
-- Adds encryption support, sync tracking, categories, and helper functions

-- ============================================================================
-- PART 1: ENSURE PASSWORD ENCRYPTION KEY EXISTS
-- ============================================================================

-- Create a function to get or create encryption key
-- This uses a system-level secret that should be set in Supabase Edge Function secrets
-- For now, we'll use a default key (should be changed in production)
CREATE OR REPLACE FUNCTION public.get_encryption_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- In production, this should read from a secure location
  -- For now, return a default key (MUST be changed in production)
  -- The key should be stored as SUPABASE_CREDENTIALS_ENCRYPTION_KEY in Edge Function secrets
  RETURN COALESCE(
    current_setting('app.encryption_key', true),
    'default-encryption-key-change-in-production-32chars!!'
  );
END;
$$;

-- ============================================================================
-- PART 2: ADD NEW COLUMNS TO CREDENTIALS TABLE
-- ============================================================================

ALTER TABLE public.credentials 
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'integration' CHECK (category IN ('integration', 'api_key', 'webhook', 'url', 'email', 'system', 'other')),
  ADD COLUMN IF NOT EXISTS sync_to_edge_function BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS encrypted_value BYTEA,
  ADD COLUMN IF NOT EXISTS requires_encryption BOOLEAN DEFAULT false;

-- Create index for category filtering
CREATE INDEX IF NOT EXISTS idx_credentials_category ON public.credentials(category);

-- ============================================================================
-- PART 3: ENCRYPTION/DECRYPTION FUNCTIONS
-- ============================================================================

-- Function to encrypt credential value
CREATE OR REPLACE FUNCTION public.encrypt_credential_value(
  p_value TEXT,
  p_encryption_key TEXT DEFAULT NULL
)
RETURNS BYTEA
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_key TEXT;
BEGIN
  v_key := COALESCE(p_encryption_key, public.get_encryption_key());
  
  -- Encrypt using pgcrypto
  RETURN pgp_sym_encrypt(p_value, v_key);
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Encryption failed: %', SQLERRM;
END;
$$;

-- Function to decrypt credential value
CREATE OR REPLACE FUNCTION public.decrypt_credential_value(
  p_encrypted_value BYTEA,
  p_encryption_key TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_key TEXT;
BEGIN
  v_key := COALESCE(p_encryption_key, public.get_encryption_key());
  
  -- Decrypt using pgcrypto
  RETURN pgp_sym_decrypt(p_encrypted_value, v_key);
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Decryption failed: %', SQLERRM;
END;
$$;

-- Function to get decrypted credential value (for staff only)
CREATE OR REPLACE FUNCTION public.get_credential_value(
  p_credential_key TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credential RECORD;
  v_decrypted_value TEXT;
BEGIN
  -- Check if user is staff
  IF NOT public.is_staff() THEN
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

-- ============================================================================
-- PART 4: TRIGGER TO AUTO-ENCRYPT SENSITIVE VALUES
-- ============================================================================

-- Trigger function to encrypt values when requires_encryption is true
CREATE OR REPLACE FUNCTION public.encrypt_credential_on_insert_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If encryption is required and value is provided, encrypt it
  IF NEW.requires_encryption AND NEW.credential_value IS NOT NULL AND NEW.credential_value != '' THEN
    -- Encrypt the value
    NEW.encrypted_value := public.encrypt_credential_value(NEW.credential_value);
    NEW.is_encrypted := true;
    -- Clear plain text value for security
    NEW.credential_value := '[ENCRYPTED]';
  ELSIF NOT NEW.requires_encryption THEN
    -- If encryption not required, clear encrypted value
    NEW.encrypted_value := NULL;
    NEW.is_encrypted := false;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS encrypt_credential_trigger ON public.credentials;
CREATE TRIGGER encrypt_credential_trigger
  BEFORE INSERT OR UPDATE ON public.credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.encrypt_credential_on_insert_update();

-- ============================================================================
-- PART 5: UPDATE RLS POLICIES (RESTRICT TO SUPERADMIN FOR SECRETS)
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Staff can read credentials" ON public.credentials;
DROP POLICY IF EXISTS "Staff can manage credentials" ON public.credentials;

-- Only superadmin can read credentials (more restrictive)
CREATE POLICY "Superadmin can read credentials" ON public.credentials
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'superadmin'
    )
  );

-- Only superadmin can manage credentials
CREATE POLICY "Superadmin can manage credentials" ON public.credentials
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'superadmin'
    )
  );

-- ============================================================================
-- PART 6: HELPER FUNCTION TO UPDATE SYNC STATUS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_credential_sync_status(
  p_credential_key TEXT,
  p_synced BOOLEAN DEFAULT true
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.credentials
  SET last_synced_at = CASE WHEN p_synced THEN NOW() ELSE last_synced_at END
  WHERE credential_key = p_credential_key;
END;
$$;

-- ============================================================================
-- PART 7: GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_encryption_key() TO authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_credential_value(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_credential_value(BYTEA, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_credential_value(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_credential_sync_status(TEXT, BOOLEAN) TO authenticated;

-- ============================================================================
-- PART 8: UPDATE COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.credentials.category IS 'Category of credential: integration, api_key, webhook, url, email, system, other';
COMMENT ON COLUMN public.credentials.sync_to_edge_function IS 'Whether this credential should be synced to Supabase Edge Function secrets';
COMMENT ON COLUMN public.credentials.last_synced_at IS 'Timestamp of last successful sync to Edge Function secrets';
COMMENT ON COLUMN public.credentials.encrypted_value IS 'Encrypted version of credential value (stored in BYTEA format)';
COMMENT ON COLUMN public.credentials.requires_encryption IS 'Whether this credential requires encryption (sensitive values)';

COMMENT ON FUNCTION public.get_credential_value(TEXT) IS 'Get decrypted credential value (staff only). Returns plain text value.';
COMMENT ON FUNCTION public.encrypt_credential_value(TEXT, TEXT) IS 'Encrypt a credential value using pgcrypto';
COMMENT ON FUNCTION public.decrypt_credential_value(BYTEA, TEXT) IS 'Decrypt a credential value using pgcrypto';

