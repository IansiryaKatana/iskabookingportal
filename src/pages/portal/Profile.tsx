import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save, Lock } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentName } from "@/hooks/useStudentName";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const profileSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().optional(),
});

const passwordSchema = z.object({
  current_password: z.string().min(6, "Current password is required"),
  new_password: z.string().min(6, "New password must be at least 6 characters"),
  confirm_password: z.string().min(6, "Confirm password is required"),
}).refine((data) => data.new_password === data.confirm_password, {
  message: "Passwords don't match",
  path: ["confirm_password"],
});

const Profile = () => {
  const { user, profile, refreshProfile, loading } = useAuth();
  const studentName = useStudentName();
  const { toast } = useToast();
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  // Initialize forms BEFORE any conditional returns (Rules of Hooks)
  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: studentName.first_name,
      last_name: studentName.last_name,
      email: user?.email ?? "",
      phone: profile?.phone ?? "",
    },
  });

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
  });

  useEffect(() => {
    if (!loading) {
      // Small delay to show skeleton briefly for better UX
      const timer = setTimeout(() => setProfileLoading(false), 300);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  // Update form values when profile loads or student name changes
  useEffect(() => {
    if (profile || user || studentName) {
      profileForm.reset({
        first_name: studentName.first_name,
        last_name: studentName.last_name,
        email: user?.email ?? "",
        phone: profile?.phone ?? "",
      });
    }
  }, [profile, user, studentName, profileForm]);

  // Fallback: Sync names from app_metadata or application step if profile names are missing (non-breaking addition)
  useEffect(() => {
    if (!user?.id) {
      return;
    }
    
    // Only sync if BOTH names are missing (to avoid overwriting partial data)
    if (profile?.first_name && profile?.last_name) {
      return;
    }

    // Try to get names from app_metadata
    const appMetadata = user?.app_metadata;
    const firstNameFromMetadata = appMetadata?.first_name as string | undefined;
    const lastNameFromMetadata = appMetadata?.last_name as string | undefined;

    // If we have names from metadata and profile is missing them, sync
    if ((firstNameFromMetadata || lastNameFromMetadata) && (!profile?.first_name || !profile?.last_name)) {
      // Update profile with metadata (non-blocking, doesn't affect UI)
      supabase
        .from("profiles")
        .update({
          first_name: firstNameFromMetadata || profile?.first_name || null,
          last_name: lastNameFromMetadata || profile?.last_name || null,
        })
        .eq("id", user.id)
        .then(({ error }) => {
          if (error) {
            console.error("Failed to sync profile names from metadata:", error);
          } else {
            // Refresh profile to update UI
            refreshProfile();
          }
        })
        .catch((err) => {
          console.error("Error syncing profile names from metadata:", err);
          // Don't break anything, just log the error
        });
    }
    
    // Also try to sync from application step 1 if still missing
    if ((!profile?.first_name || !profile?.last_name) && user.id) {
      supabase
        .from("student_applications")
        .select("id")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data: application }) => {
          if (application?.id) {
            return supabase
              .from("student_application_steps")
              .select("payload")
              .eq("application_id", application.id)
              .eq("step_number", 1)
              .maybeSingle();
          }
          return { data: null, error: null };
        })
        .then(({ data: step1 }) => {
          if (step1?.payload) {
            const payload = step1.payload as any;
            const firstNameFromStep = payload?.first_name as string | undefined;
            const lastNameFromStep = payload?.last_name as string | undefined;
            
            if ((firstNameFromStep || lastNameFromStep) && (!profile?.first_name || !profile?.last_name)) {
              return supabase
                .from("profiles")
                .update({
                  first_name: firstNameFromStep || profile?.first_name || null,
                  last_name: lastNameFromStep || profile?.last_name || null,
                })
                .eq("id", user.id);
            }
          }
          return { error: null };
        })
        .then(({ error }) => {
          if (error) {
            console.error("Failed to sync profile names from application step:", error);
          } else {
            refreshProfile();
          }
        })
        .catch((err) => {
          console.error("Error syncing profile names from application step:", err);
        });
    }
  }, [user, profile, refreshProfile]);

  const ProfileSkeleton = () => (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Card className="rounded-3xl border border-border/60 shadow-xl">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-40 rounded-md" />
        </CardContent>
      </Card>
      <Card className="rounded-3xl border border-border/60 shadow-xl">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-44 rounded-md" />
        </CardContent>
      </Card>
    </div>
  );

  if (loading || profileLoading) {
    return (
      <PortalLayout>
        <ProfileSkeleton />
      </PortalLayout>
    );
  }

  const handleProfileSubmit = async (values: z.infer<typeof profileSchema>) => {
    setIsSavingProfile(true);
    try {
      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          first_name: values.first_name,
          last_name: values.last_name,
          phone: values.phone || null,
        })
        .eq("id", user?.id);

      if (profileError) throw profileError;

      // Update email if changed
      if (values.email !== user?.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: values.email,
        });

        if (emailError) throw emailError;
      }

      await refreshProfile();
      toast({
        title: "Profile updated",
        description: "Your profile information has been saved successfully.",
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error instanceof Error ? error.message : "Unable to update profile. Please try again.",
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (values: z.infer<typeof passwordSchema>) => {
    setIsChangingPassword(true);
    try {
      // Verify current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email ?? "",
        password: values.current_password,
      });

      if (signInError) {
        throw new Error("Current password is incorrect");
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: values.new_password,
      });

      if (updateError) throw updateError;

      passwordForm.reset();
      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
      });
    } catch (error) {
      console.error("Error changing password:", error);
      toast({
        variant: "destructive",
        title: "Password change failed",
        description: error instanceof Error ? error.message : "Unable to change password. Please try again.",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <PortalLayout>
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-display font-black uppercase tracking-wide">
            Profile Settings
          </h2>
          <p className="text-muted-foreground text-sm mt-2">
            Update your contact information and manage your account.
          </p>
        </div>

        {/* Profile Information */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl font-display uppercase tracking-wide">
              Personal Information
            </CardTitle>
            <CardDescription>
              Update your name, email, and phone number.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...profileForm}>
              <form
                onSubmit={profileForm.handleSubmit(handleProfileSubmit)}
                className="space-y-6"
              >
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField
                    control={profileForm.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="First name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="last_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Last name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={profileForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="+44 7xxx xxxxxx" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="rounded-md uppercase tracking-wide gap-2"
                  disabled={isSavingProfile}
                >
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl font-display uppercase tracking-wide flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Change Password
            </CardTitle>
            <CardDescription>
              Update your password to keep your account secure.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...passwordForm}>
              <form
                onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)}
                className="space-y-6"
              >
                <FormField
                  control={passwordForm.control}
                  name="current_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="new_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="confirm_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="rounded-md uppercase tracking-wide gap-2"
                  disabled={isChangingPassword}
                >
                  {isChangingPassword ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Changing...
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      Change Password
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
};

export default Profile;

