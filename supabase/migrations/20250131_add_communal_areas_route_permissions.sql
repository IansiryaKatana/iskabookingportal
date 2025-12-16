-- Add Route Permissions for Communal Areas
-- Communal Areas management and dashboard routes

BEGIN;

-- Insert route permissions for communal areas
INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  -- Communal Areas (All housekeeping roles)
  ('/housekeeping/communal-areas', 'Communal Areas', 'staff', true),
  ('/housekeeping/communal-areas', 'Communal Areas', 'superadmin', true),
  ('/housekeeping/communal-areas', 'Communal Areas', 'admin', true),
  ('/housekeeping/communal-areas', 'Communal Areas', 'operations_manager', true),
  ('/housekeeping/communal-areas', 'Communal Areas', 'housekeeper', true)
ON CONFLICT (route_path, role) DO UPDATE
SET allowed = EXCLUDED.allowed,
    updated_at = NOW();

-- Remove old dashboard route permissions if they exist
DELETE FROM public.route_permissions 
WHERE route_path = '/housekeeping/communal-areas/dashboard';

COMMIT;

