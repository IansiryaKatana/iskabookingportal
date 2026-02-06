-- Backfill maintenance_officer and housekeeper for every route that has staff
-- The initial seed (20250127) only added operations_manager, reservationist, accountant, front_desk.
-- So Permissions UI had no toggle for Maintenance Officer or Housekeeper on most admin pages.
-- This adds those two roles (copy allowed from staff) so every route shows all role toggles.

BEGIN;

-- maintenance_officer: add for every route that has staff
INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
SELECT route_path, route_name, 'maintenance_officer', allowed
FROM public.route_permissions
WHERE role = 'staff'
ON CONFLICT (route_path, role) DO UPDATE
SET route_name = EXCLUDED.route_name,
    allowed = EXCLUDED.allowed;

-- housekeeper: add for every route that has staff
INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
SELECT route_path, route_name, 'housekeeper', allowed
FROM public.route_permissions
WHERE role = 'staff'
ON CONFLICT (route_path, role) DO UPDATE
SET route_name = EXCLUDED.route_name,
    allowed = EXCLUDED.allowed;

COMMIT;
