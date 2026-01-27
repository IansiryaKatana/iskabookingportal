import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getDefaultRouteForRole } from "@/utils/getDefaultRoute";

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
      
      // Check permission for the specific role first (database permissions take precedence)
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

      // If specific role has an explicit record (allowed or denied), use it
      // This respects the permissions page settings and takes highest priority
      if (specificRoleData !== null) {
        return specificRoleData.allowed === true;
      }

      // For sub-roles: Route-level restrictions take precedence, then database permissions
      // CRITICAL: If sub-role is NOT in allowedRoles, deny immediately (route-level restriction)
      // This prevents sub-roles from accessing routes they shouldn't have access to
      // even if database permissions exist (e.g., maintenance_officer cannot access /admin dashboard)
      if (role === "operations_manager" || role === "reservationist" || role === "accountant" || role === "front_desk" || role === "maintenance_officer" || role === "housekeeper") {
        // Route-level check: If sub-role is NOT in allowedRoles, deny immediately
        // This is the primary security boundary and cannot be bypassed by database permissions
        if (!allowedRoles.includes(role)) {
          return false;
        }

        // Sub-role IS in allowedRoles - now check database permissions
        // Check staff permission (sub-roles inherit from staff when no explicit permission)
        const { data: staffData, error: staffError } = await supabase
          .from("route_permissions")
          .select("allowed")
          .eq("route_path", location.pathname)
          .eq("role", "staff")
          .maybeSingle();

        if (staffError && staffError.code !== "PGRST116") {
          console.error("Error checking staff route permission:", staffError);
          // Fallback to allowedRoles on error (safe default)
          return allowedRoles.includes(role) || allowedRoles.includes("staff");
        }

        // If staff has explicit permission record (allowed or denied), sub-roles inherit it
        if (staffData !== null) {
          // Respect explicit staff permission (true or false)
          return staffData.allowed === true;
        }

        // If no database permission record exists, fallback to allowedRoles
        // Sub-role is already confirmed to be in allowedRoles (checked above)
        return true;
      }

      // For non-sub-roles: If no permission record exists in database, fallback to allowedRoles (safe default)
      return allowedRoles.includes(role);
    },
    enabled: checkDatabase && !!role && !loading,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes to prevent unnecessary refetches
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false, // Don't refetch on window focus to prevent unwanted redirects
    refetchOnMount: false, // Don't refetch on mount if data is fresh (within staleTime)
    retry: 1, // Retry once on failure, then fallback to allowedRoles
  });

  // Get default route for user - ALWAYS call this hook (use enabled to control when it runs)
  // This must be called before any conditional returns to maintain hook order
  const { data: defaultRoute, isLoading: loadingDefaultRoute } = useQuery({
    queryKey: ["default-route", role],
    queryFn: () => getDefaultRouteForRole(role || ""),
    enabled: !!role && !loading, // Always enabled when we have a role, but we'll check hasAccess before using it
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
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
    // Show loading while finding default route
    if (loadingDefaultRoute || !defaultRoute) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    }

    // Redirect to user's default accessible route
    return <Navigate to={defaultRoute || "/admin"} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;

