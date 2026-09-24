import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { userMustChangePassword } from "@/utils/mustChangePassword";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useBrandingSettings } from "@/hooks/useBranding";
import { validatePassword } from "@/utils/passwordStrength";
import { PasswordRequirementsChecklist } from "@/components/PasswordRequirementsChecklist";

const PortalForceChangePassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refreshProfile } = useAuth();
  const { data: brandingSettings } = useBrandingSettings();
  const companyName = brandingSettings?.company_name || "Urban Hub";

  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Target destination if student was heading to an application or specific route
  const targetRedirect =
    (location.state as { from?: string } | null)?.from || "/portal";

  useEffect(() => {
    if (!user) {
      navigate("/portal/login", { replace: true });
      return;
    }
    if (!userMustChangePassword(user)) {
      navigate(targetRedirect, { replace: true });
    }
  }, [user, navigate, targetRedirect]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!currentPassword.trim()) {
      setError("Enter your current (temporary) password to continue");
      return;
    }

    const validation = validatePassword(password);
    if (!validation.isValid) {
      setError(
        validation.errors[0] ||
          "Password must be at least 8 characters and include uppercase, lowercase, number, and special character",
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password === currentPassword) {
      setError("New password must be different from your current password");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        current_password: currentPassword,
        data: {
          ...(user?.user_metadata || {}),
          account_status: "activated",
          activated_at: new Date().toISOString(),
        },
      });

      if (updateError) {
        const message = updateError.message || "Failed to update password";
        if (
          message.toLowerCase().includes("current password") ||
          updateError.code === "current_password_mismatch" ||
          updateError.code === "current_password_required"
        ) {
          setError("Current password is incorrect. Enter the temporary password you used to sign in.");
        } else {
          setError(message);
        }
        setIsSubmitting(false);
        return;
      }

      const { data: clearData, error: clearError } = await supabase.functions.invoke(
        "clear-must-change-password",
        { body: {} },
      );

      if (clearError || clearData?.error) {
        setError(clearError?.message || clearData?.error || "Password updated but flag clear failed. Please contact support.");
        setIsSubmitting(false);
        return;
      }

      await supabase.auth.refreshSession();
      await refreshProfile(user?.id);

      toast.success("Password updated successfully");
      // Hard navigate to target destination (e.g. /portal/applications/:id) so AuthContext picks up refreshed JWT
      window.location.assign(targetRedirect);
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  const isFormValid =
    currentPassword.trim().length > 0 &&
    validatePassword(password).isValid &&
    password === confirmPassword &&
    password !== currentPassword;

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-lg rounded-3xl shadow-xl border border-border/50 bg-background">
        <CardHeader>
          <CardTitle className="text-xl font-display font-bold uppercase tracking-wide">
            Set a new password
          </CardTitle>
          <CardDescription>
            Your account was opened with a temporary password. Confirm that password, then choose a new secure one to continue to {companyName}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current (temporary) password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? "text" : "password"}
                  className="pl-9 pr-10"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowCurrentPassword((v) => !v)}
                  aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="pl-9 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordRequirementsChecklist password={password} showAlways={true} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  className="pl-9 pr-10"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !isFormValid}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save password and continue"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PortalForceChangePassword;
