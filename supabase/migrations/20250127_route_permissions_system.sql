-- Route Permissions System
-- Allows dynamic management of which roles can access which routes
-- This is UI-level only - RLS policies remain unchanged

BEGIN;

-- Create route_permissions table
CREATE TABLE IF NOT EXISTS public.route_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_path TEXT NOT NULL,
  route_name TEXT NOT NULL,
  role TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(route_path, role)
);

-- Add comment
COMMENT ON TABLE public.route_permissions IS 
  'Stores which roles have access to which routes. UI-level permissions only. RLS policies remain unchanged.';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_route_permissions_route_path ON public.route_permissions(route_path);
CREATE INDEX IF NOT EXISTS idx_route_permissions_role ON public.route_permissions(role);
CREATE INDEX IF NOT EXISTS idx_route_permissions_allowed ON public.route_permissions(allowed) WHERE allowed = true;

-- Enable RLS
ALTER TABLE public.route_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only staff/superadmin/admin can view and manage permissions
CREATE POLICY "Staff can view route permissions" ON public.route_permissions
  FOR SELECT
  USING (public.is_staff() OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE POLICY "Staff can manage route permissions" ON public.route_permissions
  FOR ALL
  USING (public.is_staff() OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ))
  WITH CHECK (public.is_staff() OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

-- Create function to check if a role has access to a route
CREATE OR REPLACE FUNCTION public.can_access_route(p_route_path TEXT, p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- If no permission record exists, default to false (strict mode)
  -- You can change this to true if you want permissive mode
  SELECT COALESCE(
    (SELECT allowed FROM public.route_permissions 
     WHERE route_path = p_route_path AND role = p_role),
    false
  );
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.can_access_route(TEXT, TEXT) TO anon, authenticated, service_role;

-- Create function to get all route permissions for a role
CREATE OR REPLACE FUNCTION public.get_route_permissions_for_role(p_role TEXT)
RETURNS TABLE (
  route_path TEXT,
  route_name TEXT,
  allowed BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT route_path, route_name, allowed
  FROM public.route_permissions
  WHERE role = p_role
  ORDER BY route_path;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_route_permissions_for_role(TEXT) TO anon, authenticated, service_role;

-- Insert default route definitions (all routes from the app)
-- These are the routes that can be managed
INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  -- Portal routes
  ('/portal', 'Portal Dashboard', 'student', true),
  ('/portal', 'Portal Dashboard', 'superadmin', true),
  ('/portal/payments', 'Portal Payments', 'student', true),
  ('/portal/payments', 'Portal Payments', 'superadmin', true),
  ('/portal/contracts', 'Portal Contracts', 'student', true),
  ('/portal/contracts', 'Portal Contracts', 'superadmin', true),
  ('/portal/documents', 'Portal Documents', 'student', true),
  ('/portal/documents', 'Portal Documents', 'superadmin', true),
  ('/portal/notifications', 'Portal Notifications', 'student', true),
  ('/portal/notifications', 'Portal Notifications', 'superadmin', true),
  ('/portal/maintenance', 'Portal Maintenance', 'student', true),
  ('/portal/maintenance', 'Portal Maintenance', 'superadmin', true),
  ('/portal/profile', 'Portal Profile', 'student', true),
  ('/portal/profile', 'Portal Profile', 'superadmin', true),
  
  -- Admin routes - staff and superadmin
  ('/admin', 'Admin Dashboard', 'staff', true),
  ('/admin', 'Admin Dashboard', 'superadmin', true),
  ('/admin/academic-years', 'Academic Years', 'staff', true),
  ('/admin/academic-years', 'Academic Years', 'superadmin', true),
  ('/admin/studio-grades', 'Studio Grades', 'staff', true),
  ('/admin/studio-grades', 'Studio Grades', 'superadmin', true),
  ('/admin/payment-plans', 'Payment Plans', 'staff', true),
  ('/admin/payment-plans', 'Payment Plans', 'superadmin', true),
  ('/admin/contracts', 'Contracts', 'staff', true),
  ('/admin/contracts', 'Contracts', 'superadmin', true),
  ('/admin/studios', 'Studios', 'staff', true),
  ('/admin/studios', 'Studios', 'superadmin', true),
  ('/admin/applications', 'Applications', 'staff', true),
  ('/admin/applications', 'Applications', 'superadmin', true),
  ('/admin/students', 'Students', 'staff', true),
  ('/admin/students', 'Students', 'superadmin', true),
  ('/admin/payment-history', 'Payment History', 'staff', true),
  ('/admin/payment-history', 'Payment History', 'superadmin', true),
  ('/admin/reports', 'Reports', 'staff', true),
  ('/admin/reports', 'Reports', 'superadmin', true),
  ('/admin/booking-calendar', 'Booking Calendar', 'staff', true),
  ('/admin/booking-calendar', 'Booking Calendar', 'superadmin', true),
  ('/admin/refunds', 'Refunds', 'staff', true),
  ('/admin/refunds', 'Refunds', 'superadmin', true),
  ('/admin/financial-forecast', 'Financial Forecast', 'staff', true),
  ('/admin/financial-forecast', 'Financial Forecast', 'superadmin', true),
  ('/admin/accounting-reports', 'Accounting Reports', 'staff', true),
  ('/admin/accounting-reports', 'Accounting Reports', 'superadmin', true),
  ('/admin/fully-paid-students', 'Fully Paid Students', 'staff', true),
  ('/admin/fully-paid-students', 'Fully Paid Students', 'superadmin', true),
  ('/admin/cashback-campaigns', 'Cashback Campaigns', 'staff', true),
  ('/admin/cashback-campaigns', 'Cashback Campaigns', 'superadmin', true),
  ('/admin/partners', 'Partners', 'staff', true),
  ('/admin/partners', 'Partners', 'superadmin', true),
  ('/admin/partner-commissions', 'Partner Commissions', 'staff', true),
  ('/admin/partner-commissions', 'Partner Commissions', 'superadmin', true),
  ('/admin/weekly-payment-report', 'Weekly Payment Report', 'staff', true),
  ('/admin/weekly-payment-report', 'Weekly Payment Report', 'superadmin', true),
  ('/admin/data-import', 'Data Import', 'staff', true),
  ('/admin/data-import', 'Data Import', 'superadmin', true),
  ('/admin/manual-payment-entry', 'Manual Payment Entry', 'staff', true),
  ('/admin/manual-payment-entry', 'Manual Payment Entry', 'superadmin', true),
  ('/admin/expenses', 'Expenses', 'staff', true),
  ('/admin/expenses', 'Expenses', 'superadmin', true),
  ('/admin/maintenance', 'Maintenance', 'staff', true),
  ('/admin/maintenance', 'Maintenance', 'superadmin', true),
  ('/admin/bulk-messages', 'Bulk Messages', 'staff', true),
  ('/admin/bulk-messages', 'Bulk Messages', 'superadmin', true),
  ('/admin/targeted-messages', 'Targeted Messages', 'staff', true),
  ('/admin/targeted-messages', 'Targeted Messages', 'superadmin', true),
  ('/admin/email-templates', 'Email Templates', 'staff', true),
  ('/admin/email-templates', 'Email Templates', 'superadmin', true),
  ('/admin/docusign-templates', 'DocuSign Templates', 'staff', true),
  ('/admin/docusign-templates', 'DocuSign Templates', 'superadmin', true),
  ('/admin/branding', 'Branding', 'staff', true),
  ('/admin/branding', 'Branding', 'superadmin', true),
  ('/admin/settings', 'Settings', 'staff', true),
  ('/admin/settings', 'Settings', 'superadmin', true),
  ('/admin/audit-logs', 'Audit Logs', 'staff', true),
  ('/admin/audit-logs', 'Audit Logs', 'superadmin', true),
  ('/admin/users', 'Users', 'staff', true),
  ('/admin/users', 'Users', 'superadmin', true),
  ('/admin/permissions', 'Permissions', 'staff', true),
  ('/admin/permissions', 'Permissions', 'superadmin', true),
  
  -- Partner routes
  ('/partner', 'Partner Dashboard', 'partner', true),
  ('/partner', 'Partner Dashboard', 'superadmin', true),
  ('/partner/referrals', 'Partner Referrals', 'partner', true),
  ('/partner/referrals', 'Partner Referrals', 'superadmin', true),
  ('/partner/commissions', 'Partner Commissions', 'partner', true),
  ('/partner/commissions', 'Partner Commissions', 'superadmin', true),
  ('/partner/profile', 'Partner Profile', 'partner', true),
  ('/partner/profile', 'Partner Profile', 'superadmin', true)
ON CONFLICT (route_path, role) DO NOTHING;

-- Add admin role permissions (default: same as staff)
INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
SELECT route_path, route_name, 'admin', allowed
FROM public.route_permissions
WHERE role = 'staff'
ON CONFLICT (route_path, role) DO NOTHING;

-- Add staff sub-role permissions (default: same as staff)
INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
SELECT route_path, route_name, 'operations_manager', allowed
FROM public.route_permissions
WHERE role = 'staff'
ON CONFLICT (route_path, role) DO NOTHING;

INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
SELECT route_path, route_name, 'reservationist', allowed
FROM public.route_permissions
WHERE role = 'staff'
ON CONFLICT (route_path, role) DO NOTHING;

INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
SELECT route_path, route_name, 'accountant', allowed
FROM public.route_permissions
WHERE role = 'staff'
ON CONFLICT (route_path, role) DO NOTHING;

INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
SELECT route_path, route_name, 'front_desk', allowed
FROM public.route_permissions
WHERE role = 'staff'
ON CONFLICT (route_path, role) DO NOTHING;

COMMIT;

