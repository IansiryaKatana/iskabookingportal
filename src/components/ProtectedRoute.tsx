import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type ProtectedRouteProps = {
  children: React.ReactNode;
  allowedRoles: Array<"student" | "staff" | "superadmin" | "partner" | "admin" | "operations_manager" | "reservationist" | "accountant" | "front_desk" | "maintenance_officer" | "housekeeper">;
  checkDatabase?: boolean; // Optional: if false, skips database check and uses allowedRoles only
};

const ProtectedRoute = ({ children, allowedRoles, checkDatabase = true }: ProtectedRouteProps) => {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  // Check database permissions (default: enabled)
  // Falls back to allowedRoles if database check fails or no record exists
  const { data: hasPermission, isLoading: checkingPermission } = useQuery({
    queryKey: ["route-permission", location.pathname, role],
    queryFn: async () => {
      if (!checkDatabase || !role) {
        // If database check is disabled, use allowedRoles
        return allowedRoles.includes(role);
      }
      
      // IMPORTANT: First check if role is in allowedRoles - if not, deny immediately
      // This prevents subroles from accessing routes they shouldn't have access to
      if (!allowedRoles.includes(role)) {
        return false;
      }
      
      // Check permission for the specific role first
      const { data: specificRoleData, error: specificError } = await supabase
        .from("route_permissions")
        .select("allowed")
        .eq("route_path", location.pathname)
        .eq("role", role)
        .maybeSingle();

      if (specificError && specificError.code !== "PGRST116") {
        // PGRST116 = no rows returned, which is fine
        console.error("Error checking route permission:", specificError);
        // Fallback to allowedRoles on error (safe default)
        return allowedRoles.includes(role);
      }

      // For sub-roles: Check staff permission first (if staff is denied, deny all sub-roles)
      if (role === "operations_manager" || role === "reservationist" || role === "accountant" || role === "front_desk" || role === "maintenance_officer" || role === "housekeeper") {
        const { data: staffData, error: staffError } = await supabase
          .from("route_permissions")
          .select("allowed")
          .eq("route_path", location.pathname)
          .eq("role", "staff")
          .maybeSingle();

        if (staffError && staffError.code !== "PGRST116") {
          console.error("Error checking staff route permission:", staffError);
          return allowedRoles.includes(role);
        }

        // If staff is explicitly denied, deny all sub-roles
        if (staffData && !staffData.allowed) {
          return false;
        }
      }

      // If specific role has a record, use it (allows per-sub-role control)
      if (specificRoleData) {
        return specificRoleData.allowed === true;
      }

      // If no specific role record, check "staff" role for staff sub-roles
      if (role === "operations_manager" || role === "reservationist" || role === "accountant" || role === "front_desk" || role === "maintenance_officer" || role === "housekeeper") {
        const { data: staffData, error: staffError } = await supabase
          .from("route_permissions")
          .select("allowed")
          .eq("route_path", location.pathname)
          .eq("role", "staff")
          .maybeSingle();

        if (staffError && staffError.code !== "PGRST116") {
          console.error("Error checking staff route permission:", staffError);
          return allowedRoles.includes(role);
        }

        // If staff role has a record, use it
        if (staffData) {
          return staffData.allowed === true;
        }
      }

      // If no permission record exists in database, fallback to allowedRoles (safe default)
      return allowedRoles.includes(role);
    },
    enabled: checkDatabase && !!role && !loading,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes to prevent unnecessary refetches
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false, // Don't refetch on window focus to prevent unwanted redirects
    refetchOnMount: false, // Don't refetch on mount if data is fresh (within staleTime)
    retry: 1, // Retry once on failure, then fallback to allowedRoles
  });

  // Show loading only if auth is loading, not if permission check is loading
  // This prevents flickering when navigating between pages
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  
  // If permission check is loading, show children (optimistic rendering)
  // The permission check will redirect if access is denied
  if (checkDatabase && checkingPermission) {
    // Return children optimistically to prevent flicker
    // ProtectedRoute will redirect if access is denied once check completes
    return <>{children}</>;
  }

  if (!user) {
    // Redirect to appropriate login page based on route
    const isAdminRoute = location.pathname.startsWith("/admin");
    const isPortalRoute = location.pathname.startsWith("/portal");
    const isPartnerRoute = location.pathname.startsWith("/partner");
    const redirectTo = isAdminRoute
      ? "/admin/login"
      : isPartnerRoute
      ? "/partner/login"
      : isPortalRoute
      ? "/portal/login"
      : "/studios";
    return (
      <Navigate
        to={redirectTo}
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  // Check permissions: use database if enabled, otherwise use allowedRoles
  const hasAccess = checkDatabase 
    ? (hasPermission ?? allowedRoles.includes(role))
    : allowedRoles.includes(role);

  if (!hasAccess) {
    // Redirect to appropriate dashboard based on role to avoid infinite loops
    const isAdminRoute = location.pathname.startsWith("/admin");
    const isPortalRoute = location.pathname.startsWith("/portal");
    const isPartnerRoute = location.pathname.startsWith("/partner");
    
    // Redirect subroles to their specific dashboards
    if (role === "maintenance_officer") {
      return <Navigate to="/maintenance" replace />;
    } else if (role === "housekeeper") {
      return <Navigate to="/housekeeping" replace />;
    } else if (role === "reservationist") {
      return <Navigate to="/ota-bookings" replace />;
    } else if (isAdminRoute) {
      return <Navigate to="/admin" replace />;
    } else if (isPortalRoute) {
      return <Navigate to="/portal" replace />;
    } else if (isPartnerRoute) {
      return <Navigate to="/partner" replace />;
    }
    
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;

