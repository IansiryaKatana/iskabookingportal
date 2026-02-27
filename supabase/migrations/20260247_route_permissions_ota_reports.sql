-- OTA Reports page: add route_permissions for /ota-bookings/reports (OTA Studio Income Summary)
-- So Permissions UI can manage access for staff and sub-roles.

INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  ('/ota-bookings/reports', 'OTA Reports', 'staff', true),
  ('/ota-bookings/reports', 'OTA Reports', 'superadmin', true),
  ('/ota-bookings/reports', 'OTA Reports', 'admin', true),
  ('/ota-bookings/reports', 'OTA Reports', 'operations_manager', true),
  ('/ota-bookings/reports', 'OTA Reports', 'reservationist', true)
ON CONFLICT (route_path, role) DO UPDATE
SET route_name = EXCLUDED.route_name,
    allowed = EXCLUDED.allowed;
