-- Three Modules System: Update Maintenance Requests Table
-- Phase 2: Enhance maintenance_requests with new workflow fields

BEGIN;

-- ============================================================================
-- PART 1: ADD NEW COLUMNS TO maintenance_requests
-- ============================================================================

-- Add category column (maps to request_type but more specific)
ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('plumbing', 'electrical', 'internet_wifi', 'furniture', 'appliance', 'hvac', 'bathroom', 'kitchen', 'other'));

-- Add urgency column (rename/expand from priority)
ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS urgency TEXT CHECK (urgency IN ('low', 'medium', 'high', 'emergency')) DEFAULT 'medium';

-- Add assigned_to_user_id column
ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add approval fields
ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS completion_note TEXT,
  ADD COLUMN IF NOT EXISTS approval_status TEXT CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Add SLA tracking
ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ;

-- ============================================================================
-- PART 2: UPDATE STATUS CONSTRAINT (Allow new statuses alongside old ones)
-- ============================================================================

-- Drop existing check constraint if it exists (we'll recreate with expanded values)
ALTER TABLE public.maintenance_requests
  DROP CONSTRAINT IF EXISTS maintenance_requests_status_check;

-- Add new constraint with both old and new status values (for backward compatibility)
ALTER TABLE public.maintenance_requests
  ADD CONSTRAINT maintenance_requests_status_check 
  CHECK (status IN (
    -- Old statuses (for backward compatibility)
    'pending', 'in_progress', 'resolved', 'cancelled',
    -- New statuses
    'new', 'triaged', 'assigned', 'completed_pending_approval', 'rework_required'
  ));

-- ============================================================================
-- PART 3: POPULATE NEW FIELDS FROM EXISTING DATA
-- ============================================================================

-- Map existing priority to urgency
UPDATE public.maintenance_requests
SET urgency = CASE
  WHEN priority = 'low' THEN 'low'
  WHEN priority = 'normal' THEN 'medium'
  WHEN priority = 'high' THEN 'high'
  WHEN priority = 'urgent' THEN 'emergency'
  ELSE 'medium'
END
WHERE urgency IS NULL;

-- Map request_type to category (where applicable)
UPDATE public.maintenance_requests
SET category = CASE
  WHEN request_type = 'maintenance' THEN 'other' -- Default, can be updated manually
  WHEN request_type = 'cleaning' THEN 'other'
  WHEN request_type = 'general' THEN 'other'
  WHEN request_type = 'other' THEN 'other'
  ELSE 'other'
END
WHERE category IS NULL;

-- Set approval_status for resolved requests
UPDATE public.maintenance_requests
SET approval_status = 'approved'
WHERE status = 'resolved' AND resolved_by IS NOT NULL AND approval_status IS NULL;

-- ============================================================================
-- PART 4: ADD INDEXES FOR NEW FIELDS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_maintenance_requests_category ON public.maintenance_requests(category);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_urgency ON public.maintenance_requests(urgency);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_assigned_to ON public.maintenance_requests(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_approval_status ON public.maintenance_requests(approval_status) WHERE approval_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_sla_due_at ON public.maintenance_requests(sla_due_at) WHERE sla_due_at IS NOT NULL;

-- ============================================================================
-- PART 5: COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.maintenance_requests.category IS 'Specific category: plumbing, electrical, internet_wifi, furniture, appliance, hvac, bathroom, kitchen, other';
COMMENT ON COLUMN public.maintenance_requests.urgency IS 'Urgency level: low, medium, high, emergency';
COMMENT ON COLUMN public.maintenance_requests.assigned_to_user_id IS 'Maintenance officer assigned to handle this request';
COMMENT ON COLUMN public.maintenance_requests.completion_note IS 'Notes from maintenance officer when marking as complete';
COMMENT ON COLUMN public.maintenance_requests.approval_status IS 'Approval status when status is completed_pending_approval';
COMMENT ON COLUMN public.maintenance_requests.sla_due_at IS 'SLA deadline based on urgency level';

COMMIT;

