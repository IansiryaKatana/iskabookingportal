-- Migration: Add company name to branding settings and create credentials table
-- This migration adds company_name to branding_settings and creates a credentials table
-- for storing Resend API key and email address configurable via UI

-- ============================================================================
-- PART 1: ADD COMPANY NAME TO BRANDING SETTINGS
-- ============================================================================

INSERT INTO public.branding_settings (setting_key, setting_value, setting_type, description)
VALUES ('company_name', 'StudentStaySolutions', 'text', 'Company name used throughout the system (emails, invoices, UI)')
ON CONFLICT (setting_key) DO UPDATE 
SET setting_value = 'StudentStaySolutions', updated_at = NOW();

-- ============================================================================
-- PART 2: CREATE CREDENTIALS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_key TEXT NOT NULL UNIQUE,
  credential_value TEXT NOT NULL,
  credential_type TEXT NOT NULL DEFAULT 'api_key', -- 'api_key', 'email', 'url', etc.
  description TEXT,
  is_encrypted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credentials_key ON public.credentials(credential_key);

-- Add updated_at trigger
DROP TRIGGER IF EXISTS set_timestamp_credentials ON public.credentials;
CREATE TRIGGER set_timestamp_credentials
BEFORE UPDATE ON public.credentials
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ============================================================================
-- PART 3: RLS POLICIES FOR CREDENTIALS
-- ============================================================================

ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;

-- Only staff can read credentials
DROP POLICY IF EXISTS "Staff can read credentials" ON public.credentials;
CREATE POLICY "Staff can read credentials" ON public.credentials
  FOR SELECT USING (public.is_staff());

-- Only staff can manage credentials
DROP POLICY IF EXISTS "Staff can manage credentials" ON public.credentials;
CREATE POLICY "Staff can manage credentials" ON public.credentials
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ============================================================================
-- PART 4: SEED INITIAL CREDENTIALS
-- ============================================================================

INSERT INTO public.credentials (credential_key, credential_value, credential_type, description)
VALUES 
  ('resend_api_key', 're_gcj52aRb_2eypA1m8LimGo7bUZPfYdSSC', 'api_key', 'Resend API key for sending emails'),
  ('resend_from_email', 'noreply@send.portal.iankatana.com', 'email', 'Default from email address for Resend')
ON CONFLICT (credential_key) DO UPDATE 
SET credential_value = EXCLUDED.credential_value, updated_at = NOW();

-- ============================================================================
-- PART 5: GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credentials TO authenticated;

-- ============================================================================
-- PART 6: COMMENTS
-- ============================================================================

COMMENT ON TABLE public.credentials IS 'Stores API keys and credentials configurable via admin UI. Secured with RLS policies.';
COMMENT ON COLUMN public.credentials.credential_key IS 'Unique key identifier (e.g., resend_api_key)';
COMMENT ON COLUMN public.credentials.credential_value IS 'The actual credential value (API key, email, etc.)';
COMMENT ON COLUMN public.credentials.is_encrypted IS 'Flag indicating if value is encrypted (future enhancement)';

