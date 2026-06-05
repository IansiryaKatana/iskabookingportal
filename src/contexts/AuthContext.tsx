import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isUnauthorizedAuthError } from "@/utils/authErrors";

const POST_AUTH_QUERY_KEYS = [
  "dashboard-stats",
  "dashboard-breakdowns",
  "active-cashback-campaigns",
  "manual-payment-requests-pending-count",
] as const;

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"] & {
  staff_subrole?: StaffSubrole | null;
};
type Role = "student" | "staff" | "superadmin" | "partner" | "admin" | StaffSubrole;
export type StaffSubrole = "operations_manager" | "reservationist" | "accountant" | "front_desk" | "maintenance_officer" | "housekeeper";

/** Returns true if the error was an invalid/expired refresh token and session was cleared */
function isInvalidRefreshTokenError(error: unknown): boolean {
  const msg = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message)
    : "";
  return msg.includes("Refresh Token") || msg.includes("refresh_token") || msg.includes("Invalid Refresh Token");
}

type AuthContextValue = {
  user: User | null;
  profile: ProfileRow | null;
  role: Role;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string; effectiveRole?: string }>;
  signUp: (
    email: string,
    password: string,
    metadata?: { first_name?: string; last_name?: string },
  ) => Promise<{ error?: string } | { requiresConfirmation: true; email: string }>;
  signOut: () => Promise<void>;
  refreshProfile: (userId?: string) => Promise<ProfileRow | null>;
  /** If error is invalid refresh token, signs out and returns true so UI can show "Session expired" */
  clearSessionIfExpired: (error: unknown) => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const fetchProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
};

