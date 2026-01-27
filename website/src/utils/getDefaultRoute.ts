import { supabase } from "@/integrations/supabase/client";

/**
 * Get the default route for a user based on their role and permissions
 * Returns the first accessible route, or null if none found
 */
export async function getDefaultRouteForRole(role: string): Promise<string | null> {
  if (!role) return null;

  // Define role-specific default routes (in priority order)
  const roleDefaultRoutes: Record<string, string[]> = {
    maintenance_officer: ["/maintenance", "/maintenance/job-management", "/maintenance/out-of-order"],
    housekeeper: ["/housekeeping", "/housekeeping/roster"],
    reservationist: ["/ota-bookings", "/ota-bookings/booking-chart", "/ota-bookings/studio-allocation"],
    operations_manager: ["/maintenance", "/housekeeping", "/ota-bookings", "/admin"],
    accountant: ["/admin", "/admin/payment-history", "/admin/reports"],
    front_desk: ["/admin", "/admin/applications", "/admin/students"],
    staff: ["/admin"],
    superadmin: ["/admin"],
    admin: ["/admin"],
  };

  // Get default routes for this role
  const defaultRoutes = roleDefaultRoutes[role] || ["/admin"];

  // Check permissions for each route in priority order
  const rolesToCheck = [role];
  if (role === "operations_manager" || role === "reservationist" || role === "accountant" || role === "front_desk" || role === "maintenance_officer" || role === "housekeeper") {
    rolesToCheck.push("staff");
  }

  // Fetch permissions for all default routes
  const { data: permissions, error } = await supabase
    .from("route_permissions")
    .select("route_path, role, allowed")
    .in("route_path", defaultRoutes)
    .in("role", rolesToCheck);

  if (error) {
    console.error("Error fetching route permissions for default route:", error);
    // Fallback to first default route if error
    return defaultRoutes[0] || "/admin";
  }

  // Check each route in priority order
  for (const route of defaultRoutes) {
    // Check if staff is explicitly denied (denies all subroles)
    if (rolesToCheck.includes("staff") && role !== "staff") {
      const staffPerm = permissions?.find((p) => p.route_path === route && p.role === "staff");
      if (staffPerm && !staffPerm.allowed) {
        continue; // Skip this route if staff is denied
      }
    }

    // Check specific role permission
    const specificPerm = permissions?.find((p) => p.route_path === route && p.role === role);
    if (specificPerm) {
      if (specificPerm.allowed === true) {
        return route; // Found accessible route
      }
      continue; // Explicitly denied, try next
    }

    // For subroles: If no specific record, they need explicit permission (no inheritance)
    if (role === "operations_manager" || role === "reservationist" || role === "accountant" || role === "front_desk" || role === "maintenance_officer" || role === "housekeeper") {
      // Check if staff has permission (subroles can inherit if no explicit record)
      const staffPerm = permissions?.find((p) => p.route_path === route && p.role === "staff");
      if (staffPerm && staffPerm.allowed === true) {
        return route; // Inherit from staff if allowed
      }
      continue; // No explicit permission for subrole
    }

    // For top-level roles: If no record, default to allowing
    return route;
  }

  // If no accessible route found, return first default (fallback)
  return defaultRoutes[0] || "/admin";
}

