import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

/**
 * Hook to get student name with fallback logic:
 * 1. profiles table (first_name, last_name)
 * 2. user.app_metadata (first_name, last_name)
 * 3. student_application_steps step 1 payload (first_name, last_name)
 */
export const useStudentName = () => {
  const { user, profile } = useAuth();

  // Fetch application step 1 data as fallback
  const { data: step1Data } = useQuery({
    queryKey: ["student-name-step1", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      // Try to get name from application step 1
      const { data: application } = await supabase
        .from("student_applications")
        .select("id")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!application?.id) return null;

      const { data: step1 } = await supabase
        .from("student_application_steps")
        .select("payload")
        .eq("application_id", application.id)
        .eq("step_number", 1)
        .maybeSingle();

      if (!step1?.payload) return null;

      const payload = step1.payload as any;
      return {
        first_name: payload?.first_name as string | undefined,
        last_name: payload?.last_name as string | undefined,
      };
    },
    enabled: !!user?.id && (!profile?.first_name || !profile?.last_name),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const studentName = useMemo(() => {
    // Priority 1: profiles table
    if (profile?.first_name && profile?.last_name) {
      return {
        first_name: profile.first_name,
        last_name: profile.last_name,
        full_name: `${profile.first_name} ${profile.last_name}`,
        source: "profiles" as const,
      };
    }

    // Priority 2: user.app_metadata
    const appMetadata = user?.app_metadata;
    const firstNameFromMetadata = appMetadata?.first_name as string | undefined;
    const lastNameFromMetadata = appMetadata?.last_name as string | undefined;
    if (firstNameFromMetadata && lastNameFromMetadata) {
      return {
        first_name: firstNameFromMetadata,
        last_name: lastNameFromMetadata,
        full_name: `${firstNameFromMetadata} ${lastNameFromMetadata}`,
        source: "app_metadata" as const,
      };
    }

    // Priority 3: application step 1
    if (step1Data?.first_name && step1Data?.last_name) {
      return {
        first_name: step1Data.first_name,
        last_name: step1Data.last_name,
        full_name: `${step1Data.first_name} ${step1Data.last_name}`,
        source: "application_step" as const,
      };
    }

    // Fallback: partial names
    const firstName = profile?.first_name || firstNameFromMetadata || step1Data?.first_name || "";
    const lastName = profile?.last_name || lastNameFromMetadata || step1Data?.last_name || "";

    if (firstName || lastName) {
      return {
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`.trim() || "Student",
        source: "partial" as const,
      };
    }

    // Final fallback
    return {
      first_name: "",
      last_name: "",
      full_name: "Student",
      source: "fallback" as const,
    };
  }, [profile, user, step1Data]);

  return studentName;
};