type AuthProviderProps = {
  children: React.ReactNode;
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUserIdRef = useRef<string | null>(null);
  const signingInRef = useRef(false);

  const invalidatePostAuthQueries = useCallback(async () => {
    await Promise.all(
      POST_AUTH_QUERY_KEYS.map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
  }, [queryClient]);

  const updateUser = useCallback((nextUser: User | null) => {
    currentUserIdRef.current = nextUser?.id ?? null;
    setUser(nextUser);
  }, []);

  const clearInvalidSession = useCallback(async () => {
    await supabase.auth.signOut({ scope: "local" });
    setSession(null);
    updateUser(null);
    setProfile(null);
  }, [updateUser]);

  const refreshProfile = useCallback(async (userId?: string): Promise<ProfileRow | null> => {
    const idToLoad = userId ?? currentUserIdRef.current;

    if (!idToLoad) {
      setProfile(null);
      return null;
    }

    try {
      const profileData = await fetchProfile(idToLoad);
      setProfile(profileData);
      return profileData;
    } catch (error) {
      console.error("Failed to load profile:", error);
      if (isUnauthorizedAuthError(error) || isInvalidRefreshTokenError(error)) {
        await clearInvalidSession();
      }
      return null;
    }
  }, [clearInvalidSession]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setLoading(true);

      const {
        data: { session: initialSession },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("Error retrieving session:", sessionError);
        if (isUnauthorizedAuthError(sessionError) || isInvalidRefreshTokenError(sessionError)) {
          await clearInvalidSession();
        }
        if (mounted) setLoading(false);
        return;
      }

      if (!initialSession?.user) {
        if (mounted) {
          setSession(null);
          updateUser(null);
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      if (!mounted) return;

      setSession(initialSession);
      updateUser(initialSession.user);

      const [{ data: { user: validatedUser }, error: userError }] = await Promise.all([
        supabase.auth.getUser(),
        refreshProfile(initialSession.user.id),
      ]);

      if (userError || !validatedUser) {
        console.error("Error validating session:", userError);
        if (isUnauthorizedAuthError(userError) || isInvalidRefreshTokenError(userError)) {
          await clearInvalidSession();
        }
      }

      if (mounted) setLoading(false);
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      updateUser(newSession?.user ?? null);
      
      const hash = window.location.hash;
      const isConfirmation = hash && hash.includes("type=signup");
      const isRecoveryHash = hash && hash.includes("type=recovery");
      
      // Handle PASSWORD_RECOVERY event or recovery hash - redirect to appropriate reset password page
      if ((event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && isRecoveryHash)) && newSession?.user) {
        if (!window.location.pathname.includes("/reset-password")) {
          // Check user role to determine which reset password page to use
          const { data: profileData } = await supabase
            .from("profiles")
            .select("role, staff_subrole")
            .eq("id", newSession.user.id)
            .maybeSingle();
          
          const userRole = profileData?.role;
          const userSubrole = profileData?.staff_subrole;
          const isStaff = userRole === "staff" || userRole === "superadmin" || userRole === "admin" || 
                         userRole === "operations_manager" || userRole === "reservationist" || 
                         userRole === "accountant" || userRole === "front_desk" ||
                         userSubrole === "maintenance_officer" || userSubrole === "housekeeper";
          
          // Redirect to appropriate reset password page based on role
          const resetPath = isStaff ? "/admin/reset-password" : "/portal/reset-password";
          console.log(`AuthContext: Redirecting ${isStaff ? 'staff' : 'student'} to ${resetPath} for password recovery`);
          window.location.href = `${resetPath}${hash ? `#${hash}` : ""}`;
          return;
        }
      }

      // Handle email confirmation - redirect to appropriate reset password page
      if (event === "SIGNED_IN" && newSession?.user && isConfirmation) {
        if (!window.location.pathname.includes("/reset-password")) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("role, staff_subrole")
            .eq("id", newSession.user.id)
            .maybeSingle();
          
          const userRole = profileData?.role;
          const userSubrole = profileData?.staff_subrole;
          const isStaff = userRole === "staff" || userRole === "superadmin" || userRole === "admin" || 
                         userRole === "operations_manager" || userRole === "reservationist" || 
                         userRole === "accountant" || userRole === "front_desk" ||
                         userSubrole === "maintenance_officer" || userSubrole === "housekeeper";
          
          const resetPath = isStaff ? "/admin/reset-password" : "/portal/reset-password";
          console.log(`AuthContext: Redirecting ${isStaff ? 'staff' : 'student'} to ${resetPath} for signup confirmation`);
          window.location.href = `${resetPath}${hash ? `#${hash}` : ""}`;
          return;
        }
      }
      
      // Prevent dashboard redirect if we are currently on a recovery/reset page
      const isCurrentlyOnResetPage = window.location.pathname.includes("/reset-password");
      if (isCurrentlyOnResetPage) return;

      // Only run redirect logic on SIGNED_IN event, not on TOKEN_REFRESHED or other events
      // This prevents unwanted redirects when switching tabs or window regains focus
      if (newSession?.user && event === "SIGNED_IN") {
        if (signingInRef.current) {
          return;
        }

        setLoading(true);
        refreshProfile(newSession.user.id)
          .then(async () => {
            await invalidatePostAuthQueries();
          })
          .then(() => {
          // After profile is loaded, check if staff user is on wrong portal and redirect
          setTimeout(() => {
            const currentPath = window.location.pathname;
            const isOnPortal = currentPath.startsWith("/portal");
            const isOnAdmin = currentPath.startsWith("/admin");
            const isOnPartner = currentPath.startsWith("/partner");
            const isOnPortalApplicationJourney =
              currentPath.startsWith("/portal/applications");

            // Get profile to check role
            supabase
              .from("profiles")
              .select("role")
              .eq("id", newSession.user.id)
              .maybeSingle()
              .then(({ data: profileData }) => {
                if (!profileData) return;

                const userRole = profileData.role;
                const userSubrole = profileData.staff_subrole;
                const isStaff =
                  userRole === "staff" ||
                  userRole === "superadmin" ||
                  userRole === "admin" ||
                  userRole === "operations_manager" ||
                  userRole === "reservationist" ||
                  userRole === "accountant" ||
                  userRole === "front_desk" ||
                  userSubrole === "maintenance_officer" ||
                  userSubrole === "housekeeper";
                const isPartner = userRole === "partner";
                const isStudent = userRole === "student";

                // Only redirect if user is on the WRONG portal, not if already on correct portal
                // Staff users: only redirect if on general portal pages, but allow portal application journey routes
                if (isStaff && isOnPortal && !isOnPortalApplicationJourney) {
                  window.location.href = "/admin";
                }
                // Students: only redirect if on admin/partner portals, not if already on portal
                else if (isStudent && (isOnAdmin || isOnPartner)) {
                  window.location.href = "/portal";
                }
                // Partners: only redirect if on admin/portal, not if already on partner routes
                else if (isPartner && (isOnAdmin || isOnPortal)) {
                  window.location.href = "/partner";
                }
                // Note: We don't redirect staff users who are already on /admin/* routes
                // This allows them to stay on any admin sub-route (e.g., /admin/ota-bookings)
              });
          }, 500); // Small delay to ensure profile is loaded
        })
          .catch((error) =>
            console.error("Error loading profile after auth change:", error),
          )
          .finally(() => {
            if (mounted) setLoading(false);
          });
      } else if (!newSession?.user) {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refreshProfile, updateUser, clearInvalidSession, invalidatePostAuthQueries]);

  const signIn = useCallback(async (email: string, password: string) => {
    signingInRef.current = true;
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("Sign in failed:", error);
        return { error: error.message };
      }

      setSession(data.session);
      updateUser(data.user);
      const profileData = await refreshProfile(data.user.id);
      await invalidatePostAuthQueries();

      const effectiveRole = profileData?.staff_subrole ?? profileData?.role ?? undefined;
      return { effectiveRole };
    } finally {
      signingInRef.current = false;
      setLoading(false);
    }
  }, [refreshProfile, updateUser, invalidatePostAuthQueries]);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      metadata?: { first_name?: string; last_name?: string },
    ) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: metadata?.first_name,
            last_name: metadata?.last_name,
            role: "student",
          },
          emailRedirectTo: `${window.location.origin}/portal/reset-password`,
        },
      });

      if (error) {
        console.error("Sign up failed:", error);
        return { error: error.message };
      }

      if (!data.session || !data.user) {
        // Email confirmation is required
        // Return success with confirmation flag instead of error
        return { requiresConfirmation: true, email };
      }

      // Sync first_name and last_name to profiles table (non-breaking addition)
      if (metadata?.first_name || metadata?.last_name) {
        try {
          const { error: profileError } = await supabase
            .from("profiles")
            .update({
              first_name: metadata.first_name || null,
              last_name: metadata.last_name || null,
            })
            .eq("id", data.user.id);

          if (profileError) {
            console.error("Failed to sync profile names during registration:", profileError);
            // Don't fail registration, just log the error - registration still succeeds
          }
        } catch (err) {
          console.error("Error updating profile during registration:", err);
          // Don't fail registration, just log the error
        }
      }

      // Send custom confirmation email via Resend (even though email confirmations are disabled)
      // This sends a welcome/confirmation email using our custom Resend template
      try {
        await supabase.functions.invoke("send-confirmation-email", {
          body: {
            email: email,
            type: "signup",
            redirect_to: `https://portal.urbanhub.uk/portal/reset-password`,
          },
        });
      } catch (emailError) {
        console.error("Failed to send confirmation email:", emailError);
        // Don't fail registration, just log the error - email is sent in background
      }

      setSession(data.session);
      updateUser(data.user);
      await refreshProfile(data.user.id);
      return {};
    },
    [refreshProfile, updateUser],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    updateUser(null);
    setProfile(null);
  }, [updateUser]);

  const clearSessionIfExpired = useCallback(async (error: unknown): Promise<boolean> => {
    if (!isInvalidRefreshTokenError(error) && !isUnauthorizedAuthError(error)) return false;
    await clearInvalidSession();
    return true;
  }, [clearInvalidSession]);

  const value = useMemo(
    () => {
      // For staff with sub-roles, use the sub-role as the role
      // Otherwise, use the profile role or fallback to student
      let computedRole: Role = "student";
      
      if (profile?.staff_subrole) {
        // User has a staff sub-role, use that as the role
        computedRole = profile.staff_subrole;
      } else if (profile?.role) {
        computedRole = profile.role as Role;
      } else if (user?.app_metadata?.role) {
        computedRole = user.app_metadata.role as Role;
      }
      
      return {
        user,
        profile,
        role: computedRole,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        clearSessionIfExpired,
      };
    },
    [user, profile, session, loading, signIn, signUp, signOut, refreshProfile, clearSessionIfExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

