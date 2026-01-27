import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"] & {
  staff_subrole?: StaffSubrole | null;
};
type Role = "student" | "staff" | "superadmin" | "partner" | "admin" | StaffSubrole;
export type StaffSubrole = "operations_manager" | "reservationist" | "accountant" | "front_desk" | "maintenance_officer" | "housekeeper";

type AuthContextValue = {
  user: User | null;
  profile: ProfileRow | null;
  role: Role;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    metadata?: { first_name?: string; last_name?: string },
  ) => Promise<{ error?: string } | { requiresConfirmation: true; email: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
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
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUserIdRef = useRef<string | null>(null);

  const updateUser = useCallback((nextUser: User | null) => {
    currentUserIdRef.current = nextUser?.id ?? null;
    setUser(nextUser);
  }, []);

  const refreshProfile = useCallback(async (userId?: string) => {
    const idToLoad = userId ?? currentUserIdRef.current;

    if (!idToLoad) {
      setProfile(null);
      return;
    }

    try {
      const profileData = await fetchProfile(idToLoad);
      setProfile(profileData);
    } catch (error) {
      console.error("Failed to load profile:", error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setLoading(true);
      const {
        data: { session: initialSession },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error("Error retrieving session:", error);
      }

      if (!mounted) return;

      setSession(initialSession);
      updateUser(initialSession?.user ?? null);

      if (initialSession?.user) {
        await refreshProfile(initialSession.user.id);
      } else {
        setProfile(null);
      }

      setLoading(false);
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      updateUser(newSession?.user ?? null);
      
      // Handle email confirmation and password reset - redirect to appropriate reset password page
      if (event === "SIGNED_IN" && newSession?.user) {
        const hash = window.location.hash;
        const isConfirmation = hash && hash.includes("type=signup");
        const isPasswordReset = hash && hash.includes("type=recovery");
        
        // If user just confirmed email or reset password, check if we're already on the reset-password page
        if ((isConfirmation || isPasswordReset) && !window.location.pathname.includes("/reset-password")) {
          // Check user role to determine which reset password page to use
          const { data: profileData } = await supabase
            .from("profiles")
            .select("role")
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
          window.location.href = `${resetPath}${hash ? `#${hash}` : ""}`;
          return;
        }
      }
      
      // Only run redirect logic on SIGNED_IN event, not on TOKEN_REFRESHED or other events
      // This prevents unwanted redirects when switching tabs or window regains focus
      if (newSession?.user && event === "SIGNED_IN") {
        refreshProfile(newSession.user.id).then(() => {
          // After profile is loaded, check if staff user is on wrong portal and redirect
          setTimeout(() => {
            const currentPath = window.location.pathname;
            const isOnPortal = currentPath.startsWith("/portal");
            const isOnAdmin = currentPath.startsWith("/admin");
            const isOnPartner = currentPath.startsWith("/partner");
            
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
                const isStaff = userRole === "staff" || userRole === "superadmin" || userRole === "admin" || 
                               userRole === "operations_manager" || userRole === "reservationist" || 
                               userRole === "accountant" || userRole === "front_desk" ||
                               userSubrole === "maintenance_officer" || userSubrole === "housekeeper";
                const isPartner = userRole === "partner";
                const isStudent = userRole === "student";
                
                // Only redirect if user is on the WRONG portal, not if already on correct portal
                // Staff users: only redirect if on portal, not if already on admin routes
                if (isStaff && isOnPortal) {
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
        }).catch((error) =>
          console.error("Error loading profile after auth change:", error),
        );
      } else if (!newSession?.user) {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refreshProfile, updateUser]);

  const signIn = useCallback(async (email: string, password: string) => {
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
    await refreshProfile(data.user.id);
    return {};
  }, [refreshProfile, updateUser]);

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
            redirect_to: `${window.location.origin}/portal/reset-password`,
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
      };
    },
    [user, profile, session, loading, signIn, signUp, signOut, refreshProfile],
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

