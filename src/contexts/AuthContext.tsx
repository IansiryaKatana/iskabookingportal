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

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type Role = "student" | "staff" | "superadmin" | "partner";

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
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      updateUser(newSession?.user ?? null);
      
      // Handle email confirmation - redirect to set password page
      if (event === "SIGNED_IN" && newSession?.user) {
        const hash = window.location.hash;
        const isConfirmation = hash && hash.includes("type=signup");
        const isPasswordReset = hash && hash.includes("type=recovery");
        
        // If user just confirmed email or reset password, check if we're already on the reset-password page
        if ((isConfirmation || isPasswordReset) && !window.location.pathname.includes("/reset-password")) {
          // Redirect to set password page
          window.location.href = `/portal/reset-password${hash ? `#${hash}` : ""}`;
          return;
        }
      }
      
      if (newSession?.user) {
        refreshProfile(newSession.user.id).catch((error) =>
          console.error("Error loading profile after auth change:", error),
        );
      } else {
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
    () => ({
      user,
      profile,
      role:
        (profile?.role as Role | undefined) ??
        (user?.app_metadata?.role as Role | undefined) ??
        "student",
      session,
      loading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
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

