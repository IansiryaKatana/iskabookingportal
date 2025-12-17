-- Fix Concurrent Race Conditions
-- This migration adds atomic database functions to prevent race conditions
-- in studio reservations and partner account registration

-- ============================================================================
-- PART 1: ATOMIC STUDIO RESERVATION FUNCTION
-- ============================================================================

-- Create atomic function for studio reservation with row-level locking
CREATE OR REPLACE FUNCTION public.reserve_studio_atomic(
  p_studio_id UUID,
  p_application_id UUID,
  p_student_id UUID,
  p_reservation_duration_minutes INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_expiry TIMESTAMPTZ;
  v_studio_status TEXT;
  v_studio_allocation TEXT;
  v_reservation_expires_at TIMESTAMPTZ;
  v_result JSONB;
  v_updated_rows INTEGER;
BEGIN
  -- Calculate expiry time
  v_expiry := NOW() + (p_reservation_duration_minutes || ' minutes')::INTERVAL;
  
  -- Lock the studio row and check its current state (atomic operation)
  SELECT 
    status,
    allocation,
    reservation_expires_at
  INTO 
    v_studio_status,
    v_studio_allocation,
    v_reservation_expires_at
  FROM public.studios
  WHERE id = p_studio_id
  FOR UPDATE; -- Row-level lock prevents concurrent modifications
  
  -- Check if studio exists
  IF v_studio_status IS NULL THEN
    RAISE EXCEPTION 'Studio not found';
  END IF;
  
  -- Check if studio is available or has expired reservation
  -- Studio is available if:
  -- 1. Status is 'available' AND allocation is NULL or 'Student'
  -- 2. Status is 'reserved' BUT reservation has expired
  IF NOT (
    (v_studio_status = 'available' AND (v_studio_allocation IS NULL OR v_studio_allocation = 'Student'))
    OR (v_studio_status = 'reserved' AND v_reservation_expires_at IS NOT NULL AND v_reservation_expires_at < NOW())
  ) THEN
    RAISE EXCEPTION 'Studio is not available for reservation. It may be occupied, in maintenance, or already reserved by another student.';
  END IF;
  
  -- Release any expired reservation first (if status is reserved but expired)
  IF v_studio_status = 'reserved' AND v_reservation_expires_at IS NOT NULL AND v_reservation_expires_at < NOW() THEN
    UPDATE public.studios
    SET 
      status = 'available',
      reservation_expires_at = NULL,
      allocation = NULL
    WHERE id = p_studio_id;
  END IF;
  
  -- Reserve the studio (atomic update)
  UPDATE public.studios
  SET 
    status = 'reserved',
    reservation_expires_at = v_expiry,
    allocation = p_student_id::TEXT
  WHERE id = p_studio_id
    AND (
      status = 'available' 
      OR (status = 'reserved' AND reservation_expires_at IS NOT NULL AND reservation_expires_at < NOW())
    );
  
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  
  -- Check if update succeeded
  IF v_updated_rows = 0 THEN
    RAISE EXCEPTION 'Studio reservation failed. The studio may have been reserved by another student just now.';
  END IF;
  
  -- Update application (in same transaction)
  UPDATE public.student_applications
  SET 
    assigned_studio_id = p_studio_id,
    reserved_studio_expires_at = v_expiry
  WHERE id = p_application_id;
  
  IF NOT FOUND THEN
    -- Rollback studio reservation if application update fails
    UPDATE public.studios
    SET 
      status = 'available',
      reservation_expires_at = NULL,
      allocation = NULL
    WHERE id = p_studio_id;
    
    RAISE EXCEPTION 'Application not found. Studio reservation has been released.';
  END IF;
  
  -- Return success result
  v_result := jsonb_build_object(
    'success', true,
    'studio_id', p_studio_id,
    'expiry', v_expiry,
    'message', 'Studio reserved successfully'
  );
  
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    -- Return error in JSON format
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'studio_id', p_studio_id
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.reserve_studio_atomic(UUID, UUID, UUID, INTEGER) TO authenticated, anon;

COMMENT ON FUNCTION public.reserve_studio_atomic(UUID, UUID, UUID, INTEGER) IS 
'Atomically reserves a studio for a student application. Uses row-level locking to prevent race conditions when multiple students try to reserve the same studio simultaneously. Returns JSONB with success status and details.';

-- ============================================================================
-- PART 2: ATOMIC PARTNER ACCOUNT LINKING FUNCTION
-- ============================================================================

-- Replace link_partner_account with atomic version using row-level locking
CREATE OR REPLACE FUNCTION public.link_partner_account(
  p_referral_code TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_partner_id UUID;
  v_updated_rows INTEGER;
BEGIN
  -- Normalize referral code
  p_referral_code := UPPER(TRIM(p_referral_code));
  
  -- Find partner by referral code and lock the row (atomic operation)
  SELECT id INTO v_partner_id
  FROM public.partners
  WHERE UPPER(TRIM(referral_code)) = p_referral_code
    AND is_active = true
  FOR UPDATE; -- Row-level lock prevents concurrent linking attempts
  
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid referral code. Please check and try again.';
  END IF;
  
  -- Atomic update: only succeeds if partner_id is not already linked to another account
  -- This prevents race conditions by checking and updating in a single operation
  UPDATE public.profiles
  SET 
    role = 'partner',
    partner_id = v_partner_id
  WHERE id = p_user_id
    AND (
      -- Allow if not linked to any partner
      partner_id IS NULL
      -- Or allow re-linking to the same partner (idempotent)
      OR partner_id = v_partner_id
    )
    -- Critical: Ensure no other profile is linked to this partner
    AND NOT EXISTS (
      SELECT 1 
      FROM public.profiles p2
      WHERE p2.partner_id = v_partner_id 
        AND p2.id != p_user_id
    );
  
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  
  IF v_updated_rows = 0 THEN
    -- Check if user profile exists
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
      RAISE EXCEPTION 'User profile not found.';
    END IF;
    
    -- Check if already linked to this partner (idempotent case)
    IF EXISTS (
      SELECT 1 
      FROM public.profiles 
      WHERE id = p_user_id 
        AND partner_id = v_partner_id
    ) THEN
      -- Already linked to this partner - return success (idempotent)
      RETURN TRUE;
    END IF;
    
    -- Must be already linked to another partner or another account is linked
    RAISE EXCEPTION 'This referral code is already linked to another account. Please contact admin.';
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Function signature unchanged, so no need to re-grant (already granted)
COMMENT ON FUNCTION public.link_partner_account(TEXT, UUID) IS 
'Atomically links a partner user account to a referral code. Uses row-level locking to prevent race conditions when multiple users try to link to the same referral code simultaneously. Only one partner account can be linked to each referral code.';

-- ============================================================================
-- PART 3: RELEASE STUDIO FUNCTION (Keep existing, but ensure it's safe)
-- ============================================================================

-- The existing release logic is already safe, but we can add a helper function
-- for consistency if needed. For now, keeping the existing implementation.

