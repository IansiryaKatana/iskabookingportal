-- Three Modules System: Cross-Module Trigger Functions
-- Phase 6: Trigger functions for syncing data between modules

BEGIN;

-- ============================================================================
-- PART 1: OUT OF ORDER → HOUSEKEEPING SYNC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_out_of_order_to_housekeeping()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    -- Set housekeeping status to out_of_order
    INSERT INTO public.housekeeping_status (studio_id, status)
    VALUES (NEW.studio_id, 'out_of_order')
    ON CONFLICT (studio_id) 
    DO UPDATE SET 
      status = 'out_of_order', 
      updated_at = NOW();
    
    -- Log activity
    INSERT INTO public.activity_log (entity_type, entity_id, action, message, created_by)
    VALUES (
      'out_of_order',
      NEW.id,
      'status_change',
      'Studio marked out of order: ' || NEW.reason,
      NEW.created_by
    );
  ELSE
    -- Out of order closed - restore to clean if no other status applies
    UPDATE public.housekeeping_status
    SET 
      status = CASE
        -- Check if there's an active OTA booking that should set it to occupied
        WHEN EXISTS (
          SELECT 1 FROM public.ota_bookings ob
          WHERE ob.studio_id = NEW.studio_id
            AND ob.status IN ('checked_in', 'in_house_guest', 'day_use')
        ) THEN 'occupied'
        -- Otherwise default to clean
        ELSE 'clean'
      END,
      updated_at = NOW()
    WHERE studio_id = NEW.studio_id AND status = 'out_of_order';
    
    -- Log activity
    INSERT INTO public.activity_log (entity_type, entity_id, action, message, created_by)
    VALUES (
      'out_of_order',
      NEW.id,
      'status_change',
      'Studio out of order record closed',
      auth.uid()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sync_out_of_order_housekeeping
  AFTER INSERT OR UPDATE ON public.out_of_order_records
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_out_of_order_to_housekeeping();

-- ============================================================================
-- PART 2: OTA BOOKING → HOUSEKEEPING SYNC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_ota_status_to_housekeeping()
RETURNS TRIGGER AS $$
DECLARE
  is_out_of_order BOOLEAN;
  should_sync BOOLEAN := false;
BEGIN
  -- Check if studio is out of order (out of order takes precedence)
  SELECT EXISTS (
    SELECT 1 FROM public.out_of_order_records ooor
    WHERE ooor.studio_id = NEW.studio_id
      AND ooor.is_active = true
  ) INTO is_out_of_order;
  
  -- Determine if we should sync
  -- For INSERT: Always sync if studio_id is set
  -- For UPDATE: Only sync if status or studio_id changed
  IF TG_OP = 'INSERT' THEN
    should_sync := NEW.studio_id IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    should_sync := NEW.studio_id IS NOT NULL 
      AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.studio_id IS DISTINCT FROM NEW.studio_id);
  END IF;
  
  -- Only sync if conditions met and not out of order
  IF should_sync AND NOT is_out_of_order THEN
    IF NEW.status IN ('checked_in', 'in_house_guest', 'day_use') THEN
      -- Guest is in house - set to occupied
      INSERT INTO public.housekeeping_status (studio_id, status)
      VALUES (NEW.studio_id, 'occupied')
      ON CONFLICT (studio_id)
      DO UPDATE SET 
        status = 'occupied', 
        updated_at = NOW();
      
      -- Log activity (only on INSERT or status change)
      IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.activity_log (entity_type, entity_id, action, to_status, message, created_by)
        VALUES (
          'ota_booking',
          NEW.id,
          'status_change',
          NEW.status,
          'OTA booking status changed to ' || NEW.status,
          COALESCE(auth.uid(), NEW.created_by)
        );
      END IF;
      
    ELSIF NEW.status = 'checked_out' THEN
      -- Guest checked out - set to dirty
      INSERT INTO public.housekeeping_status (studio_id, status)
      VALUES (NEW.studio_id, 'dirty')
      ON CONFLICT (studio_id)
      DO UPDATE SET 
        status = 'dirty', 
        updated_at = NOW();
      
      -- Log activity (only on INSERT or status change)
      IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.activity_log (entity_type, entity_id, action, to_status, message, created_by)
        VALUES (
          'ota_booking',
          NEW.id,
          'status_change',
          'checked_out',
          'OTA guest checked out - studio marked dirty',
          COALESCE(auth.uid(), NEW.created_by)
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Separate triggers for INSERT and UPDATE (INSERT can't reference OLD)
CREATE TRIGGER sync_ota_housekeeping_insert
  AFTER INSERT ON public.ota_bookings
  FOR EACH ROW
  WHEN (NEW.studio_id IS NOT NULL)
  EXECUTE FUNCTION public.sync_ota_status_to_housekeeping();

CREATE TRIGGER sync_ota_housekeeping_update
  AFTER UPDATE ON public.ota_bookings
  FOR EACH ROW
  WHEN (NEW.studio_id IS NOT NULL AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.studio_id IS DISTINCT FROM NEW.studio_id))
  EXECUTE FUNCTION public.sync_ota_status_to_housekeeping();

-- ============================================================================
-- PART 3: MAINTENANCE REQUEST ACTIVITY LOG
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_maintenance_request_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Log status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.activity_log (entity_type, entity_id, action, from_status, to_status, message, created_by)
    VALUES (
      'maintenance_request',
      NEW.id,
      'status_change',
      OLD.status,
      NEW.status,
      'Status changed from ' || COALESCE(OLD.status, 'null') || ' to ' || NEW.status,
      auth.uid()
    );
  END IF;
  
  -- Log assignment changes
  IF OLD.assigned_to_user_id IS DISTINCT FROM NEW.assigned_to_user_id THEN
    INSERT INTO public.activity_log (entity_type, entity_id, action, message, created_by)
    VALUES (
      'maintenance_request',
      NEW.id,
      'assignment',
      CASE
        WHEN NEW.assigned_to_user_id IS NULL THEN 'Unassigned'
        ELSE 'Assigned to maintenance officer'
      END,
      auth.uid()
    );
  END IF;
  
  -- Log approval actions
  IF OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    INSERT INTO public.activity_log (entity_type, entity_id, action, message, created_by)
    VALUES (
      'maintenance_request',
      NEW.id,
      CASE NEW.approval_status
        WHEN 'approved' THEN 'approval'
        WHEN 'rejected' THEN 'rejection'
        ELSE 'approval_status_change'
      END,
      'Approval status: ' || NEW.approval_status,
      auth.uid()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER log_maintenance_activity
  AFTER UPDATE ON public.maintenance_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.log_maintenance_request_activity();

-- ============================================================================
-- PART 4: HOUSEKEEPING STATUS ACTIVITY LOG
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_housekeeping_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Log status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.activity_log (entity_type, entity_id, action, from_status, to_status, message, created_by)
    VALUES (
      'housekeeping_status',
      NEW.id,
      'status_change',
      OLD.status,
      NEW.status,
      'Clean status changed from ' || COALESCE(OLD.status, 'null') || ' to ' || NEW.status,
      auth.uid()
    );
  END IF;
  
  -- Log assignment changes
  IF OLD.assigned_cleaner_id IS DISTINCT FROM NEW.assigned_cleaner_id THEN
    INSERT INTO public.activity_log (entity_type, entity_id, action, message, created_by)
    VALUES (
      'housekeeping_status',
      NEW.id,
      'assignment',
      CASE
        WHEN NEW.assigned_cleaner_id IS NULL THEN 'Cleaner unassigned'
        ELSE 'Cleaner assigned'
      END,
      auth.uid()
    );
  END IF;
  
  -- Log approval actions
  IF OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    INSERT INTO public.activity_log (entity_type, entity_id, action, message, created_by)
    VALUES (
      'housekeeping_status',
      NEW.id,
      CASE NEW.approval_status
        WHEN 'approved' THEN 'approval'
        WHEN 'rejected' THEN 'rejection'
        ELSE 'approval_status_change'
      END,
      'Clean status approval: ' || NEW.approval_status,
      auth.uid()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER log_housekeeping_activity
  AFTER UPDATE ON public.housekeeping_status
  FOR EACH ROW
  EXECUTE FUNCTION public.log_housekeeping_activity();

COMMIT;

