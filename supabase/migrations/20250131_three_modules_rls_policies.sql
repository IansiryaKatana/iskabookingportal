-- Three Modules System: RLS Policies
-- Phase 5: Row Level Security policies for all new tables

BEGIN;

-- ============================================================================
-- PART 1: HOUSEKEEPING_STATUS RLS POLICIES
-- ============================================================================

ALTER TABLE public.housekeeping_status ENABLE ROW LEVEL SECURITY;

-- Students: Read-only access to their studio (if they have an active application)
CREATE POLICY "Students view own studio housekeeping" ON public.housekeeping_status
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.assigned_studio_id = housekeeping_status.studio_id
        AND sa.student_id = auth.uid()
        AND sa.status = 'confirmed'
    )
  );

-- Staff: Full access
CREATE POLICY "Staff manage housekeeping" ON public.housekeeping_status
  FOR ALL USING (public.is_staff());

-- ============================================================================
-- PART 2: OUT_OF_ORDER_RECORDS RLS POLICIES
-- ============================================================================

ALTER TABLE public.out_of_order_records ENABLE ROW LEVEL SECURITY;

-- Students: Read-only access to their studio
CREATE POLICY "Students view own studio out of order" ON public.out_of_order_records
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.assigned_studio_id = out_of_order_records.studio_id
        AND sa.student_id = auth.uid()
        AND sa.status = 'confirmed'
    )
  );

-- Staff: Full access
CREATE POLICY "Staff manage out of order" ON public.out_of_order_records
  FOR ALL USING (public.is_staff());

-- ============================================================================
-- PART 3: OTA_BOOKINGS RLS POLICIES
-- ============================================================================

ALTER TABLE public.ota_bookings ENABLE ROW LEVEL SECURITY;

-- Students: No access (OTA bookings are staff-only)
-- This is intentional - students don't need to see OTA bookings

-- Staff: Full access
CREATE POLICY "Staff manage ota bookings" ON public.ota_bookings
  FOR ALL USING (public.is_staff());

-- ============================================================================
-- PART 4: ACTIVITY_LOG RLS POLICIES
-- ============================================================================

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Students: Read-only access to their own maintenance requests
CREATE POLICY "Students view own activity log" ON public.activity_log
  FOR SELECT USING (
    (entity_type = 'maintenance_request' AND EXISTS (
      SELECT 1 FROM public.maintenance_requests mr
      WHERE mr.id = activity_log.entity_id
        AND mr.student_id = auth.uid()
    ))
  );

-- Staff: Full access
CREATE POLICY "Staff manage activity log" ON public.activity_log
  FOR ALL USING (public.is_staff());

-- ============================================================================
-- PART 5: GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.housekeeping_status TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.out_of_order_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ota_bookings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_log TO authenticated;

COMMIT;

