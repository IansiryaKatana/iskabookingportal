-- Backfill bulk invitations route for all staff sub-roles.
-- Why: /admin/bulk-invitations was added later with only staff/superadmin/admin,
-- so sub-role toggles were missing/inconsistent for this route.

BEGIN;

INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
SELECT '/admin/bulk-invitations', 'Bulk Invitations', r.role, staff_perm.allowed
FROM (
  VALUES
    ('operations_manager'::text),
    ('reservationist'::text),
    ('accountant'::text),
    ('front_desk'::text),
    ('maintenance_officer'::text),
    ('housekeeper'::text)
) AS r(role)
CROSS JOIN LATERAL (
  SELECT allowed
  FROM public.route_permissions
  WHERE route_path = '/admin/bulk-invitations' AND role = 'staff'
  LIMIT 1
) AS staff_perm
ON CONFLICT (route_path, role) DO UPDATE
SET route_name = EXCLUDED.route_name,
    allowed = EXCLUDED.allowed;

COMMIT;

