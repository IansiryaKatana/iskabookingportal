-- Portal Application Journey & Studio Selection: add to route_permissions so Permissions UI can control access
-- Used when staff/sub-roles click "Open journey" from Applications list/detail (same roles that can access Applications)

BEGIN;

-- Application Journey (/portal/applications/:id - StudentApplicationWizard)
INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  ('/portal/applications', 'Application Journey (Portal)', 'student', true),
  ('/portal/applications', 'Application Journey (Portal)', 'staff', true),
  ('/portal/applications', 'Application Journey (Portal)', 'superadmin', true),
  ('/portal/applications', 'Application Journey (Portal)', 'admin', true),
  ('/portal/applications', 'Application Journey (Portal)', 'operations_manager', true),
  ('/portal/applications', 'Application Journey (Portal)', 'reservationist', true),
  ('/portal/applications', 'Application Journey (Portal)', 'accountant', true),
  ('/portal/applications', 'Application Journey (Portal)', 'front_desk', true),
  ('/portal/applications', 'Application Journey (Portal)', 'maintenance_officer', true),
  ('/portal/applications', 'Application Journey (Portal)', 'housekeeper', true)
ON CONFLICT (route_path, role) DO UPDATE SET allowed = EXCLUDED.allowed;

-- Studio Selection (/portal/applications/:id/select-studio)
INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  ('/portal/applications/select-studio', 'Studio Selection (Portal)', 'student', true),
  ('/portal/applications/select-studio', 'Studio Selection (Portal)', 'staff', true),
  ('/portal/applications/select-studio', 'Studio Selection (Portal)', 'superadmin', true),
  ('/portal/applications/select-studio', 'Studio Selection (Portal)', 'admin', true),
  ('/portal/applications/select-studio', 'Studio Selection (Portal)', 'operations_manager', true),
  ('/portal/applications/select-studio', 'Studio Selection (Portal)', 'reservationist', true),
  ('/portal/applications/select-studio', 'Studio Selection (Portal)', 'accountant', true),
  ('/portal/applications/select-studio', 'Studio Selection (Portal)', 'front_desk', true),
  ('/portal/applications/select-studio', 'Studio Selection (Portal)', 'maintenance_officer', true),
  ('/portal/applications/select-studio', 'Studio Selection (Portal)', 'housekeeper', true)
ON CONFLICT (route_path, role) DO UPDATE SET allowed = EXCLUDED.allowed;

COMMIT;
