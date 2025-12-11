-- Function to set user password
-- 
-- IMPORTANT: The recommended way to set passwords in Supabase is via the Admin API:
--   supabaseAdmin.auth.admin.updateUserById(userId, { password: 'newpassword' })
--
-- This SQL function is provided as an alternative, but note that Supabase may use
-- a specific password hashing format. For production use, prefer the Admin API.
--
-- Usage:
-- SELECT set_user_password('user@example.com', 'newpassword123');
-- OR
-- SELECT set_user_password_by_id('user-uuid-here', 'newpassword123');

CREATE OR REPLACE FUNCTION public.set_user_password(
  p_email TEXT,
  p_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_encrypted_password TEXT;
BEGIN
  -- Find user by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = LOWER(p_email)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', p_email;
  END IF;

  -- Use Supabase's crypt function to hash the password
  -- Note: This requires the pgcrypto extension
  v_encrypted_password := crypt(p_password, gen_salt('bf'));

  -- Update the password in auth.users
  UPDATE auth.users
  SET 
    encrypted_password = v_encrypted_password,
    updated_at = NOW()
  WHERE id = v_user_id;

  RETURN TRUE;
END;
$$;

-- Function to set password by user ID
CREATE OR REPLACE FUNCTION public.set_user_password_by_id(
  p_user_id UUID,
  p_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_encrypted_password TEXT;
BEGIN
  -- Check if user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User with ID % not found', p_user_id;
  END IF;

  -- Use Supabase's crypt function to hash the password
  v_encrypted_password := crypt(p_password, gen_salt('bf'));

  -- Update the password in auth.users
  UPDATE auth.users
  SET 
    encrypted_password = v_encrypted_password,
    updated_at = NOW()
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;

-- Grant execute permissions to authenticated users (adjust as needed)
-- You may want to restrict this to superadmin only
GRANT EXECUTE ON FUNCTION public.set_user_password(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_password_by_id(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.set_user_password IS 
  'Sets a user password by email. Requires pgcrypto extension. Usage: SELECT set_user_password(''user@example.com'', ''newpassword'');';

COMMENT ON FUNCTION public.set_user_password_by_id IS 
  'Sets a user password by user ID. Requires pgcrypto extension. Usage: SELECT set_user_password_by_id(''uuid-here'', ''newpassword'');';

