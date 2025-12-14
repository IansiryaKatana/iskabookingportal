-- Three Modules System: Route Permissions
-- Phase 4: Add all route permissions for Maintenance, Housekeeping, and OTA Bookings modules

BEGIN;

-- ============================================================================
-- PART 1: MAINTENANCE ROUTES
-- ============================================================================

INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  -- Maintenance Dashboard
  ('/maintenance', 'Maintenance Dashboard', 'staff', true),
  ('/maintenance', 'Maintenance Dashboard', 'superadmin', true),
  ('/maintenance', 'Maintenance Dashboard', 'admin', true),
  ('/maintenance', 'Maintenance Dashboard', 'operations_manager', true),
  ('/maintenance', 'Maintenance Dashboard', 'maintenance_officer', true),
  
  -- Job Management
  ('/maintenance/job-management', 'Job Management', 'staff', true),
  ('/maintenance/job-management', 'Job Management', 'superadmin', true),
  ('/maintenance/job-management', 'Job Management', 'admin', true),
  ('/maintenance/job-management', 'Job Management', 'operations_manager', true),
  ('/maintenance/job-management', 'Job Management', 'maintenance_officer', true),
  
  -- Job Map
  ('/maintenance/job-map', 'Job Map', 'staff', true),
  ('/maintenance/job-map', 'Job Map', 'superadmin', true),
  ('/maintenance/job-map', 'Job Map', 'admin', true),
  ('/maintenance/job-map', 'Job Map', 'operations_manager', true),
  ('/maintenance/job-map', 'Job Map', 'maintenance_officer', true),
  
  -- Out of Order
  ('/maintenance/out-of-order', 'Out of Order', 'staff', true),
  ('/maintenance/out-of-order', 'Out of Order', 'superadmin', true),
  ('/maintenance/out-of-order', 'Out of Order', 'admin', true),
  ('/maintenance/out-of-order', 'Out of Order', 'operations_manager', true)
ON CONFLICT (route_path, role) DO UPDATE SET allowed = EXCLUDED.allowed;

-- ============================================================================
-- PART 2: HOUSEKEEPING ROUTES
-- ============================================================================

INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  -- Housekeeping Dashboard
  ('/housekeeping', 'Housekeeping Dashboard', 'staff', true),
  ('/housekeeping', 'Housekeeping Dashboard', 'superadmin', true),
  ('/housekeeping', 'Housekeeping Dashboard', 'admin', true),
  ('/housekeeping', 'Housekeeping Dashboard', 'operations_manager', true),
  ('/housekeeping', 'Housekeeping Dashboard', 'housekeeper', true),
  
  -- Housekeeping Roster
  ('/housekeeping/roster', 'Housekeeping Roster', 'staff', true),
  ('/housekeeping/roster', 'Housekeeping Roster', 'superadmin', true),
  ('/housekeeping/roster', 'Housekeeping Roster', 'admin', true),
  ('/housekeeping/roster', 'Housekeeping Roster', 'operations_manager', true)
ON CONFLICT (route_path, role) DO UPDATE SET allowed = EXCLUDED.allowed;

-- ============================================================================
-- PART 3: OTA BOOKINGS ROUTES
-- ============================================================================

INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  -- OTA Bookings Dashboard
  ('/ota-bookings', 'OTA Bookings Dashboard', 'staff', true),
  ('/ota-bookings', 'OTA Bookings Dashboard', 'superadmin', true),
  ('/ota-bookings', 'OTA Bookings Dashboard', 'admin', true),
  ('/ota-bookings', 'OTA Bookings Dashboard', 'operations_manager', true),
  ('/ota-bookings', 'OTA Bookings Dashboard', 'reservationist', true),
  
  -- Booking Chart
  ('/ota-bookings/booking-chart', 'Booking Chart', 'staff', true),
  ('/ota-bookings/booking-chart', 'Booking Chart', 'superadmin', true),
  ('/ota-bookings/booking-chart', 'Booking Chart', 'admin', true),
  ('/ota-bookings/booking-chart', 'Booking Chart', 'operations_manager', true),
  ('/ota-bookings/booking-chart', 'Booking Chart', 'reservationist', true),
  
  -- Studio Allocation (OTA)
  ('/ota-bookings/studio-allocation', 'Studio Allocation', 'staff', true),
  ('/ota-bookings/studio-allocation', 'Studio Allocation', 'superadmin', true),
  ('/ota-bookings/studio-allocation', 'Studio Allocation', 'admin', true),
  ('/ota-bookings/studio-allocation', 'Studio Allocation', 'operations_manager', true),
  ('/ota-bookings/studio-allocation', 'Studio Allocation', 'reservationist', true)
ON CONFLICT (route_path, role) DO UPDATE SET allowed = EXCLUDED.allowed;

-- ============================================================================
-- PART 4: DEFAULT PERMISSIONS FOR NEW SUB-ROLES (Restrictive by default)
-- ============================================================================

-- Maintenance Officer: Only maintenance routes
-- (Already added above for /maintenance routes)

-- Housekeeper: Only housekeeping dashboard (read-only, can request approval)
-- (Already added above for /housekeeping)

COMMIT;

