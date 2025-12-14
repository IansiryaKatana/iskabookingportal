-- Add OTA Finance Route Permissions
-- Adds permissions for the new OTA Finance page

BEGIN;

INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  -- OTA Finance
  ('/ota-bookings/finance', 'OTA Finance', 'staff', true),
  ('/ota-bookings/finance', 'OTA Finance', 'superadmin', true),
  ('/ota-bookings/finance', 'OTA Finance', 'admin', true),
  ('/ota-bookings/finance', 'OTA Finance', 'operations_manager', true),
  ('/ota-bookings/finance', 'OTA Finance', 'reservationist', true)
ON CONFLICT (route_path, role) DO UPDATE SET allowed = EXCLUDED.allowed;

COMMIT;

