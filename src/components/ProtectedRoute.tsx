import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type ProtectedRouteProps = {
  children: React.ReactNode;
  allowedRoles: Array<"student" | "staff" | "superadmin" | "partner" | "admin">;
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
      
      // For staff sub-roles, check both the sub-role and "staff" role
      const rolesToCheck = [role];
      if (role === "operations_manager" || role === "reservationist" || role === "accountant" || role === "front_desk") {
        rolesToCheck.push("staff");
      }

      // Check if any of the roles have permission in database
      const { data, error } = await supabase
        .from("route_permissions")
        .select("allowed")
        .eq("route_path", location.pathname)
        .in("role", rolesToCheck)
        .eq("allowed", true)
        .limit(1);

      if (error) {
        console.error("Error checking route permission:", error);
        // Fallback to allowedRoles on error (safe default)
        return allowedRoles.includes(role);
      }

      // If no permission record exists in database, fallback to allowedRoles (safe default)
      if (!data || data.length === 0) {
        return allowedRoles.includes(role);
      }

      // Database has a record - use it
      return data.length > 0;
    },
    enabled: checkDatabase && !!role && !loading,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes for performance
    retry: 1, // Retry once on failure, then fallback to allowedRoles
  });

  if (loading || (checkDatabase && checkingPermission)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
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
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;

