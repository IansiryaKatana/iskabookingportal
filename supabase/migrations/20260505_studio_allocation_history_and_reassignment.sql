-- Studio allocation history + safe reassignment RPCs
-- Adds:
-- 1) Effective-dated allocation history table
-- 2) Pre-check RPC for OTA conflict visibility
-- 3) Transactional reassignment RPC with policy support (keep/move)

BEGIN;

CREATE TABLE IF NOT EXISTS public.studio_allocation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  previous_allocation TEXT,
  new_allocation TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  policy TEXT,
  impacted_ota_bookings_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_allocation_history_studio_id
  ON public.studio_allocation_history(studio_id, starts_at DESC);

CREATE INDEX IF NOT EXISTS idx_studio_allocation_history_open
  ON public.studio_allocation_history(studio_id)
  WHERE ends_at IS NULL;

ALTER TABLE public.studio_allocation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage studio allocation history" ON public.studio_allocation_history;
CREATE POLICY "Staff manage studio allocation history"
  ON public.studio_allocation_history
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('staff', 'admin', 'superadmin', 'operations_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('staff', 'admin', 'superadmin', 'operations_manager')
    )
  );

-- Seed timeline with current studio allocations where absent.
INSERT INTO public.studio_allocation_history (
  studio_id,
  previous_allocation,
  new_allocation,
  starts_at,
  changed_by,
  reason,
  policy,
  metadata
)
SELECT
  s.id,
  NULL,
  s.allocation,
  COALESCE(s.updated_at, s.created_at, NOW()),
  NULL,
  'Initial snapshot',
  'seed',
  jsonb_build_object('seeded', true)
FROM public.studios s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.studio_allocation_history h
  WHERE h.studio_id = s.id
);

CREATE OR REPLACE FUNCTION public.preview_studio_allocation_change(
  p_studio_id UUID,
  p_new_allocation TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_current_allocation TEXT;
  v_conflict_count INTEGER := 0;
BEGIN
  SELECT allocation
  INTO v_current_allocation
  FROM public.studios
  WHERE id = p_studio_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Studio not found';
  END IF;

  IF v_current_allocation = 'OTA' AND COALESCE(p_new_allocation, '') <> 'OTA' THEN
    SELECT COUNT(*)
    INTO v_conflict_count
    FROM public.ota_bookings ob
    WHERE ob.studio_id = p_studio_id
      AND ob.status NOT IN ('cancelled', 'no_show')
      AND ob.check_out >= CURRENT_DATE;
  END IF;

  RETURN jsonb_build_object(
    'studio_id', p_studio_id,
    'current_allocation', v_current_allocation,
    'new_allocation', p_new_allocation,
    'future_ota_bookings', v_conflict_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_studio_allocation_change(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.reassign_studio_allocation(
  p_studio_id UUID,
  p_new_allocation TEXT,
  p_policy TEXT DEFAULT 'keep',
  p_reason TEXT DEFAULT NULL,
  p_target_studio_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_current_allocation TEXT;
  v_impacted_ota_bookings INTEGER := 0;
  v_moved_ota_bookings INTEGER := 0;
  v_target_allocation TEXT;
  v_user_id UUID := auth.uid();
BEGIN
  IF p_new_allocation IS DISTINCT FROM NULL
    AND p_new_allocation NOT IN ('Student', 'OTA', 'Keyworkers') THEN
    RAISE EXCEPTION 'Invalid allocation value: %', p_new_allocation;
  END IF;

  IF p_policy NOT IN ('keep', 'move') THEN
    RAISE EXCEPTION 'Invalid policy: %. Allowed: keep, move', p_policy;
  END IF;

  SELECT allocation
  INTO v_current_allocation
  FROM public.studios
  WHERE id = p_studio_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Studio not found';
  END IF;

  SELECT COUNT(*)
  INTO v_impacted_ota_bookings
  FROM public.ota_bookings ob
  WHERE ob.studio_id = p_studio_id
    AND ob.status NOT IN ('cancelled', 'no_show')
    AND ob.check_out >= CURRENT_DATE;

  -- Optional move policy for OTA -> non-OTA transitions.
  IF v_current_allocation = 'OTA'
    AND COALESCE(p_new_allocation, '') <> 'OTA'
    AND v_impacted_ota_bookings > 0
    AND p_policy = 'move' THEN
    IF p_target_studio_id IS NULL THEN
      RAISE EXCEPTION 'Target OTA studio is required when policy is move';
    END IF;

    IF p_target_studio_id = p_studio_id THEN
      RAISE EXCEPTION 'Target OTA studio must be different from source studio';
    END IF;

    SELECT allocation
    INTO v_target_allocation
    FROM public.studios
    WHERE id = p_target_studio_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target OTA studio not found';
    END IF;

    IF v_target_allocation IS DISTINCT FROM 'OTA' THEN
      RAISE EXCEPTION 'Target studio must currently be allocated to OTA';
    END IF;

    -- Prevent move if target has overlapping active OTA bookings.
    IF EXISTS (
      SELECT 1
      FROM public.ota_bookings src
      JOIN public.ota_bookings tgt
        ON tgt.studio_id = p_target_studio_id
       AND tgt.status NOT IN ('cancelled', 'no_show')
       AND src.status NOT IN ('cancelled', 'no_show')
       AND src.studio_id = p_studio_id
       AND src.check_out >= CURRENT_DATE
       AND src.check_in < tgt.check_out
       AND src.check_out > tgt.check_in
    ) THEN
      RAISE EXCEPTION 'Target OTA studio has overlapping active bookings';
    END IF;

    UPDATE public.ota_bookings
    SET studio_id = p_target_studio_id
    WHERE studio_id = p_studio_id
      AND status NOT IN ('cancelled', 'no_show')
      AND check_out >= CURRENT_DATE;

    GET DIAGNOSTICS v_moved_ota_bookings = ROW_COUNT;
  END IF;

  UPDATE public.studios
  SET allocation = p_new_allocation
  WHERE id = p_studio_id;

  -- Close previous open timeline row.
  UPDATE public.studio_allocation_history
  SET ends_at = NOW()
  WHERE studio_id = p_studio_id
    AND ends_at IS NULL;

  INSERT INTO public.studio_allocation_history (
    studio_id,
    previous_allocation,
    new_allocation,
    starts_at,
    changed_by,
    reason,
    policy,
    impacted_ota_bookings_count,
    metadata
  ) VALUES (
    p_studio_id,
    v_current_allocation,
    p_new_allocation,
    NOW(),
    v_user_id,
    p_reason,
    p_policy,
    v_impacted_ota_bookings,
    jsonb_build_object(
      'moved_ota_bookings', v_moved_ota_bookings,
      'target_studio_id', p_target_studio_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'studio_id', p_studio_id,
    'previous_allocation', v_current_allocation,
    'new_allocation', p_new_allocation,
    'impacted_ota_bookings', v_impacted_ota_bookings,
    'moved_ota_bookings', v_moved_ota_bookings,
    'policy', p_policy
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign_studio_allocation(UUID, TEXT, TEXT, TEXT, UUID) TO authenticated;

COMMIT;
