-- Three Modules System: Maintenance, Housekeeping, and OTA Bookings
-- Phase 1: Core Schema - New Tables
-- This migration creates all new tables required for the three modules

BEGIN;

-- ============================================================================
-- PART 1: HOUSEKEEPING STATUS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.housekeeping_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('dirty', 'clean_pending_approval', 'clean', 'occupied', 'out_of_order')) DEFAULT 'clean',
  assigned_cleaner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_cleaned_at TIMESTAMPTZ,
  next_clean_due_at DATE, -- Default cleaning date (editable)
  approval_status TEXT CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(studio_id)
);

-- Indexes for housekeeping_status
CREATE INDEX IF NOT EXISTS idx_housekeeping_status_studio_id ON public.housekeeping_status(studio_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_status_status ON public.housekeeping_status(status);
CREATE INDEX IF NOT EXISTS idx_housekeeping_status_cleaner_id ON public.housekeeping_status(assigned_cleaner_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_status_approval ON public.housekeeping_status(approval_status) WHERE approval_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_housekeeping_status_next_clean ON public.housekeeping_status(next_clean_due_at) WHERE next_clean_due_at IS NOT NULL;

-- Updated_at trigger
CREATE TRIGGER housekeeping_status_updated_at
  BEFORE UPDATE ON public.housekeeping_status
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ============================================================================
-- PART 2: OUT OF ORDER RECORDS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.out_of_order_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  maintenance_request_id UUID REFERENCES public.maintenance_requests(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_end_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ, -- Actual end
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_blocking BOOLEAN NOT NULL DEFAULT true, -- Prevents OTA allocation
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for out_of_order_records
CREATE INDEX IF NOT EXISTS idx_out_of_order_studio_id ON public.out_of_order_records(studio_id);
CREATE INDEX IF NOT EXISTS idx_out_of_order_active ON public.out_of_order_records(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_out_of_order_dates ON public.out_of_order_records(start_at, expected_end_at);
CREATE INDEX IF NOT EXISTS idx_out_of_order_maintenance_request ON public.out_of_order_records(maintenance_request_id) WHERE maintenance_request_id IS NOT NULL;

-- Updated_at trigger
CREATE TRIGGER out_of_order_records_updated_at
  BEFORE UPDATE ON public.out_of_order_records
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ============================================================================
-- PART 3: OTA BOOKINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ota_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref TEXT NOT NULL, -- Booking reference from channel
  channel TEXT NOT NULL CHECK (channel IN ('airbnb', 'booking', 'agoda', 'expedia', 'other')),
  guest_name TEXT NOT NULL,
  guest_phone TEXT,
  guest_email TEXT,
  studio_id UUID REFERENCES public.studios(id) ON DELETE SET NULL, -- Nullable until allocated
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'arriving', 'expected_arrivals', 'pre_check_in', 'checked_in',
    'in_house_guest', 'day_use', 'checked_out', 'expected_departures',
    'departing', 'no_show', 'cancelled'
  )) DEFAULT 'arriving',
  notes TEXT,
  internal_notes TEXT, -- Staff-only notes
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(external_ref, channel)
);

-- Indexes for ota_bookings
CREATE INDEX IF NOT EXISTS idx_ota_bookings_studio_id ON public.ota_bookings(studio_id);
CREATE INDEX IF NOT EXISTS idx_ota_bookings_status ON public.ota_bookings(status);
CREATE INDEX IF NOT EXISTS idx_ota_bookings_dates ON public.ota_bookings(check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_ota_bookings_external_ref ON public.ota_bookings(external_ref, channel);
CREATE INDEX IF NOT EXISTS idx_ota_bookings_channel ON public.ota_bookings(channel);
CREATE INDEX IF NOT EXISTS idx_ota_bookings_check_in ON public.ota_bookings(check_in);
CREATE INDEX IF NOT EXISTS idx_ota_bookings_check_out ON public.ota_bookings(check_out);

-- Updated_at trigger
CREATE TRIGGER ota_bookings_updated_at
  BEFORE UPDATE ON public.ota_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ============================================================================
-- PART 4: ACTIVITY LOG TABLE (Shared)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- 'maintenance_request', 'housekeeping_status', 'ota_booking', 'out_of_order'
  entity_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'status_change', 'assignment', 'approval', 'rejection', 'created', 'updated', etc.
  from_status TEXT,
  to_status TEXT,
  message TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for activity_log
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON public.activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON public.activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_by ON public.activity_log(created_by);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON public.activity_log(action);

-- ============================================================================
-- PART 5: COMMENTS
-- ============================================================================

COMMENT ON TABLE public.housekeeping_status IS 'Tracks cleaning status per studio for housekeeping operations';
COMMENT ON TABLE public.out_of_order_records IS 'Tracks when studios are out of order due to maintenance or other issues';
COMMENT ON TABLE public.ota_bookings IS 'Manages OTA (Online Travel Agency) bookings from Airbnb, Booking.com, Agoda, etc.';
COMMENT ON TABLE public.activity_log IS 'Shared activity log for tracking changes across maintenance, housekeeping, and OTA bookings';

COMMIT;

