-- Reports page: ensure full CRUD (view + export CSV/PDF) is manageable in Permissions for all roles.
-- Operational reports only; OTA Studio Income Summary lives under OTA → OTA Reports.

INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  ('/admin/reports', 'Reports', 'staff', true),
  ('/admin/reports', 'Reports', 'superadmin', true),
  ('/admin/reports', 'Reports', 'admin', true),
  ('/admin/reports', 'Reports', 'operations_manager', true),
  ('/admin/reports', 'Reports', 'reservationist', true),
  ('/admin/reports', 'Reports', 'accountant', true),
  ('/admin/reports', 'Reports', 'front_desk', true),
  ('/admin/reports', 'Reports', 'maintenance_officer', false),
  ('/admin/reports', 'Reports', 'housekeeper', false)
ON CONFLICT (route_path, role) DO UPDATE
SET route_name = EXCLUDED.route_name,
    allowed = EXCLUDED.allowed;
