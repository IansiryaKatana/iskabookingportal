-- Three Modules System: Migrate Maintenance Request Statuses
-- Phase 8: Gradually migrate existing statuses to new workflow

BEGIN;

-- ============================================================================
-- PART 1: MIGRATE STATUS VALUES (Gradual - keeping old statuses valid)
-- ============================================================================

-- Map existing 'pending' status to 'new' (but keep pending valid for backward compatibility)
-- We'll update the data, but the constraint allows both old and new values
UPDATE public.maintenance_requests
SET status = 'new'
WHERE status = 'pending'
  AND created_at > NOW() - INTERVAL '30 days'; -- Only recent pending requests

-- Note: Older 'pending' requests can remain as 'pending' for backward compatibility
-- New UI will handle both 'pending' and 'new' as the same thing

-- ============================================================================
-- PART 2: SET SLA_DUE_AT BASED ON URGENCY (For new requests going forward)
-- ============================================================================

-- Calculate SLA due dates based on urgency
-- Emergency: 4 hours, High: 24 hours, Medium: 48 hours, Low: 7 days
UPDATE public.maintenance_requests
SET sla_due_at = CASE
  WHEN urgency = 'emergency' THEN created_at + INTERVAL '4 hours'
  WHEN urgency = 'high' THEN created_at + INTERVAL '24 hours'
  WHEN urgency = 'medium' THEN created_at + INTERVAL '48 hours'
  WHEN urgency = 'low' THEN created_at + INTERVAL '7 days'
  ELSE created_at + INTERVAL '48 hours' -- Default to medium
END
WHERE sla_due_at IS NULL
  AND status NOT IN ('resolved', 'cancelled');

-- ============================================================================
-- PART 3: CREATE INITIAL ACTIVITY LOG ENTRIES FOR EXISTING REQUESTS
-- ============================================================================

-- Create initial activity log entry for existing maintenance requests
INSERT INTO public.activity_log (entity_type, entity_id, action, to_status, message, created_at)
SELECT 
  'maintenance_request',
  id,
  'created',
  status,
  'Maintenance request created: ' || title,
  created_at
FROM public.maintenance_requests
WHERE NOT EXISTS (
  SELECT 1 FROM public.activity_log al
  WHERE al.entity_type = 'maintenance_request'
    AND al.entity_id = maintenance_requests.id
    AND al.action = 'created'
);

COMMIT;

