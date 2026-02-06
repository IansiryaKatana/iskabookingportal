-- Route permissions: Sales & Demographics (all roles toggleable) + Discount Campaigns (missing roles)
-- 1) Sales & Demographics (/admin/sales-reports): only staff/superadmin/admin had rows;
--    add operations_manager, reservationist, accountant, front_desk, maintenance_officer, housekeeper
--    so the Permissions UI shows a toggle for every role.
-- 2) Discount Campaigns: 20260213 added staff sub-roles except maintenance_officer and housekeeper;
--    add those so all roles can be toggled in Permissions UI.
-- Note: There is no "Deposit Campaigns" page in the app; sidebar has Cashback Campaigns and Discount Campaigns.

BEGIN;

-- Sales & Demographics: align display name with sidebar and add all staff sub-roles
UPDATE public.route_permissions
SET route_name = 'Sales & Demographics'
WHERE route_path = '/admin/sales-reports';

INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  ('/admin/sales-reports', 'Sales & Demographics', 'operations_manager', true),
  ('/admin/sales-reports', 'Sales & Demographics', 'reservationist', true),
  ('/admin/sales-reports', 'Sales & Demographics', 'accountant', true),
  ('/admin/sales-reports', 'Sales & Demographics', 'front_desk', true),
  ('/admin/sales-reports', 'Sales & Demographics', 'maintenance_officer', true),
  ('/admin/sales-reports', 'Sales & Demographics', 'housekeeper', true)
ON CONFLICT (route_path, role) DO UPDATE
SET route_name = EXCLUDED.route_name,
    allowed = EXCLUDED.allowed;

-- Discount Campaigns: add maintenance_officer and housekeeper (missing from 20260213)
INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
SELECT route_path, route_name, 'maintenance_officer', allowed
FROM public.route_permissions
WHERE route_path = '/admin/discount-campaigns'
  AND role = 'staff'
ON CONFLICT (route_path, role) DO UPDATE
SET route_name = EXCLUDED.route_name,
    allowed = EXCLUDED.allowed;

INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
SELECT route_path, route_name, 'housekeeper', allowed
FROM public.route_permissions
WHERE route_path = '/admin/discount-campaigns'
  AND role = 'staff'
ON CONFLICT (route_path, role) DO UPDATE
SET route_name = EXCLUDED.route_name,
    allowed = EXCLUDED.allowed;

COMMIT;
