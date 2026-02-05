-- Add route_permissions for Discount Campaigns (mirror Cashback Campaigns)
-- Seed for staff/superadmin, then copy to admin + staff sub-roles

BEGIN;

-- Base entries for staff and superadmin
INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  ('/admin/discount-campaigns', 'Discount Campaigns', 'staff', true),
  ('/admin/discount-campaigns', 'Discount Campaigns', 'superadmin', true)
ON CONFLICT (route_path, role) DO UPDATE
SET route_name = EXCLUDED.route_name,
    allowed = EXCLUDED.allowed;

-- Admin role (same default as staff)
INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
SELECT route_path, route_name, 'admin', allowed
FROM public.route_permissions
WHERE route_path = '/admin/discount-campaigns'
  AND role = 'staff'
ON CONFLICT (route_path, role) DO UPDATE
SET route_name = EXCLUDED.route_name,
    allowed = EXCLUDED.allowed;

-- Staff sub-roles (same default as staff)
INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
SELECT route_path, route_name, 'operations_manager', allowed
FROM public.route_permissions
WHERE route_path = '/admin/discount-campaigns'
  AND role = 'staff'
ON CONFLICT (route_path, role) DO UPDATE
SET route_name = EXCLUDED.route_name,
    allowed = EXCLUDED.allowed;

INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
SELECT route_path, route_name, 'reservationist', allowed
FROM public.route_permissions
WHERE route_path = '/admin/discount-campaigns'
  AND role = 'staff'
ON CONFLICT (route_path, role) DO UPDATE
SET route_name = EXCLUDED.route_name,
    allowed = EXCLUDED.allowed;

INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
SELECT route_path, route_name, 'accountant', allowed
FROM public.route_permissions
WHERE route_path = '/admin/discount-campaigns'
  AND role = 'staff'
ON CONFLICT (route_path, role) DO UPDATE
SET route_name = EXCLUDED.route_name,
    allowed = EXCLUDED.allowed;

INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
SELECT route_path, route_name, 'front_desk', allowed
FROM public.route_permissions
WHERE route_path = '/admin/discount-campaigns'
  AND role = 'staff'
ON CONFLICT (route_path, role) DO UPDATE
SET route_name = EXCLUDED.route_name,
    allowed = EXCLUDED.allowed;

COMMIT;
