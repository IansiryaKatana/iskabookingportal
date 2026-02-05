-- Add missing route_permissions so the Permissions UI can manage all app access
-- Covers: /admin/sales-reports, /admin/bulk-invitations, /admin/secrets,
--         and maintenance_officer for /maintenance/out-of-order

BEGIN;

-- Sales Reports (staff/superadmin/admin; sub-roles can be toggled in UI once these exist)
INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  ('/admin/sales-reports', 'Sales Reports', 'staff', true),
  ('/admin/sales-reports', 'Sales Reports', 'superadmin', true),
  ('/admin/sales-reports', 'Sales Reports', 'admin', true)
ON CONFLICT (route_path, role) DO UPDATE SET allowed = EXCLUDED.allowed;

-- Bulk Invitations
INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  ('/admin/bulk-invitations', 'Bulk Invitations', 'staff', true),
  ('/admin/bulk-invitations', 'Bulk Invitations', 'superadmin', true),
  ('/admin/bulk-invitations', 'Bulk Invitations', 'admin', true)
ON CONFLICT (route_path, role) DO UPDATE SET allowed = EXCLUDED.allowed;

-- Secrets (superadmin only in App; add so it appears in Permissions UI)
INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  ('/admin/secrets', 'Secrets', 'superadmin', true)
ON CONFLICT (route_path, role) DO UPDATE SET allowed = EXCLUDED.allowed;

-- maintenance_officer for Out of Order (App allows them; DB was missing this role for this path)
INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  ('/maintenance/out-of-order', 'Out of Order', 'maintenance_officer', true)
ON CONFLICT (route_path, role) DO UPDATE SET allowed = EXCLUDED.allowed;

COMMIT;
